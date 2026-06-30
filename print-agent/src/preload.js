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

  /* WhatsApp */
  whatsappConnect:    ()          => ipcRenderer.invoke('whatsapp-connect'),
  whatsappDisconnect: ()          => ipcRenderer.invoke('whatsapp-disconnect'),
  whatsappGetStatus:  ()          => ipcRenderer.invoke('whatsapp-get-status'),
  whatsappGetQR:      ()          => ipcRenderer.invoke('whatsapp-get-qr'),
  whatsappSend:       (data)      => ipcRenderer.invoke('whatsapp-send-message', data),

  /* ChatBot */
  chatbotGetConfig:     ()       => ipcRenderer.invoke('chatbot-get-config'),
  chatbotSetConfig:     (config) => ipcRenderer.invoke('chatbot-set-config', config),
  chatbotGetStats:      ()       => ipcRenderer.invoke('chatbot-get-stats'),
  chatbotClearSessions: ()       => ipcRenderer.invoke('chatbot-clear-sessions'),

  /* Events from main process */
  onAutoStartMonitoring: (cb) => ipcRenderer.on('auto-start-monitoring', cb),
  onTrayStartMonitoring: (cb) => ipcRenderer.on('tray-start-monitoring', cb),
  onTrayStopMonitoring:  (cb) => ipcRenderer.on('tray-stop-monitoring', cb),
  onWhatsAppStatus:      (cb) => ipcRenderer.on('whatsapp-status-update', (_e, s) => cb(s)),
  onWhatsAppQR:          (cb) => ipcRenderer.on('whatsapp-qr-update', (_e, url) => cb(url)),
  onWhatsAppError:       (cb) => ipcRenderer.on('whatsapp-error', (_e, msg) => cb(msg)),
  onChatbotLog:          (cb) => ipcRenderer.on('chatbot-log', (_e, data) => cb(data)),
});
