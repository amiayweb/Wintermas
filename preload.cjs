const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('wintermas', {
  settings: () => ipcRenderer.invoke('settings:get'),
  update: (patch) => ipcRenderer.invoke('settings:set', patch),
  onSettings: (callback) => ipcRenderer.on('settings:changed', (_, settings) => callback(settings)),
  onDesktop: (callback) => ipcRenderer.on('desktop', (_, frame) => callback(frame)),
  onAction: (callback) => ipcRenderer.on('effect:action', (_, action) => callback(action)),
  snowballPointer: capture => ipcRenderer.send('snowball:pointer', capture),
  action: (action, color) => ipcRenderer.invoke('effect:action', action, color),
  widget: (open, contentHeight) => ipcRenderer.invoke('widget:open', open, contentHeight),
  hideWidget: () => ipcRenderer.invoke('widget:hide'),
});

