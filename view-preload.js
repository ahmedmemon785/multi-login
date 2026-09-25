'use strict';
const { contextBridge, ipcRenderer } = require('electron');

// Expose a minimal bridge into the page world so the injected
// Notification override can send data back to the main process.
contextBridge.exposeInMainWorld('__mlNotif', {
  send: (data) => ipcRenderer.send('web-notification', data),
});
