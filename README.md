<p align="center">
  <img src=".github/assets/fluxtop-text-logo.svg" alt="Fluxtop"/>
</p>

<p align="center">
  Fluxtop is a Vencord-style runtime injector based on <a href="https://github.com/Its3rr0rsWRLD/Reflux">Its3rr0rsWRLD's Reflux</a> for the <a href="https://github.com/fluxerapp/fluxer">Fluxer</a> desktop app.
</p>

<h3 align="center">
  <a href="docs/writing-plugins.md">📃 Documentation →</a>
</h3>

<h2 align="center">Main features</h2>

- asar injection into Fluxer's main process (ESM-compatible, no repacking for preload)
- CSP stripping so renderer scripts load without restriction
- Plugin lifecycle (`start`, `stop`, enable/disable with persistent state)
- `contextBridge` IPC bridge exposing settings and plugin management to the renderer
- Gateway WebSocket interception (`wss://gateway.fluxer.app`) for event hooks
- Injected **Fluxtop** section inside Fluxer's native settings panel
- Import custom `.js` plugins at runtime with `==FluxtopPlugin==` metadata blocks
- Settings persisted to `%APPDATA%\Fluxtop\settings.json` on Windows or `${XDG_CONFIG_HOME:-~/.config}/fluxtop/settings.json` on Linux

<h2 align="center">Bundled plugins</h2>

| Plugin | Description |
|---|---|
| **Settings UI** | Adds a "Fluxtop" sidebar section to Fluxer settings with plugin toggles and import |
| **Message Logger** | Intercepts `MESSAGE_DELETE` gateway events and re-displays deleted messages inline |

<h2 align="center">Install</h2>

```bash
# Run from the repository root
npm --prefix installer install
npm --prefix installer run gui
# Or if you prefer
npm --prefix installer run cli
```

The GUI detects Fluxer Stable and Canary installations on Windows and Linux. When multiple installations are found, select the one Fluxtop should manage. Linux discovery checks `/opt`, `/usr/lib`, `~/.local/opt`, and `~/.local/share` (including `~/.local/share/Fluxer-Canary`) for native/extracted installs.

Override the target manually:

```bash
FLUXER_ASAR="/path/to/Fluxer/resources/app.asar" npm --prefix installer run cli
```

The GUI also accepts either an `app.asar` file or its containing `resources` directory. CLI use requires `FLUXER_ASAR` when more than one instance is detected. The selected archive and `resources` directory must be writable by the current user; Fluxtop does not elevate privileges. Fluxer AppImage and Flatpak installs are not supported.

<h2 align="center">Uninstall</h2>

```bash
node installer/cli/unpatch.js
```

Restores `app.asar` from the Fluxtop backup after verifying the active archive's marker.

<h2 align="center">Writing a plugin</h2>

Create `src/plugins/<name>/index.js` exporting:

```js
module.exports = {
  name:        'myPlugin',       // unique ID, used as settings key
  displayName: 'My Plugin',      // shown in the UI
  description: 'Does stuff.',
  rendererSrc: require('path').join(__dirname, 'renderer-side.js'), // optional
  start() { /* main-process setup */ },
  stop()  { /* cleanup */ },
};
```

The optional `rendererSrc` file is injected into Fluxer's web context via `executeJavaScript` after the core bootstrap runs. Use `window.__fluxtop` and `window.fluxtopBridge` inside it.

<h3 align="center">Importable plugins (`.js` files)</h3>

Drop a `.js` file into the Plugins → Import panel in Fluxer settings. Optionally include a metadata block at the top:

```js
// ==FluxtopPlugin==
// @name        My Plugin
// @author      3rr0r
// @description Does cool stuff
// @version     1.0.0
// @preview     https://i.imgur.com/example.png
// ==/FluxtopPlugin==
```

<h2 align="center">Repo layout</h2>

```
installer/          Fluxtop installer (GUI and standalone CLI)
  cli/index.js      Install Fluxtop into the selected Fluxer instance
  cli/unpatch.js    Remove Fluxtop from the selected instance
src/
  main-inject.mjs   ESM module injected into Fluxer's main process
  preload.js        Sandboxed preload — exposes fluxtopBridge via contextBridge
  renderer.js       Core bootstrap injected into the web renderer
  core/
    settings.js     Read/write platform-specific Fluxtop settings, IPC handlers
    pluginManager.js  Discover, start/stop plugins, IPC handlers
    patcher.js      Thin wrapper around window.__fluxtop.patcher
  plugins/
    settingsUI/     Settings panel injected into Fluxer's native settings UI
    messageLogger/  Deleted message logger via gateway WebSocket interception
```

<h2 align="center">What injection modifies</h2>

- `resources/app.asar` — `await import(...)` line prepended to `src-electron/dist/main/index.js`
  - backup: `app.asar.bak`
- The selected main entry is identified from the archive's `package.json` and its supported Fluxer main-entry layouts.

Settings are stored under `%APPDATA%\Fluxtop\settings.json` on Windows or `$XDG_CONFIG_HOME/fluxtop/settings.json` (default `~/.config/fluxtop/settings.json`) on Linux. Data from earlier products is not imported.

<h2 align="center">Default install path</h2>

- Windows: `%LOCALAPPDATA%\fluxer_app\app-<version>\resources\`
- Canary: `%LOCALAPPDATA%\Fluxer Canary\app-<version>\resources\`
- Linux: `/opt/Fluxer/resources/`, `/usr/lib/fluxer/resources/`, `~/.local/opt/Fluxer/resources/`, or `~/.local/share/fluxer/resources/` (and Canary equivalents)
