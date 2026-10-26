/**
 * src/core/pluginManager.js
 *
 * Plugin manager for the main process (src/main-inject.mjs).
 *
 * Discovers all plugins under src/plugins/, checks their enabled state from
 * settings, and exposes IPC handlers so the renderer (and settings UI) can
 * list, enable, and disable plugins at runtime.
 *
 * Note: renderer-side plugins register themselves via
 * `window.__fluxtop.pluginManager.register()` inside renderer.js / renderer
 * plugin bundles.  This manager handles the *main-process* side only:
 * persisting enabled state and telling the renderer which plugins to activate.
 *
 * A valid plugin module must export:
 *   {
 *     name:        string          — unique id, used as the settings key
 *     description: string
 *     rendererSrc: string|null     — path to the renderer-side plugin JS to inject (or null)
 *     start():     void            — called when plugin enabled (main-process side)
 *     stop():      void            — called when plugin disabled / Fluxtop unloads
 *   }
 *
 * Per-plugin enabled state: `plugins.<name>.enabled` (default: true).
 */

'use strict';

const fs      = require('node:fs');
const path    = require('node:path');
const settings = require('./settings');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/** @type {Map<string, { module: object, started: boolean }>} */
const _registry = new Map();

const PLUGINS_DIR = path.resolve(__dirname, '..', 'plugins');

const IPC_CH = {
  LIST:    'fluxtop:plugin-list',
  ENABLE:  'fluxtop:plugin-enable',
  DISABLE: 'fluxtop:plugin-disable',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _isEnabled(name) {
  if (!isPluginDisableable(_registry.get(name)?.module)) return true;
  return settings.get(`plugins.${name}.enabled`, true);
}

function isPluginDisableable(plugin) {
  return plugin?.disableable !== false;
}

/**
 * @param {string} pluginDir
 * @returns {object|null}
 */
function _loadPlugin(pluginDir) {
  const indexPath = path.join(pluginDir, 'index.js');
  if (!fs.existsSync(indexPath)) return null;

  let plugin;
  try { plugin = require(indexPath); }
  catch (err) { console.error(`[Fluxtop:PluginManager] require("${indexPath}") failed:`, err); return null; }

  if (typeof plugin.name !== 'string' || !plugin.name) {
    console.error(`[Fluxtop:PluginManager] Plugin at "${pluginDir}" missing valid "name".`);
    return null;
  }
  if (typeof plugin.start !== 'function' || typeof plugin.stop !== 'function') {
    console.error(`[Fluxtop:PluginManager] "${plugin.name}" must export start() and stop().`);
    return null;
  }
  return plugin;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Discover and start all enabled plugins.
 */
function loadAll() {
  if (!fs.existsSync(PLUGINS_DIR)) {
    console.warn('[Fluxtop:PluginManager] plugins dir not found:', PLUGINS_DIR);
    return;
  }

  for (const entry of fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pluginDir = path.join(PLUGINS_DIR, entry.name);
    const plugin = _loadPlugin(pluginDir);
    if (!plugin) continue;

    const { name } = plugin;
    if (_registry.has(name)) {
      console.warn(`[Fluxtop:PluginManager] Duplicate plugin name "${name}" — skipping.`);
      continue;
    }

    _registry.set(name, { module: plugin, started: false });

    if (_isEnabled(name)) {
      startPlugin(name);
    } else {
      console.log(`[Fluxtop:PluginManager] "${name}" disabled — skipping.`);
    }
  }
}

function startPlugin(name) {
  const entry = _registry.get(name);
  if (!entry || entry.started) return;
  try {
    entry.module.start();
    entry.started = true;
    console.log(`[Fluxtop:PluginManager] Started "${name}".`);
  } catch (err) {
    console.error(`[Fluxtop:PluginManager] "${name}".start() threw:`, err);
  }
}

function stopPlugin(name, force = false) {
  const entry = _registry.get(name);
  if (!force && !isPluginDisableable(entry?.module)) return;
  if (!entry || !entry.started) return;
  try {
    entry.module.stop();
    entry.started = false;
    console.log(`[Fluxtop:PluginManager] Stopped "${name}".`);
  } catch (err) {
    console.error(`[Fluxtop:PluginManager] "${name}".stop() threw:`, err);
  }
}

function stopAll() {
  for (const name of _registry.keys()) stopPlugin(name, true);
}

function enablePlugin(name) {
  settings.set(`plugins.${name}.enabled`, true);
  startPlugin(name);
}

function disablePlugin(name) {
  const entry = _registry.get(name);
  if (!isPluginDisableable(entry?.module)) {
    settings.set(`plugins.${name}.enabled`, true);
    startPlugin(name);
    return false;
  }
  settings.set(`plugins.${name}.enabled`, false);
  stopPlugin(name);
  return true;
}

function list() {
  return Array.from(_registry.entries()).map(([name, entry]) => ({
    name,
    displayName:  entry.module.displayName  || name,
    description:  entry.module.description || '',
    icon:         entry.module.icon         || null,
    rendererSrc:  entry.module.rendererSrc  || null,
    disableable: isPluginDisableable(entry.module),
    started:      entry.started,
    enabled:      _isEnabled(name),
  }));
}

/**
 * Register ipcMain handlers so the renderer settings UI can manage plugins.
 *
 * @param {Electron.IpcMain} ipcMain
 * @param {{ onRendererEnable?: (plugin: object) => Promise<void>,
 *            onRendererDisable?: (name: string) => Promise<void> }} [callbacks]
 *   Optional hooks called after the main-process enable/disable so the caller
 *   can push the change into live Fluxer web contents without a restart.
 */
function registerIpc(ipcMain, { onRendererEnable, onRendererDisable } = {}) {
  ipcMain.handle(IPC_CH.LIST, () => list());

  ipcMain.handle(IPC_CH.ENABLE, async (_e, name) => {
    enablePlugin(name);
    const entry = _registry.get(name);
    if (onRendererEnable && entry?.module.rendererSrc) {
      await onRendererEnable(entry.module).catch(err =>
        console.error(`[Fluxtop:PluginManager] onRendererEnable("${name}") threw:`, err));
    }
  });

  ipcMain.handle(IPC_CH.DISABLE, async (_e, name) => {
    if (!disablePlugin(name)) return;
    if (onRendererDisable) {
      await onRendererDisable(name).catch(err =>
        console.error(`[Fluxtop:PluginManager] onRendererDisable("${name}") threw:`, err));
    }
  });
}

module.exports = { loadAll, stopAll, startPlugin, stopPlugin, enablePlugin, disablePlugin, list, registerIpc };
