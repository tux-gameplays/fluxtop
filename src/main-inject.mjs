/**
 * src/main-inject.mjs
 *
 * Fluxtop main-process bootstrap.  Injected via a prepended
 * `await import(...)` line into Fluxer's src-electron/dist/main/index.js.
 *
 * Responsibilities:
 *   1. Wire IPC handlers for settings + plugin management.
 *   2. Strip Content-Security-Policy headers so renderer.js can run.
 *   3. On every new BrowserWindow dom-ready, inject renderer.js into the web
 *      context (https://web.fluxer.app) AND any enabled plugin renderer scripts.
 *   4. Start main-process-side plugin logic.
 *
 * This file is ESM because Fluxer's main process uses `"type":"module"`.
 */

import {createRequire}  from 'node:module';
import {fileURLToPath}  from 'node:url';
import * as nodePath    from 'node:path';
import * as nodeFs      from 'node:fs';
import {app, ipcMain, session, webContents} from 'electron';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = nodePath.dirname(__filename);

// CJS require for our own CommonJS modules.
const require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const FLUXTOP_ROOT    = nodePath.resolve(__dirname, '..');
const RENDERER_PATH  = nodePath.join(FLUXTOP_ROOT, 'src', 'renderer.js');
const PRELOAD_PATH   = nodePath.join(FLUXTOP_ROOT, 'src', 'preload.js');

// ---------------------------------------------------------------------------
// Bootstrap core modules
// ---------------------------------------------------------------------------

const settings      = require('./core/settings.js');
const pluginManager = require('./core/pluginManager.js');
const {loadPluginsWhenReady} = require('./core/pluginBootstrap.js');

// Register IPC handlers immediately (before app.whenReady so handlers are in
// place by the time any renderer tries to call them).
settings.registerIpc(ipcMain);
pluginManager.registerIpc(ipcMain, {
  // Inject (or re-inject) a plugin's renderer script into all live Fluxer tabs.
  // The plugin's renderer-side IIFE must reset its own guard flag in stop() for
  // re-injection to take effect after a disable → re-enable cycle.
  async onRendererEnable(plugin) {
    let src;
    try { src = nodeFs.readFileSync(plugin.rendererSrc, 'utf8'); }
    catch (err) {
      console.error(`[Fluxtop:Main] Cannot read renderer src for "${plugin.name}":`, err.message);
      return;
    }
    for (const wc of getFluxerWebContents()) {
      await wc.executeJavaScript(src).catch(e =>
        console.error(`[Fluxtop:Main] Live-enable "${plugin.name}" failed:`, e.message));
    }
  },

  // Unregister a plugin from all live Fluxer tabs, calling its stop() in the renderer.
  async onRendererDisable(name) {
    const script = `void window.__fluxtop?.pluginManager.unregister(${JSON.stringify(name)})`;
    for (const wc of getFluxerWebContents()) {
      await wc.executeJavaScript(script).catch(e =>
        console.error(`[Fluxtop:Main] Live-disable "${name}" failed:`, e.message));
    }
  },
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return all live Fluxer web contents (pages loaded on web.fluxer.app).
 * Used to push live enable/disable changes without requiring a restart.
 * @returns {Electron.WebContents[]}
 */
function getFluxerWebContents() {
  return webContents.getAllWebContents().filter(isFluxerWebContents);
}

function isFluxerWebContents(wc) {
  try {
    if (wc.isDestroyed()) return false;
    const url = wc.getURL();
    return url.includes('web.fluxer.app') || url.startsWith('fluxer-app://app/');
  } catch {
    return false;
  }
}

function routeFluxtopPluginsDeepLink(url) {
  if (typeof url !== 'string') return null;
  try {
    const normalizedPath = url.startsWith('/');
    const parsed = normalizedPath ? new URL(url, 'https://fluxer.app') : new URL(url);
    let pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    if (parsed.protocol === 'fluxer:' && parsed.hostname === 'settings') pathname = `/settings${pathname}`;
    else if (!normalizedPath && (parsed.protocol !== 'https:' || parsed.hostname !== 'fluxer.app')) return null;
    if (pathname !== '/settings/user' || !['plugins', 'fluxtop_plugins'].includes(parsed.searchParams.get('tab'))) return null;
    return {url: '/settings/user?tab=my_profile', openPlugins: true};
  } catch {
    return null;
  }
}

async function signalFluxtopPluginsDeepLink(wc) {
  if (!wc || wc.isDestroyed()) return;
  const script = "window.__fluxtopPendingPluginsDeepLink = true; window.dispatchEvent(new Event('fluxtop:open-plugins-settings'));";
  await wc.executeJavaScript(script).catch((error) =>
    console.error('[Fluxtop:Main] Could not queue Plugins settings selection:', error.message));
}

function patchInitialDeepLinkHandler() {
  if (ipcMain.__fluxtopInitialDeepLinkPatched) return;
  ipcMain.__fluxtopInitialDeepLinkPatched = true;
  const originalHandle = ipcMain.handle;
  ipcMain.handle = function (channel, listener) {
    if (channel !== 'get-initial-deep-link' || typeof listener !== 'function') {
      return originalHandle.call(this, channel, listener);
    }
    return originalHandle.call(this, channel, async (event, ...args) => {
      const url = await listener.call(this, event, ...args);
      const route = routeFluxtopPluginsDeepLink(url);
      if (!route) return url;
      await signalFluxtopPluginsDeepLink(event.sender);
      return route.url;
    });
  };
}

patchInitialDeepLinkHandler();

/** Cache renderer.js contents to avoid re-reading on every new window. */
let _rendererScript = null;
function getRendererScript() {
  if (_rendererScript !== null) return _rendererScript;
  try {
    _rendererScript = nodeFs.readFileSync(RENDERER_PATH, 'utf8');
    return _rendererScript;
  } catch (err) {
    console.error('[Fluxtop:Main] Cannot read renderer.js:', err.message);
    return null;
  }
}

/**
 * Inject renderer.js plus all enabled plugin renderer scripts into a WebContents.
 * @param {Electron.WebContents} wc
 */
async function injectAll(wc) {
  if (wc.isDestroyed()) return;

  // 1. Core renderer bootstrap (webpack patcher + plugin manager).
  const core = getRendererScript();
  if (core) {
    await wc.executeJavaScript(core).catch(e =>
      console.error('[Fluxtop:Main] renderer.js injection failed:', e.message));
  }

  // 2. Per-plugin renderer scripts (if the plugin provides one).
  for (const plugin of pluginManager.list()) {
    if (!plugin.enabled || !plugin.rendererSrc) continue;
    try {
      const src = nodeFs.readFileSync(plugin.rendererSrc, 'utf8');
      await wc.executeJavaScript(src).catch(e =>
        console.error(`[Fluxtop:Main] Plugin "${plugin.name}" renderer injection failed:`, e.message));
    } catch (err) {
      console.error(`[Fluxtop:Main] Cannot read renderer src for "${plugin.name}":`, err.message);
    }
  }
}

// ---------------------------------------------------------------------------
// CSP stripping
// ---------------------------------------------------------------------------

/**
 * Remove Content-Security-Policy and X-Frame-Options headers from all
 * responses in the given session.  Required for executeJavaScript to work
 * against Fluxer's production web app without CSP violations.
 *
 * @param {Electron.Session} targetSession
 */
function stripCsp(targetSession) {
  targetSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = {...details.responseHeaders};
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (lower === 'content-security-policy' ||
          lower === 'content-security-policy-report-only' ||
          lower === 'x-frame-options') {
        delete headers[key];
      }
    }
    callback({responseHeaders: headers});
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

app.on('web-contents-created', (_event, wc) => {
  if (!wc.__fluxtopDeepLinkSendPatched && typeof wc.send === 'function') {
    wc.__fluxtopDeepLinkSendPatched = true;
    const send = wc.send;
    wc.send = function (channel, ...args) {
      const route = channel === 'deep-link' ? routeFluxtopPluginsDeepLink(args[0]) : null;
      if (!route) return send.call(this, channel, ...args);
      const result = send.call(this, channel, route.url, ...args.slice(1));
      void signalFluxtopPluginsDeepLink(this);
      return result;
    };
  }
  wc.on('dom-ready', () => {
    if (!settings.get('fluxtop.enabled', true)) return;
    injectAll(wc);
  });
});

loadPluginsWhenReady(app, pluginManager).then(() => {
  // Register our preload via setPreloads() so it runs in the sandboxed preload
  // context without touching Fluxer's preload file.  This is the correct way
  // to inject into a sandboxed Electron preload — require() of arbitrary paths
  // is blocked by the sandbox bundle's restricted module loader.
  session.defaultSession.setPreloads([PRELOAD_PATH]);

  stripCsp(session.defaultSession);

  console.log(
    `[Fluxtop:Main] Ready. Settings: ${settings.SETTINGS_FILE}\n` +
    `[Fluxtop:Main] Active plugins: ${pluginManager.list().filter(p => p.started).map(p => p.name).join(', ') || '(none)'}`
  );
}).catch(err => {
  console.error('[Fluxtop:Main] app.whenReady() error:', err);
});

console.log('[Fluxtop:Main] Bootstrap loaded.');
