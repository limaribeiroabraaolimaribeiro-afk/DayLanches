const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /* Ativação */
  getActivationStatus: () => ipcRenderer.invoke('get-activation-status'),
  activateDevice:       (code) => ipcRenderer.invoke('activate-device', { code }),
  deactivateDevice:     () => ipcRenderer.invoke('deactivate-device'),
  getDeviceToken:       () => ipcRenderer.invoke('get-device-token'),
  getWorkerUrl:         () => ipcRenderer.invoke('get-worker-url'),

  /* Config */
  getConfig:     ()        => ipcRenderer.invoke('get-config'),
  saveConfig:    (config)  => ipcRenderer.invoke('save-config', config),
  getPrinters:   ()        => ipcRenderer.invoke('get-printers'),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('set-auto-launch', enabled),
  getAutoLaunch: ()        => ipcRenderer.invoke('get-auto-launch'),

  /* Print */
  printReceipt: (data) => ipcRenderer.invoke('print-receipt', data),
});
