'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fluxtopInstaller', {
  checkStatus: ()   => ipcRenderer.invoke('fluxtop:check-status'),
  selectInstance: (id) => ipcRenderer.invoke('fluxtop:select-instance', id),
  pickInstanceFile: () => ipcRenderer.invoke('fluxtop:pick-instance-file'),
  pickInstanceResources: () => ipcRenderer.invoke('fluxtop:pick-instance-resources'),
  version:     ()   => ipcRenderer.invoke('fluxtop:version'),
  install:     ()   => ipcRenderer.send('fluxtop:install'),
  update:      ()   => ipcRenderer.send('fluxtop:update'),
  uninstall:   ()   => ipcRenderer.send('fluxtop:uninstall'),
  minimize:    ()   => ipcRenderer.send('fluxtop:minimize'),
  close:       ()   => ipcRenderer.send('fluxtop:close'),
  onProgress:  (cb) => ipcRenderer.on('fluxtop:progress', (_e, data) => cb(data)),
  onComplete:  (cb) => ipcRenderer.on('fluxtop:complete', (_e, data) => cb(data)),
});
