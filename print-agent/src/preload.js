const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /* Config */
  getConfig:     ()        => ipcRenderer.invoke('get-config'),
  saveConfig:    (config)  => ipcRenderer.invoke('save-config', config),
  getPrinters:   ()        => ipcRenderer.invoke('get-printers'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
  getAutoLaunch: ()        => ipcRenderer.invoke('get-auto-launch'),

  /* Print */
  printReceipt: (data) => ipcRenderer.invoke('print-receipt', data),
});
