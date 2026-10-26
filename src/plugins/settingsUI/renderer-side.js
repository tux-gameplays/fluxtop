/** React-native Fluxtop Plugins settings tab for Fluxer Desktop. */
(function fluxtopSettingsUI() {
  'use strict';

  if (window.__fluxtop_settingsUI_loaded) return;
  window.__fluxtop_settingsUI_loaded = true;

  const TAB_TYPE = 'fluxtop_plugins';
  const PATCH_MARKER = Symbol.for('fluxtop.reactSettingsTabPatch');
  const STORAGE_KEY = 'fluxtop.importedPlugins';
  const PLUGINS_URL = 'fluxer://settings/user?tab=plugins';
  const SVG_PLUG = 'M25.6,25.6,22.2,29,19,25.8l3.4-3.4a2,2,0,0,0-2.8-2.8L16.2,23l-1.3-1.3a1.9,1.9,0,0,0-2.8,0l-3,3a9.8,9.8,0,0,0-3,7,9.1,9.1,0,0,0,1.8,5.6L4.6,40.6a1.9,1.9,0,0,0,0,2.8,1.9,1.9,0,0,0,2.8,0l3.2-3.2a10.1,10.1,0,0,0,5.9,1.9,10.2,10.2,0,0,0,7.1-2.9l3-3a2,2,0,0,0,.6-1.4,1.7,1.7,0,0,0-.6-1.4L25,31.8l3.4-3.4a2,2,0,0,0-2.8-2.8Z M43.4,4.6a1.9,1.9,0,0,0-2.8,0L37.2,8a10,10,0,0,0-13,.9l-3,3a2,2,0,0,0-.6,1.4,1.7,1.7,0,0,0,.6,1.4L32.9,26.4a1.9,1.9,0,0,0,2.8,0l3-2.9a9.9,9.9,0,0,0,2.9-7.1A10.4,10.4,0,0,0,40,10.9l3.4-3.5A1.9,1.9,0,0,0,43.4,4.6Z';
  const styles = {
    root: {padding: '24px 32px', color: 'var(--text-normal, #dbdee1)', maxWidth: 900},
    header: {display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24},
    title: {fontSize: 20, fontWeight: 700, margin: 0},
    section: {marginBottom: 30},
    sectionTitle: {fontSize: 16, fontWeight: 650, margin: '0 0 4px'},
    hint: {fontSize: 13, color: 'var(--text-muted, #949ba4)', margin: '0 0 12px'},
    row: {display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--background-modifier-accent, rgba(255,255,255,.06))'},
    fluxtopRow: {marginBottom: 14, paddingBottom: 20},
    icon: {width: 36, height: 36, flex: '0 0 36px', display: 'grid', placeItems: 'center', borderRadius: 8, background: 'var(--background-tertiary, #2b2d31)', overflow: 'hidden'},
    info: {flex: 1, minWidth: 0},
    name: {fontSize: 14, fontWeight: 600, margin: 0},
    meta: {fontSize: 12, color: 'var(--text-muted, #949ba4)', margin: '3px 0'},
    description: {fontSize: 13, color: 'var(--text-muted, #949ba4)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis'},
    button: {display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: 'fit-content', minWidth: 72,
      maxWidth: '100%', height: 36, minHeight: 36, padding: '7px 12px', fontSize: 13, fontWeight: 600, lineHeight: '18px',
      border: '.0625rem solid color-mix(in srgb, var(--brand-primary) 82%, white 18%)', borderRadius: 8,
      background: 'var(--brand-primary)', color: 'var(--brand-primary-fill)', cursor: 'pointer',
      transition: 'background-color .12s,border-color .12s,box-shadow .12s,color .12s,opacity .12s', position: 'relative', overflow: 'hidden'},
    remove: {border: 0, background: 'transparent', color: 'var(--status-danger, #ed4245)', cursor: 'pointer', fontSize: 18},
    toggle: {width: 44, height: 24, border: 0, borderRadius: 999, position: 'relative', display: 'inline-flex', alignItems: 'center', padding: 2, flex: '0 0 auto'},
    thumb: {position: 'absolute', width: 20, height: 20, top: 2, left: 0, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center'},
    iconSvg: {width: 20, height: 20, fill: 'currentColor'},
  };

  function uid() { return `_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`; }
  function pluginToggleLog(name, enabled) { return `Plugin "${name}" ${enabled ? 'enabled' : 'disabled'}.`; }
  function getSwitchVisualState(checked, disabled) {
    return {
      trackColor: checked ? 'var(--brand-primary)' : '#6b7280',
      iconColor: checked ? 'var(--brand-primary)' : '#6b7280',
      thumbOffset: checked ? 22 : 2,
      iconSize: checked ? 12 : 10,
      iconPath: checked ? 'M232.49,80.49l-128,128a12,12,0,0,1-17,0l-56-56a12,12,0,1,1,17-17L96,183,215.51,63.51a12,12,0,0,1,17,17Z' :
        'M208.49,191.51a12,12,0,0,1-17,17L128,145,64.49,208.49a12,12,0,0,1-17-17L111,128,47.51,64.49a12,12,0,0,1,17-17L128,111l63.51-63.52a12,12,0,0,1,17,17L145,128Z',
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? 'not-allowed' : 'pointer',
      trackTransition: 'color 150ms cubic-bezier(.4,0,.2,1), background-color 150ms cubic-bezier(.4,0,.2,1), border-color 150ms cubic-bezier(.4,0,.2,1), box-shadow 150ms cubic-bezier(.4,0,.2,1)',
      thumbTransition: 'transform 150ms cubic-bezier(.4,0,.2,1), box-shadow 150ms cubic-bezier(.4,0,.2,1)',
      trackShadow: checked ? 'inset 0 2px 4px rgba(0,0,0,.1), 0 1px rgba(255,255,255,.15)' :
        'inset 0 2px 4px rgba(0,0,0,.15), 0 1px rgba(255,255,255,.1)',
    };
  }
  function createPluginViewModel(builtins, imported) {
    return [
      ...(builtins || []).map((plugin) => ({plugin: plugin.name === 'settingsUI' ?
        {...plugin, displayName: 'Fluxtop', enabled: true, disableable: false} : plugin, imported: false})),
      ...(imported || []).map((plugin) => ({plugin, imported: true})),
    ].sort((a, b) => Number(b.plugin.disableable === false) - Number(a.plugin.disableable === false));
  }
  function removeImportedPluginById(plugins, id) {
    return (plugins || []).filter((plugin) => plugin.id !== id);
  }
  function parseMetadata(source, filename) {
    const metadata = {name: filename.replace(/\.js$/i, ''), description: '', author: '', version: '', preview: '', icon: ''};
    const block = source.match(/\/\/\s*==FluxtopPlugin==([\s\S]*?)\/\/\s*==\/FluxtopPlugin==/i);
    if (block) for (const line of block[1].split('\n')) {
      const match = line.match(/\/\/\s*@([\w]+)\s+(.*)/);
      if (match && Object.hasOwn(metadata, match[1])) metadata[match[1]] = match[2].trim();
    }
    return metadata;
  }
  function parsePluginSvgIcon(icon, parseDocument) {
    try {
      const root = (parseDocument || ((source) => new DOMParser().parseFromString(source, 'image/svg+xml')))(String(icon)).documentElement;
      if (root.localName !== 'svg') return null;
      const paths = Array.from(root.querySelectorAll('path')).map((path) => path.getAttribute('d')).filter(Boolean);
      if (!paths.length) return null;
      return {viewBox: root.getAttribute('viewBox') || '0 0 256 256', width: root.getAttribute('width'),
        height: root.getAttribute('height'), paths};
    } catch { return null; }
  }
  function runPlugin(source) {
    try { new Function(source)(); }
    catch (error) { console.error('[Fluxtop:SettingsUI] Plugin runtime error:', error); }
  }
  async function getImported() {
    try { return await window.fluxtopBridge?.getSetting(STORAGE_KEY, []) ?? []; }
    catch { return []; }
  }
  async function saveImported(plugins) {
    try { await window.fluxtopBridge?.setSetting(STORAGE_KEY, plugins); }
    catch (error) { console.error('[Fluxtop:SettingsUI] save failed', error); throw error; }
  }
  function appendFluxtopSettingsTab(tabs, descriptor) {
    if (!Array.isArray(tabs) || tabs.some((tab) => tab.type === descriptor.type)) return tabs;
    return [...tabs, descriptor];
  }
  function createFluxtopTabResolver(nativeResolver, tabType, component) {
    return function resolveSettingsTab(type, ...args) {
      return type === tabType ? component : nativeResolver.call(this, type, ...args);
    };
  }
  function createFluxtopTabDescriptor(icon) {
    return {type: 'fluxtop_plugins', category: 'fluxtop', label: 'Plugins', icon, iconWeight: 'regular'};
  }
  function createFluxtopCategoryLabelResolver(nativeLabel) {
    return function resolveCategoryLabel(category, ...args) {
      return category === 'fluxtop' ? 'Fluxtop' : nativeLabel.call(this, category, ...args);
    };
  }
  function findSettingsTabsExport(exports) {
    for (const [key, value] of Object.entries(exports || {})) {
      if (typeof value !== 'function') continue;
      const source = Function.prototype.toString.call(value);
      if (source.includes('.filter(') && source.includes('.map(') && source.includes('type:') &&
          source.includes('category:') && source.includes('label:') && source.includes('iconWeight:')) return key;
    }
    return null;
  }
  function findSettingsTabResolverExport(exports) {
    for (const [key, value] of Object.entries(exports || {})) {
      if (typeof value !== 'function') continue;
      const source = Function.prototype.toString.call(value);
      if (/return\s+null\s*!=\s*\(\s*([A-Za-z_$][\w$]*)\s*=\s*[A-Za-z_$][\w$]*\s*\[\s*[A-Za-z_$][\w$]*\s*\]\s*\)\s*\?\s*\1\s*:\s*null/.test(source)) return key;
    }
    return null;
  }
  function findSettingsCategoryLabelExport(exports) {
    for (const [key, value] of Object.entries(exports || {})) {
      if (typeof value !== 'function') continue;
      const source = Function.prototype.toString.call(value);
      if (source.includes('case"user_settings"') && source.includes('case"app_settings"') && source.includes('message:"App settings"')) return key;
    }
    return null;
  }
  function findSettingsDeepLinkExport(exports) {
    for (const [key, value] of Object.entries(exports || {})) {
      if (typeof value !== 'function') continue;
      const source = Function.prototype.toString.call(value);
      if (source.includes('searchParams.get') && source.includes('settings/user') &&
          source.includes('pathname.replace') && source.includes('.has(')) return key;
    }
    return null;
  }
  function createFluxtopSettingsDeepLinkParser(nativeParser, tabType) {
    return function parseSettingsDeepLink(url, ...args) {
      try {
        const parsed = new URL(url, 'https://fluxer.app');
        const pathname = parsed.pathname.replace(/\/+$/, '') || '/';
        const tab = parsed.searchParams.get('tab');
        if (pathname === '/settings/user' && ['plugins', tabType].includes(tab)) return {tab: tabType};
      } catch { /* let Fluxer's parser handle its own supported URL formats */ }
      return nativeParser.call(this, url, ...args);
    };
  }
  function isSettingsExportPatched(exports, key) {
    return Boolean(exports?.[PATCH_MARKER]?.has?.(key));
  }
  function proxySettingsModuleExports(exports, key, transform, cache, gate) {
    const patchedKeys = new Set(exports?.[PATCH_MARKER] || []);
    if (patchedKeys.has(key)) return exports;
    if (cache.has(exports)) return cache.get(exports);
    const wrapped = new WeakMap();
    patchedKeys.add(key);
    const proxy = new Proxy(exports, {get(target, property, receiver) {
      if (property === PATCH_MARKER) return patchedKeys;
      const value = Reflect.get(target, property, receiver);
      if (property !== key || typeof value !== 'function') return value;
      if (!gate.active) return value;
      if (!wrapped.has(value)) wrapped.set(value, transform(value));
      return wrapped.get(value);
    }});
    cache.set(exports, proxy);
    return proxy;
  }
  function findFluxerWebpackRequire(win) {
    for (const name of Object.getOwnPropertyNames(win).filter((key) => /^(?:rspack|webpack)Chunk/.test(key))) {
      const chunks = win[name];
      if (!Array.isArray(chunks)) continue;
      let req;
      try { chunks.push([[`fluxtop-runtime-${Date.now()}-${Math.random()}`], {}, (runtime) => { req = runtime; }]); }
      catch { continue; }
      if (typeof req === 'function' && req.m) return req;
    }
    return null;
  }
  function findFluxerRuntime(req, predicate, validate = (exports) => Boolean(exports)) {
    for (const [id, factory] of Object.entries(req?.m || {})) {
      if (!predicate(getOriginalFactorySource(factory))) continue;
      try {
        const exports = req(id);
        if (validate(exports)) return exports;
      } catch { /* ignore non-runtime factories */ }
    }
    return null;
  }
  function getOriginalFactorySource(factory) {
    return Function.prototype.toString.call(factory?.__fluxtopOriginalFactory || factory);
  }
  async function waitForSettingsRuntime(discover, delay, attempts = 60, intervalMs = 500) {
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const runtime = discover();
        if (runtime?.jsx && runtime?.React?.useState && typeof runtime?.patcher?.patch === 'function') return runtime;
      } catch { /* the Fluxer runtime may still be initializing */ }
      if (attempt + 1 < attempts) await delay(intervalMs);
    }
    return null;
  }
  function createPluginsComponent(React, jsx) {
    const h = (type, props, key) => jsx.jsx(type, {...props, ...(key === undefined ? {} : {key})});
    const iconNode = (icon) => {
      if (!icon) return h('svg', {viewBox: '0 0 48 48', style: styles.iconSvg, 'aria-hidden': true,
        children: h('path', {d: SVG_PLUG})});
      const text = String(icon).trim();
      if (/^<svg/i.test(text)) {
        const vector = parsePluginSvgIcon(text);
        if (vector) return h('svg', {viewBox: vector.viewBox, width: vector.width || 22, height: vector.height || 22,
          style: styles.iconSvg, 'aria-hidden': true, children: vector.paths.map((d, index) => h('path', {d}, `path:${index}`))});
      }
      if (/^(https?:|data:)/i.test(text)) return h('img', {src: text, alt: '', style: {width: 24, height: 24, objectFit: 'contain'}});
      return h('span', {children: text});
    };
    function Toggle({checked, disabled, locked = false, onChange, label}) {
      const visual = getSwitchVisualState(checked, locked || disabled);
      return h('button', {type: 'button', role: 'switch', 'aria-label': `Toggle ${label}`,
        'aria-checked': checked, 'data-state': checked ? 'checked' : 'unchecked', disabled, onClick: () => onChange(!checked),
        style: {...styles.toggle, cursor: visual.cursor, opacity: visual.opacity, background: visual.trackColor,
          boxShadow: visual.trackShadow, transition: visual.trackTransition},
        children: h('span', {style: {...styles.thumb, color: visual.iconColor, transform: `translateX(${visual.thumbOffset}px)`, transition: visual.thumbTransition},
          children: h('svg', {width: visual.iconSize, height: visual.iconSize, viewBox: '0 0 256 256', fill: 'currentColor', color: visual.iconColor, 'aria-hidden': true,
            children: h('path', {d: visual.iconPath})})})});
    }
    function PluginRow({plugin, imported, onRefresh}) {
      const [busy, setBusy] = React.useState(false);
      const [pendingEnabled, setPendingEnabled] = React.useState(null);
      const name = plugin.displayName || plugin.name;
      const isFluxtop = plugin.disableable === false;
      const toggle = async (enabled) => {
        if (busy || plugin.disableable === false) return;
        setBusy(true);
        setPendingEnabled(enabled);
        try {
          if (imported) {
            const list = await getImported();
            const item = list.find((entry) => entry.id === plugin.id);
            if (item) { item.enabled = enabled; await saveImported(list); }
          } else if (enabled) await window.fluxtopBridge?.enablePlugin(plugin.name);
          else await window.fluxtopBridge?.disablePlugin(plugin.name);
          console.log(`[Fluxtop:SettingsUI] ${pluginToggleLog(name, enabled)}`);
          await onRefresh();
        } catch (error) {
          console.error('[Fluxtop:SettingsUI] Plugin toggle failed:', error);
        } finally {
          setPendingEnabled(null);
          setBusy(false);
        }
      };
      const remove = async () => {
        const list = await getImported();
        await saveImported(removeImportedPluginById(list, plugin.id));
        await onRefresh();
      };
      const meta = [plugin.author && `by ${plugin.author}`, plugin.version && `v${plugin.version}`].filter(Boolean).join(' · ');
      return h('div', {style: isFluxtop ? {...styles.row, ...styles.fluxtopRow} : styles.row, children: [
        h('div', {style: styles.icon, children: iconNode(plugin.icon)}, 'icon'),
        h('div', {style: styles.info, children: [
          h('div', {style: {display: 'flex', gap: 7, alignItems: 'center'}, children: [
            h('strong', {style: styles.name, children: name}, 'name'),
            h('span', {style: {fontSize: 10, textTransform: 'uppercase', color: 'var(--text-muted, #949ba4)'}, children: imported ? 'Imported' : 'Built-in'}, 'badge'),
          ]}, 'nameRow'),
          meta && h('p', {style: styles.meta, children: meta}, 'meta'),
          plugin.description && h('p', {style: styles.description, children: plugin.description}, 'description'),
        ]}, 'info'),
        h(Toggle, {checked: pendingEnabled ?? (plugin.disableable === false || plugin.enabled !== false),
          disabled: plugin.disableable === false, locked: plugin.disableable === false, label: name, onChange: toggle}, 'toggle'),
        imported && h('button', {type: 'button', title: 'Remove plugin', 'aria-label': `Remove ${name}`,
          style: styles.remove, onClick: remove, children: '×'}, 'remove'),
      ]});
    }
    return function FluxtopPluginsSettings() {
      const [builtins, setBuiltins] = React.useState([]);
      const [imported, setImported] = React.useState([]);
      const [error, setError] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const refresh = React.useCallback(async () => {
        try {
          const [plugins, saved] = await Promise.all([
            window.fluxtopBridge?.listPlugins() ?? [], getImported(),
          ]);
          setBuiltins(plugins);
          setImported(saved);
          setError('');
        } catch (failure) { setError(failure?.message || 'Could not load plugins.'); }
      }, []);
      React.useEffect(() => { void refresh(); }, [refresh]);
      const onFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        setBusy(true);
        try {
          const source = await file.text();
          const plugin = {id: uid(), ...parseMetadata(source, file.name), enabled: true, source};
          const all = await getImported();
          all.push(plugin);
          await saveImported(all);
          runPlugin(source);
          await refresh();
        } catch (failure) { setError(failure?.message || 'Could not import plugin.'); }
        finally { setBusy(false); }
      };
      const section = (title, description, children, key) => h('section', {style: styles.section, children: [
        h('h2', {style: styles.sectionTitle, children: title}, 'title'),
        h('p', {style: styles.hint, children: description}, 'hint'),
        children,
      ]}, key);
      const rows = createPluginViewModel(builtins, imported).map(({plugin, imported: isImported}) =>
        h(PluginRow, {plugin, imported: isImported, onRefresh: refresh}, `${isImported ? 'imported' : 'builtin'}:${plugin.id || plugin.name}`));
      return h('div', {'data-flx': 'fluxtop.react-settings-tab.plugins', style: styles.root, children: [
        h('header', {style: styles.header, children: [
          h('h1', {style: styles.title, children: 'Plugins'}, 'heading'),
        ]}, 'header'),
        error && h('p', {role: 'alert', children: error}, 'error'),
        section('Installed Plugins', 'Toggle plugins on or off. Changes take effect immediately.',
          rows.length ? rows : h('p', {style: styles.hint, children: 'No plugins installed. Import a .js file below.'}), 'installed'),
        section('Import Plugin', 'Load a .js plugin file from your computer. The plugin runs immediately and on every future launch.',
          h('label', {style: {...styles.button, opacity: busy ? .6 : 1}, children: [
            h('svg', {width: '1rem', height: '1rem', viewBox: '0 0 256 256', fill: 'currentColor', 'aria-hidden': true,
              children: h('path', {d: 'M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z'})}),
            'Import Plugin', h('input', {type: 'file', accept: '.js', disabled: busy, onChange: onFile,
              style: {position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0,0,0,0)'}}),
          ]}), 'import'),
      ]});
    };
  }

  function findFluxerCopyUtility(win) {
    const req = findFluxerWebpackRequire(win);
    const id = Object.entries(req?.m || {}).find(([, factory]) => {
      const source = getOriginalFactorySource(factory);
      return source.includes('Copying text to clipboard') && source.includes('Copied to clipboard') && /copy:function\(\)\{return/.test(source);
    })?.[0];
    try { return id === undefined ? null : req(id)?.copy || null; }
    catch { return null; }
  }
  function findSettingsI18n(button) {
    const fiberKey = Object.keys(button || {}).find((key) => key.startsWith('__reactFiber$'));
    for (let fiber = fiberKey ? button[fiberKey] : null; fiber; fiber = fiber.return) {
      for (let context = fiber.dependencies?.firstContext; context; context = context.next) {
        const value = context.memoizedValue;
        if (typeof value?._ === 'function') return value;
      }
    }
    return null;
  }
  function findFluxerComponentBus(req) {
    const id = Object.entries(req?.m || {}).find(([, factory]) => {
      return isFluxerComponentBusFactory(getOriginalFactorySource(factory));
    })?.[0];
    try {
      const exports = id === undefined ? null : req(id);
      return Object.values(exports || {}).find((value) => typeof value?.dispatch === 'function') || null;
    } catch { return null; }
  }
  function isFluxerComponentBusFactory(source) {
    return source.includes('dispatchOrBuffer') && source.includes('ComponentBus');
  }
  function dispatchPluginsTab(componentBus) {
    componentBus?.dispatch?.('USER_SETTINGS_TAB_SELECT', {tab: 'fluxtop_plugins'});
  }
  function waitForSettingsPanelAndSelectPlugins(componentBus, doc = document, selectTab = dispatchPluginsTab) {
    if (doc.querySelector('[aria-label="Settings sections"]')) {
      selectTab(componentBus);
      return Promise.resolve(true);
    }
    return new Promise((resolve) => {
      const observer = new MutationObserver(() => {
        if (!doc.querySelector('[aria-label="Settings sections"]')) return;
        observer.disconnect();
        clearTimeout(timeout);
        selectTab(componentBus);
        resolve(true);
      });
      const timeout = setTimeout(() => {
        observer.disconnect();
        resolve(false);
      }, 10000);
      observer.observe(doc.body, {childList: true, subtree: true});
    });
  }
  async function copyPluginsSettingsLink(copyText, translator, url) {
    const result = await copyText(translator, url || PLUGINS_URL, false);
    if (result === false) throw new Error('Fluxer could not copy the Plugins settings link');
    return result;
  }
  async function openPluginsFromSettingsLink(componentBus) {
    if (!document.querySelector('[aria-label="Settings sections"]')) {
      const button = Array.from(document.querySelectorAll('button')).find((item) =>
        /^(user settings|configurações do usuário)$/i.test(item.getAttribute('aria-label') || ''));
      button?.click();
      await new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          if (document.querySelector('[aria-label="Settings sections"]')) { observer.disconnect(); resolve(); }
        });
        observer.observe(document.body, {childList: true, subtree: true});
        setTimeout(() => { observer.disconnect(); resolve(); }, 5000);
      });
    }
    dispatchPluginsTab(componentBus);
  }
  function isPluginsSettingsUrl(parsed) {
    return parsed.protocol === 'fluxer:' && parsed.hostname === 'settings' &&
      (parsed.pathname === '/plugins' || (parsed.pathname === '/user' && ['plugins', 'fluxtop_plugins'].includes(parsed.searchParams.get('tab'))));
  }
  function decoratePluginsSettingsLinks(root, componentBus) {
    const anchors = [];
    if (root?.matches?.('a[href]')) anchors.push(root);
    anchors.push(...(root?.querySelectorAll?.('a[href]') || []));
    for (const anchor of anchors) {
      let parsed;
      try { parsed = new URL(anchor.href); } catch { continue; }
      if (!isPluginsSettingsUrl(parsed)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', 'Open Plugins in settings');
      button.setAttribute('aria-roledescription', 'settings link');
      button.setAttribute('data-flx$', 'tab-name');
      button.style.cssText = 'appearance:none;display:inline-flex;align-items:center;gap:4px;border:0;border-radius:4px;padding:1px 6px;background:var(--background-modifier-accent,rgba(255,255,255,.08));color:var(--text-link);font:inherit;font-weight:600;cursor:pointer;vertical-align:baseline';
      const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
       icon.setAttribute('viewBox', '0 0 48 48'); icon.setAttribute('width', '14'); icon.setAttribute('height', '14'); icon.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('d', SVG_PLUG); path.setAttribute('fill', 'currentColor');
      icon.appendChild(path); button.append(icon, document.createTextNode('Plugins'));
      button.addEventListener('click', (event) => {
        event.preventDefault();
        void openPluginsFromSettingsLink(componentBus);
      });
      anchor.replaceWith(button);
    }
  }
  function handleNativePluginsCopy(event, root = document) {
    const button = event.target?.closest?.('[data-flx="app.settings-heading-link-button.button.copy"]');
    if (!button || !root.querySelector('[data-flx="fluxtop.react-settings-tab.plugins"]')) return false;
    const copyText = findFluxerCopyUtility(window);
    const translator = findSettingsI18n(button);
    if (!copyText || !translator) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    void copyPluginsSettingsLink(copyText, translator, PLUGINS_URL).catch((error) => console.error('[Fluxtop:SettingsUI] Could not copy Plugins link:', error));
    return true;
  }
  function syncVersion(version) {
    if (!version) return;
    const clientInfo = document.querySelector('[data-flx="app.client-info.button.click"]');
    if (!clientInfo) return;
    let label = clientInfo.querySelector('[data-fluxtop-version]');
    if (!label) { label = document.createElement('span'); label.dataset.fluxtopVersion = 'true'; clientInfo.appendChild(label); }
    const nextLabel = formatFluxtopVersion(version);
    if (shouldUpdateVersionLabel(label.textContent, version)) label.textContent = nextLabel;
  }
  function shouldUpdateVersionLabel(current, version) {
    return current !== `Fluxtop ${version}`;
  }
  function formatFluxtopVersion(version) {
    return `Fluxtop ${version}`;
  }
  function createSettingsUICleanup(observer, linkObserver, unpatch, win, gate, copyHandler, deepLinkHandler, doc) {
    return () => {
      observer.disconnect();
      linkObserver.disconnect();
      if (copyHandler) doc?.removeEventListener('click', copyHandler, true);
      if (deepLinkHandler) win.removeEventListener('fluxtop:open-plugins-settings', deepLinkHandler);
      gate.active = false;
      for (const undo of unpatch) undo();
      delete win.__fluxtopReactSettingsTabStatus;
      win.__fluxtop_settingsUI_loaded = false;
    };
  }

  async function installSettingsUI() {
  const runtime = await waitForSettingsRuntime(() => {
    const patcher = window.__fluxtop?.patcher;
    if (typeof patcher?.patch !== 'function') return null;
    const req = findFluxerWebpackRequire(window);
    if (!req) return null;
    const jsx = findFluxerRuntime(req, (source) => source.includes('react.transitional.element') && /\.jsx\s*=/.test(source) && /\.jsxs\s*=/.test(source));
    const React = findFluxerRuntime(req, (source) => source.includes('react.transitional.element') && source.includes('react.memo') && source.includes('react.context'),
      (exports) => typeof exports?.useState === 'function' && typeof exports?.useEffect === 'function');
    return jsx && React ? {req, jsx, React, patcher} : null;
  }, (ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  if (!runtime) {
    console.error('[Fluxtop:SettingsUI] React settings module discovery timed out; Plugins tab was not installed.');
    window.__fluxtop_settingsUI_loaded = false;
    return;
  }
  const {req, jsx, React, patcher} = runtime;
  const Component = createPluginsComponent(React, jsx);
  const componentBus = findFluxerComponentBus(req);
  const FluxtopIcon = ({size = 20}) => jsx.jsx('svg', {viewBox: '0 0 48 48', width: size, height: size,
    fill: 'currentColor', 'aria-hidden': true, children: jsx.jsx('path', {d: SVG_PLUG})});
  const tabDescriptor = createFluxtopTabDescriptor(FluxtopIcon);
  const catalogCache = new WeakMap();
  const resolverCache = new WeakMap();
  const categoryCache = new WeakMap();
  const deepLinkCache = new WeakMap();
  const patchesActive = {active: false};
  let catalogPatched = false;
  let resolverPatched = false;
  const setPatchActivation = () => { patchesActive.active = catalogPatched && resolverPatched; };
  const unpatch = [
    patcher.patch((exports) => Boolean(findSettingsTabsExport(exports)) && !isSettingsExportPatched(exports, findSettingsTabsExport(exports)), (exports) => {
      const key = findSettingsTabsExport(exports);
      catalogPatched = true;
      setPatchActivation();
      return proxySettingsModuleExports(exports, key, (native) => function (...args) {
        const tabs = native.apply(this, args);
        return patchesActive.active ? appendFluxtopSettingsTab(tabs, tabDescriptor) : tabs;
      }, catalogCache, patchesActive);
    }),
    patcher.patch((exports) => Boolean(findSettingsTabResolverExport(exports)) && !isSettingsExportPatched(exports, findSettingsTabResolverExport(exports)), (exports) => {
      const key = findSettingsTabResolverExport(exports);
      resolverPatched = true;
      setPatchActivation();
      return proxySettingsModuleExports(exports, key, (native) => createFluxtopTabResolver(native, TAB_TYPE, Component), resolverCache, patchesActive);
    }),
    patcher.patch((exports) => Boolean(findSettingsCategoryLabelExport(exports)) && !isSettingsExportPatched(exports, findSettingsCategoryLabelExport(exports)), (exports) => {
      const key = findSettingsCategoryLabelExport(exports);
      return proxySettingsModuleExports(exports, key, (native) => createFluxtopCategoryLabelResolver(native), categoryCache, {active: true});
    }),
    patcher.patch((exports) => Boolean(findSettingsDeepLinkExport(exports)) && !isSettingsExportPatched(exports, findSettingsDeepLinkExport(exports)), (exports) => {
      const key = findSettingsDeepLinkExport(exports);
      return proxySettingsModuleExports(exports, key, (native) => createFluxtopSettingsDeepLinkParser(native, TAB_TYPE), deepLinkCache, {active: true});
    }),
  ];
  window.__fluxtopReactSettingsTabStatus = () => ({catalogPatched, resolverPatched});

  const importedAtStartup = getImported().then((list) => list.filter((plugin) => plugin.enabled !== false).forEach((plugin) => runPlugin(plugin.source)));
  const manager = {
    name: 'settingsUI',
    start() {
      syncVersion(window.fluxtopBridge?.version);
      const observer = new MutationObserver(() => syncVersion(window.fluxtopBridge?.version));
      observer.observe(document.body, {childList: true, subtree: true});
      decoratePluginsSettingsLinks(document, componentBus);
      document.addEventListener('click', handleNativePluginsCopy, true);
      const handlePluginsDeepLink = () => {
        if (!window.__fluxtopPendingPluginsDeepLink) return;
        delete window.__fluxtopPendingPluginsDeepLink;
        void waitForSettingsPanelAndSelectPlugins(componentBus);
      };
      window.addEventListener('fluxtop:open-plugins-settings', handlePluginsDeepLink);
      handlePluginsDeepLink();
      const linkObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) decoratePluginsSettingsLinks(node, componentBus);
        }
      });
      linkObserver.observe(document.body, {childList: true, subtree: true});
      return createSettingsUICleanup(observer, linkObserver, unpatch, window, patchesActive, handleNativePluginsCopy, handlePluginsDeepLink, document);
    },
  };
  window.__fluxtop?.pluginManager?.register?.(manager);
  importedAtStartup.catch((error) => console.error('[Fluxtop:SettingsUI] Imported plugin startup failed:', error));
  console.log('[Fluxtop:SettingsUI] React Plugins settings tab registered.');
  }
  void installSettingsUI().catch((error) => {
    console.error('[Fluxtop:SettingsUI] Plugin initialization failed:', error);
    window.__fluxtop_settingsUI_loaded = false;
  });
})();
