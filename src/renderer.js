/**
 * src/renderer.js
 *
 * Fluxtop renderer bootstrap.  Injected into Fluxer's web context
 * (https://web.fluxer.app) via webContents.executeJavaScript() from
 * src/main-inject.mjs after CSP headers have been stripped.
 *
 * Responsibilities:
 *   1. Hook into Fluxer's webpack module system (rspack / webpack 5 chunk API)
 *      so plugins can intercept any module by its module ID or by searching
 *      its exports.
 *   2. Expose a global `window.__fluxtop` API that plugins (and the settings UI)
 *      can use.
 *   3. Load and start all registered renderer-side plugins.
 *
 * ─── Module Patching ──────────────────────────────────────────────────────
 *
 * Fluxer's web bundle uses the Webpack 5 / Rspack chunk push API:
 *   webpackChunkfluxer.push([[chunkId], moduleMap, runtimeCallback])
 *
 * By wrapping the `.push()` method on `webpackChunkfluxer` (the chunk array),
 * we intercept every module factory before it is registered.  We also wrap
 * the `__webpack_require__` function on the runtime to intercept every
 * `require(moduleId)` call in the running app.
 *
 * ─────────────────────────────────────────────────────────────────────────
 */

(function fluxtopRendererBootstrap() {
  'use strict';

  // Guard against double injection.
  if (window.__fluxtop) return;

  // ---------------------------------------------------------------------------
  // Mini event emitter
  // ---------------------------------------------------------------------------

  /** @type {Map<string, Set<Function>>} */
  const _listeners = new Map();

  const events = {
    on(event, fn) {
      if (!_listeners.has(event)) _listeners.set(event, new Set());
      _listeners.get(event).add(fn);
      return () => _listeners.get(event)?.delete(fn);
    },
    emit(event, ...args) {
      _listeners.get(event)?.forEach(fn => {
        try { fn(...args); } catch (e) { console.error('[Fluxtop] Event handler threw:', e); }
      });
    },
  };

  // ---------------------------------------------------------------------------
  // Webpack patcher
  // ---------------------------------------------------------------------------

  /**
   * A patch descriptor registered by a plugin.
   * @typedef {{ filter: (exports: any, id: string|number) => boolean, callback: (exports: any, id: string|number) => any }} ModulePatch
   */

  /** @type {ModulePatch[]} */
  const _modulePatches = [];

  /** @type {Function|null}  Webpack's internal require function. */
  let _webpackRequire = null;
  /** @type {Record<string, any>|null}  Original Rspack module cache. */
  let _webpackCache = null;

  /**
   * Apply all registered patches whose filter matches `exports`.
   * @param {any}           exports
   * @param {string|number} id
   * @returns {any}
   */
  function _applyModulePatches(exports, id) {
    if (!exports || (typeof exports !== 'object' && typeof exports !== 'function')) return exports;

    let result = exports;
    for (const { filter, callback } of _modulePatches) {
      try {
        if (filter(result, id)) {
          const next = callback(result, id);
          if (next !== undefined) result = next;
          events.emit('module-patched', id);
        }
      } catch (err) {
        console.error(`[Fluxtop:Patcher] Patch callback for module "${id}" threw:`, err);
      }
    }
    return result;
  }

  function applyPatchesToCachedModules(cache, applyPatches, onError) {
    if (!cache || typeof cache !== 'object') return;
    for (const id of Object.keys(cache)) {
      const module = cache[id];
      if (!module || module.exports === undefined) continue;
      try { module.exports = applyPatches(module.exports, id); }
      catch (error) { onError?.(error, id); }
    }
  }

  /**
   * Wrap webpack's `__webpack_require__` so every module load goes through our
   * patch pipeline.
   * @param {Function} wpRequire
   */
  function _wrapWebpackRequire(wpRequire) {
    _webpackRequire = wpRequire;

    const originalRequire = wpRequire.bind({});

    // Copy all static properties (m, c, d, n, o, p, …).
    Object.assign(originalRequire, wpRequire);

    // Replace the function on the runtime object — but we can't replace the
    // reference inside closures.  Instead we wrap the module cache getter so
    // every cached access is also patched.
    if (wpRequire.c) {
      // webpack 5 module cache.
      const cache = wpRequire.c;
      _webpackCache = cache;
      const handler = {
        get(target, id) {
          const mod = target[id];
          if (mod && mod.exports !== undefined) {
            mod.exports = _applyModulePatches(mod.exports, id);
          }
          return mod;
        },
      };
      try {
        Object.defineProperty(wpRequire, 'c', {
          get: () => new Proxy(cache, handler),
          configurable: true,
        });
      } catch {
        // Some environments don't allow redefining; silently continue.
      }
    }
  }

  /**
   * Hook into the webpack/Rspack chunk push API.
   *
   * Fluxer builds may use `webpackChunk*` aliases or a `rspackChunk*` array.
   * Hook the actual array instance because Rspack can retain a local reference
   * to it instead of reading the global property again for every chunk.
   *
   * Each push call has the shape:
   *   [chunkIds, moduleMap, runtimeFn]
   * where moduleMap is `{ [moduleId]: (module, exports, require) => void }`.
   */
  function _hookChunkPush() {
    const CHUNK_ARRAY_NAMES = new Set([
      'webpackChunkfluxer',
      'webpackChunk',
      'webpackChunkapp',
      ...Object.getOwnPropertyNames(window).filter((name) => /^(?:rspack|webpack)Chunk/.test(name)),
    ]);

    for (const name of CHUNK_ARRAY_NAMES) {
      _tryHookChunkArray(name);
    }

    // Also watch for the chunk array to be created later (lazy loading).
    const _definedArrays = new Set(CHUNK_ARRAY_NAMES);
    const _origDefineProperty = Object.defineProperty.bind(Object);

    // Proxy `Object.defineProperty` on window to catch new chunk arrays.
    // Only active until the first chunk array is found.
    const _cleanup = () => { Object.defineProperty = _origDefineProperty; };
    Object.defineProperty = function(obj, prop, descriptor) {
      const result = _origDefineProperty(obj, prop, descriptor);
      if (obj === window && typeof prop === 'string' &&
          !_definedArrays.has(prop) && /^(?:rspack|webpack)Chunk/.test(prop)) {
        _definedArrays.add(prop);
        _tryHookChunkArray(prop);
      }
      return result;
    };

    // Clean up the Object.defineProperty hook after a short delay.
    setTimeout(_cleanup, 5000);
  }

  /**
   * @param {string} arrayName
   */
  function _tryHookChunkArray(arrayName) {
    const _chunkArray = window[arrayName];
    if (!Array.isArray(_chunkArray)) return;

    // Process any chunks already loaded.
    for (const chunk of _chunkArray) {
      _processChunk(chunk);
    }

    wrapChunkArrayPush(_chunkArray, _processChunk);
  }

  function wrapWebpackModuleRequire(requireModule, applyPatches) {
    const wrappedRequire = function fluxtop_require(moduleId) {
      const exports = requireModule.apply(this, arguments);
      return applyPatches(exports, moduleId);
    };
    Object.assign(wrappedRequire, requireModule);
    return wrappedRequire;
  }

  function wrapChunkArrayPush(chunkArray, processChunk) {
    if (!Array.isArray(chunkArray) || typeof chunkArray.push !== 'function' ||
        chunkArray.push.__fluxtopWrapped) return false;

    const originalPush = chunkArray.push;
    const wrappedPush = function fluxtop_chunkPush(...chunks) {
      for (const chunk of chunks) processChunk(chunk);
      return originalPush.apply(this, chunks);
    };
    Object.defineProperty(wrappedPush, '__fluxtopWrapped', {value: true});
    Object.defineProperty(chunkArray, 'push', {
      value: wrappedPush,
      writable: true,
      configurable: true,
      enumerable: false,
    });
    return true;
  }

  function getOriginalFactorySource(factory) {
    const original = factory?.__fluxtopOriginalFactory || factory;
    return Function.prototype.toString.call(original);
  }

  /**
   * Process a single webpack chunk, wrapping all module factories in it.
   * @param {any[]} chunk  [chunkIds, moduleMap, runtimeFn?]
   */
  function _processChunk(chunk) {
    if (!Array.isArray(chunk) || chunk.length < 2) return;
    const moduleMap = chunk[1];
    if (!moduleMap || typeof moduleMap !== 'object') return;

    for (const id of Object.keys(moduleMap)) {
      const originalFactory = moduleMap[id];
      if (typeof originalFactory !== 'function') continue;

      const wrappedFactory = function fluxtop_moduleFactory(module, exports, require) {
        // Capture the webpack require if we don't have it yet.
        if (!_webpackRequire && typeof require === 'function') {
          _wrapWebpackRequire(require);
        }

        // Apply patches to imports too, not just fresh module exports. This
        // lets a plugin adapt a cached Fluxer module when a lazy importer first
        // requests it, while retaining Rspack's helper properties on require.
        const fluxtopRequire = wrapWebpackModuleRequire(require, _applyModulePatches);
        originalFactory(module, exports, fluxtopRequire);

        // Apply patches after the factory ran and populated module.exports.
        module.exports = _applyModulePatches(module.exports, id);
      };

      // Preserve the original factory's properties (e.g. webpack flags).
      Object.assign(wrappedFactory, originalFactory);
      Object.defineProperty(wrappedFactory, '__fluxtopOriginalFactory', {value: originalFactory});
      moduleMap[id] = wrappedFactory;
    }

    // Also intercept the runtime callback (3rd element) to grab __webpack_require__.
    if (typeof chunk[2] === 'function') {
      const originalRuntime = chunk[2];
      chunk[2] = function fluxtop_runtime(require) {
        if (!_webpackRequire && typeof require === 'function') {
          _wrapWebpackRequire(require);
        }
        return originalRuntime(require);
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Public patcher API
  // ---------------------------------------------------------------------------

  const patcher = {
    /**
     * Register a module patch.  `filter` is called for every loaded module;
     * if it returns true, `callback` receives the exports and may return a
     * modified version.
     *
     * @param {(exports: any, id: string|number) => boolean} filter
     * @param {(exports: any, id: string|number) => any}     callback
     * @returns {() => void}  Unregister function.
     */
    patch(filter, callback) {
      const descriptor = { filter, callback };
      _modulePatches.push(descriptor);
      applyPatchesToCachedModules(_webpackCache, _applyModulePatches, (err, id) => {
        console.error(`[Fluxtop:Patcher] Cached module "${id}" patch threw:`, err);
      });
      return () => {
        const idx = _modulePatches.indexOf(descriptor);
        if (idx !== -1) _modulePatches.splice(idx, 1);
      };
    },

    /**
     * Convenience: patch a module that has a specific export key.
     * @param {string}                           exportKey
     * @param {(exports: any, id: any) => any}   callback
     * @returns {() => void}
     */
    patchByExportKey(exportKey, callback) {
      return this.patch(
        (exports) => exports && typeof exports === 'object' && exportKey in exports,
        callback
      );
    },

    /**
     * Convenience: patch a module that has a specific display name (React components).
     * @param {string}                           displayName
     * @param {(exports: any, id: any) => any}   callback
     * @returns {() => void}
     */
    patchByDisplayName(displayName, callback) {
      return this.patch(
        (exports) => {
          if (!exports) return false;
          const check = (v) => v && (v.displayName === displayName || v.name === displayName);
          return check(exports) || (typeof exports === 'object' && Object.values(exports).some(check));
        },
        callback
      );
    },

    /**
     * Find already-loaded modules matching `filter`.  Useful for plugins that
     * start after the target module was already registered.
     * @param {(exports: any, id: any) => boolean} filter
     * @returns {Array<{ id: string|number, exports: any }>}
     */
    findModules(filter) {
      if (!_webpackRequire?.c) return [];
      const result = [];
      for (const [id, mod] of Object.entries(_webpackRequire.c)) {
        try {
          if (mod?.exports && filter(mod.exports, id)) result.push({ id, exports: mod.exports });
        } catch { /* ignore */ }
      }
      return result;
    },

    events,
  };

  // ---------------------------------------------------------------------------
  // Plugin registry (renderer-side)
  // ---------------------------------------------------------------------------

  /** @type {Map<string, { plugin: object, stop: Function|null }>} */
  const _plugins = new Map();

  const pluginManager = {
    /**
     * Register and start a renderer-side plugin.
     * @param {{ name: string, start: (patcher, api) => (Function|void) }} plugin
     */
    register(plugin) {
      if (_plugins.has(plugin.name)) {
        console.warn(`[Fluxtop] Plugin "${plugin.name}" already registered.`);
        return;
      }
      let stop = null;
      try {
        stop = plugin.start(patcher, __fluxtop) ?? null;
        _plugins.set(plugin.name, { plugin, stop });
        console.log(`[Fluxtop] Plugin "${plugin.name}" started.`);
      } catch (err) {
        console.error(`[Fluxtop] Plugin "${plugin.name}" failed to start:`, err);
      }
    },

    unregister(name) {
      const entry = _plugins.get(name);
      if (!entry) return;
      try { entry.stop?.(); } catch (err) { console.error(`[Fluxtop] "${name}" stop() threw:`, err); }
      _plugins.delete(name);
    },

    list: () => Array.from(_plugins.keys()),
  };

  // ---------------------------------------------------------------------------
  // Global API
  // ---------------------------------------------------------------------------

  const __fluxtop = {
    version:       '1.0.0',
    patcher,
    pluginManager,
    events,
  };

  Object.defineProperty(window, '__fluxtop', {
    value:        __fluxtop,
    writable:     false,
    configurable: false,
    enumerable:   false,
  });

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  _hookChunkPush();

  console.log('[Fluxtop:Renderer] Bootstrapped. Webpack hook active.');
})();
