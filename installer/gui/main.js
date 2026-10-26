'use strict';

const {app, BrowserWindow, ipcMain, dialog} = require('electron');
const path = require('node:path');
const {Worker} = require('worker_threads');
const {createInstanceRegistry} = require('./instance-registry.js');

// ── Constants ─────────────────────────────────────────────────────────────────

// In dev mode, pass the local src/ path to the worker so it uses it directly.
// In packaged mode, the worker downloads src from GitHub releases instead.
const DEV_SRC = path.join(__dirname, '..', '..', 'src');

const instanceRegistry = createInstanceRegistry();

function checkStatus() {
	try {
		const {instances, selected} = instanceRegistry.refresh();
		if (!selected) return {found: instances.length > 0, installed: false, instances, selectedId: null, error: null};
		return {
			found: true,
			installed: selected.installed,
			resourcesDir: selected.resourcesDir,
			asarPath: selected.asarPath,
			instances,
			selectedId: selected.id,
			writable: selected.writable,
			conflict: selected.conflict,
			error: null,
		};
	} catch (err) {
		return {found: false, installed: false, instances: [], selectedId: null, error: err.message};
	}
}

function requireSelectedInstance(purpose) {
	const {instances, selected} = instanceRegistry.refresh();
	if (!selected) {
		if (instances.length > 1) throw new Error('Select a Fluxer instance before continuing.');
		throw new Error('Could not locate a supported Fluxer instance.');
	}
	if (selected.conflict) throw new Error(`Backup conflict at ${selected.asarPath}; this archive is not a verified Fluxtop install.`);
	if (!selected.writable) throw new Error(`No write permission for selected Fluxer instance: ${selected.asarPath}`);
	if (purpose === 'uninstall' && (!selected.installed || !selected.hasBackup)) {
		throw new Error('Selected instance has no marker-verified Fluxtop installation.');
	}
	return selected;
}

// ── Worker spawn ──────────────────────────────────────────────────────────────

function spawnWorker(win, op, asarPath, replaceLegacy = false) {
	return new Promise((resolve) => {
		const send = (type, message) => {
			if (win && !win.isDestroyed()) win.webContents.send('fluxtop:progress', {type, message});
		};
		const complete = (success, message) => {
			if (win && !win.isDestroyed()) win.webContents.send('fluxtop:complete', {success, message});
			resolve();
		};

		const worker = new Worker(path.join(__dirname, 'worker.js'), {
			workerData: {op, asarPath, isPackaged: app.isPackaged, devSrc: DEV_SRC, replaceLegacy},
		});

		worker.on('message', (msg) => {
			if (msg.event === 'progress') send(msg.type, msg.message);
			else if (msg.event === 'complete') complete(msg.success, msg.message);
		});

		worker.on('error', (err) => {
			send('error', err.message);
			complete(false, err.message);
		});
	});
}

// ── Window ────────────────────────────────────────────────────────────────────

let win;
let operating = false;

app.whenReady().then(() => {
	win = new BrowserWindow({
		width: 480,
		height: 620,
		frame: false,
		transparent: true,
		resizable: false,
		maximizable: false,
		fullscreenable: false,
		center: true,
		webPreferences: {
			preload: path.join(__dirname, 'preload.js'),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: false,
		},
	});

	win.loadFile(path.join(__dirname, 'index.html'));

	win.on('close', (e) => {
		if (operating) e.preventDefault();
	});

	ipcMain.handle('fluxtop:check-status', () => checkStatus());
	ipcMain.handle('fluxtop:version', () => app.getVersion());
	ipcMain.handle('fluxtop:select-instance', (_event, id) => {
		instanceRegistry.select(id);
		return checkStatus();
	});
	ipcMain.handle('fluxtop:select-manual-instance', (_event, input) => {
		instanceRegistry.selectManual(input);
		return checkStatus();
	});
	ipcMain.handle('fluxtop:pick-instance-file', async () => {
		const result = await dialog.showOpenDialog(win, {
			properties: ['openFile'],
			filters: [{name: 'Fluxer archive', extensions: ['asar']}],
		});
		if (result.canceled || !result.filePaths.length) return checkStatus();
		instanceRegistry.selectManual(result.filePaths[0]);
		return checkStatus();
	});
	ipcMain.handle('fluxtop:pick-instance-resources', async () => {
		const result = await dialog.showOpenDialog(win, {
			properties: ['openDirectory'],
		});
		if (result.canceled || !result.filePaths.length) return checkStatus();
		instanceRegistry.selectManual(result.filePaths[0]);
		return checkStatus();
	});

	ipcMain.on('fluxtop:install', async () => {
		operating = true;
		try {
			const selected = requireSelectedInstance('install');
			let replaceLegacy = false;
			if (selected.legacyInstalled) {
				const result = await dialog.showMessageBox(win, {
					type: 'warning',
					buttons: ['Cancel', 'Replace Reflux with Fluxtop'],
					defaultId: 0,
					cancelId: 0,
					title: 'Replace Reflux injection?',
					message: 'This will replace the Reflux injection in the selected Fluxer instance.',
					detail: 'Fluxtop will first copy Reflux settings and imported plugins on startup. Your Reflux settings file and the original app.asar backup will be retained. Continue only if you want Fluxtop to replace Reflux.',
				});
				if (result.response !== 1) {
					if (win && !win.isDestroyed()) win.webContents.send('fluxtop:complete', {success: false, message: 'Replacement cancelled; no files were changed.'});
					return;
				}
				replaceLegacy = true;
			}
			await spawnWorker(win, 'install', selected.asarPath, replaceLegacy);
		} catch (err) {
			if (win && !win.isDestroyed()) {
				win.webContents.send('fluxtop:progress', {type: 'error', message: err.message});
				win.webContents.send('fluxtop:complete', {success: false, message: err.message});
			}
		} finally {
			operating = false;
		}
	});

	ipcMain.on('fluxtop:uninstall', async () => {
		operating = true;
		try {
			const selected = requireSelectedInstance('uninstall');
			await spawnWorker(win, 'uninstall', selected.asarPath);
		} catch (err) {
			if (win && !win.isDestroyed()) {
				win.webContents.send('fluxtop:progress', {type: 'error', message: err.message});
				win.webContents.send('fluxtop:complete', {success: false, message: err.message});
			}
		} finally {
			operating = false;
		}
	});

	ipcMain.on('fluxtop:update', async () => {
		operating = true;
		try {
			await spawnWorker(win, 'update', null);
		} catch (err) {
			if (win && !win.isDestroyed()) {
				win.webContents.send('fluxtop:progress', {type: 'error', message: err.message});
				win.webContents.send('fluxtop:complete', {success: false, message: err.message});
			}
		} finally {
			operating = false;
		}
	});

	ipcMain.on('fluxtop:minimize', () => win.minimize());
	ipcMain.on('fluxtop:close', () => app.quit());
});

app.on('window-all-closed', () => app.quit());
