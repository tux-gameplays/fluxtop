/**
 * src/plugins/settingsUI/index.js
 *
 * Main-process stub for the Fluxtop Settings UI plugin.
 * All real work happens in renderer-side.js, which injects a "Fluxtop"
 * section into Fluxer's settings sidebar and renders the plugins panel.
 */

'use strict';

const path = require('node:path');

module.exports = {
  name: 'settingsUI',
  displayName: 'Fluxtop',
  disableable: false,
  description: 'Plugin Injector and Settings UI manager',
  rendererSrc: path.join(__dirname, 'renderer-side.js'),
  start() { },
  stop() { },
};
