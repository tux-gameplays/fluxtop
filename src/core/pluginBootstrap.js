'use strict';

function loadPluginsWhenReady(app, pluginManager) {
	return app.whenReady().then(() => pluginManager.loadAll());
}

module.exports = {loadPluginsWhenReady};
