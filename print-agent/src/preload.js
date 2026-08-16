const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  /* Config */
  getConfig:      ()          => ipcRenderer.invoke('get-config'),
  saveConfig:     (config)    => ipcRenderer.invoke('save-config', config),
  getPrinters:    ()          => ipcRenderer.invoke('get-printers'),
  setAutoLaunch:  (enabled)   => ipcRenderer.invoke('set-auto-launch', enabled),
  getAutoLaunch:  ()          => ipcRenderer.invoke('get-auto-launch'),
  setAutoMonitor: (enabled)   => ipcRenderer.invoke('set-auto-monitor', enabled),
  getAutoMonitor: ()          => ipcRenderer.invoke('get-auto-monitor'),

  /* Print */
  printReceipt:   (data)      => ipcRenderer.invoke('print-receipt', data),

  /* Events from main process */
  onAutoStartMonitoring: (cb) => ipcRenderer.on('auto-start-monitoring', cb),
  onTrayStartMonitoring: (cb) => ipcRenderer.on('tray-start-monitoring', cb),
  onTrayStopMonitoring:  (cb) => ipcRenderer.on('tray-stop-monitoring', cb),
});
