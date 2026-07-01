'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');
const AutoLaunch = require('auto-launch');
const WhatsAppService = require('./whatsapp-service');
const ChatBotService  = require('./chat-bot-service');

const store = new Store({
  defaults: {
    workerUrl: 'https://day-lanches-worker.limaribeiroabraaolimaribeiro.workers.dev',
    printAgentToken: '',
    printerName: '',
    paperType: '80mm',
    autoPrintEnabled: true,
    startWithWindows: false,
    autoMonitorEnabled: false,
    /* chatbot */
    botEnabled: false,
    botBusinessHours: 'Quarta a domingo, das 17h30 às 23h',
    botMenuExpireHours: 12,
    botHandoffPauseHours: 4,
  },
});

let mainWindow = null;
let printWindow = null;
let tray = null;
let autoLauncher = null;
let whatsapp = null;
let chatBot = null;

const isHidden = process.argv.includes('--hidden');

/* ── Tray ── */

function createTray() {
  const iconPath = path.join(__dirname, '..', '..', 'assets', 'icons', 'day-lanches-gestao-512.png');
  let icon;
  try {
    icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
  } catch (_) {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip('Day Lanches Agent');

  updateTrayMenu();

  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}

function updateTrayMenu() {
  if (!tray) return;
  const template = [
    { label: 'Abrir painel', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Iniciar monitoramento', click: () => mainWindow?.webContents.send('tray-start-monitoring') },
    { label: 'Parar monitoramento', click: () => mainWindow?.webContents.send('tray-stop-monitoring') },
    { type: 'separator' },
    { label: 'Sair', click: () => { app.isQuitting = true; app.quit(); } },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));
}

/* ── Window ── */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 780,
    minWidth: 700,
    minHeight: 600,
    title: 'Day Lanches Agent',
    icon: path.join(__dirname, '..', '..', 'assets', 'icons', 'day-lanches-gestao-512.png'),
    show: !isHidden,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if (store.get('autoMonitorEnabled')) {
      mainWindow.webContents.send('auto-start-monitoring');
    }
  });
}

/* ── WhatsApp ── */

function initWhatsApp() {
  const authDir = path.join(app.getPath('userData'), 'whatsapp-auth');
  whatsapp = new WhatsAppService(authDir);

  whatsapp.on('status', (status) => {
    mainWindow?.webContents.send('whatsapp-status-update', status);
  });

  whatsapp.on('qr', (dataUrl) => {
    mainWindow?.webContents.send('whatsapp-qr-update', dataUrl);
  });

  whatsapp.on('error', (msg) => {
    mainWindow?.webContents.send('whatsapp-error', msg);
  });

  if (whatsapp.hasSession()) {
    whatsapp.connect().catch((err) => {
      console.error('[Main] Auto-connect WhatsApp failed:', err);
    });
  }
}

/* ── ChatBot ── */

async function fetchOrderFromWorker(orderNum) {
  const workerUrl = store.get('workerUrl', '').replace(/\/+$/, '');
  const token = store.get('printAgentToken', '');
  if (!workerUrl || !token) return null;
  try {
    const { net } = require('electron');
    const res = await net.fetch(
      `${workerUrl}/local-agent/order-status?order_number=${encodeURIComponent(orderNum)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

function initChatBot() {
  const sessionsFile = path.join(app.getPath('userData'), 'bot-sessions.json');

  chatBot = new ChatBotService(
    sessionsFile,
    () => ({
      botEnabled: store.get('botEnabled', false),
      botBusinessHours: store.get('botBusinessHours', 'Quarta a domingo, das 17h30 às 23h'),
      botMenuExpireHours: store.get('botMenuExpireHours', 12),
      botHandoffPauseHours: store.get('botHandoffPauseHours', 4),
    }),
    fetchOrderFromWorker
  );

  chatBot.on('log', (msg, level) => {
    mainWindow?.webContents.send('chatbot-log', { msg, level });
  });

  whatsapp.on('message', async (parsed) => {
    try {
      const reply = await chatBot.handleMessage(parsed);
      if (reply) await whatsapp.sendMessageToJid(reply.jid, reply.text);
    } catch (err) {
      console.error('[Main] ChatBot reply error:', err);
    }
  });
}

/* ── App lifecycle ── */

app.whenReady().then(() => {
  autoLauncher = new AutoLaunch({
    name: 'Day Lanches Agent',
    path: app.getPath('exe'),
    isHidden: true,
  });

  createWindow();
  createTray();
  initWhatsApp();
  initChatBot();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
  if (whatsapp) whatsapp.destroy();
});

app.on('window-all-closed', () => {
  /* Não fechar — continua rodando na bandeja */
});

/* ── IPC: Config ── */

ipcMain.handle('get-config', () => store.store);

ipcMain.handle('save-config', (_event, config) => {
  for (const [key, value] of Object.entries(config)) {
    store.set(key, value);
  }
  return { success: true };
});

/* ── IPC: Printers ── */

ipcMain.handle('get-printers', async () => {
  const win = mainWindow || BrowserWindow.getAllWindows()[0];
  if (!win) return [];
  const printers = await win.webContents.getPrintersAsync();
  return printers.map(p => ({
    name: p.name,
    displayName: p.displayName || p.name,
    isDefault: p.isDefault,
    status: p.status,
  }));
});

/* ── IPC: Auto Launch ── */

ipcMain.handle('set-auto-launch', async (_event, enabled) => {
  try {
    if (enabled) {
      await autoLauncher.enable();
    } else {
      await autoLauncher.disable();
    }
    store.set('startWithWindows', enabled);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-auto-launch', async () => {
  try {
    return await autoLauncher.isEnabled();
  } catch {
    return false;
  }
});

/* ── IPC: Auto Monitor ── */

ipcMain.handle('set-auto-monitor', (_event, enabled) => {
  store.set('autoMonitorEnabled', enabled);
  return { success: true };
});

ipcMain.handle('get-auto-monitor', () => {
  return store.get('autoMonitorEnabled', false);
});

/* ── IPC: Print receipt ── */

ipcMain.handle('print-receipt', async (_event, { html, printerName, paperType }) => {
  return new Promise((resolve) => {
    if (printWindow && !printWindow.isDestroyed()) {
      printWindow.destroy();
    }

    printWindow = new BrowserWindow({
      show: false,
      width: paperType === 'A4' ? 794 : (paperType === '58mm' ? 220 : 302),
      height: 1200,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    printWindow.webContents.on('did-finish-load', () => {
      const printOptions = {
        silent: true,
        printBackground: true,
        margins: { marginType: 'none' },
      };

      if (printerName && printerName !== '__default__') {
        printOptions.deviceName = printerName;
      }

      printWindow.webContents.print(printOptions, (success, failureReason) => {
        if (printWindow && !printWindow.isDestroyed()) {
          printWindow.destroy();
          printWindow = null;
        }

        if (success) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: failureReason || 'Falha na impressao' });
        }
      });
    });

    printWindow.webContents.on('did-fail-load', () => {
      if (printWindow && !printWindow.isDestroyed()) {
        printWindow.destroy();
        printWindow = null;
      }
      resolve({ success: false, error: 'Falha ao carregar HTML da comanda' });
    });
  });
});

/* ── IPC: WhatsApp ── */

ipcMain.handle('whatsapp-connect', async () => {
  try {
    /* Clique manual: sempre forca um novo QR Code (limpa sessao travada/invalida se houver) */
    await whatsapp.connect({ forceNewQR: true });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('whatsapp-new-qr', async () => {
  try {
    await whatsapp.generateNewQR();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('whatsapp-reset', async () => {
  try {
    await whatsapp.resetConnection();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('whatsapp-disconnect', async () => {
  try {
    await whatsapp.disconnect();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('whatsapp-get-status', () => {
  return whatsapp ? whatsapp.getStatus() : 'disconnected';
});

ipcMain.handle('whatsapp-get-qr', () => {
  return whatsapp ? whatsapp.getQR() : null;
});

ipcMain.handle('whatsapp-send-message', async (_event, { phone, message }) => {
  try {
    await whatsapp.sendMessage(phone, message);
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

/* ── IPC: ChatBot ── */

ipcMain.handle('chatbot-get-config', () => ({
  botEnabled:           store.get('botEnabled', false),
  botBusinessHours:     store.get('botBusinessHours', 'Quarta a domingo, das 17h30 às 23h'),
  botMenuExpireHours:   store.get('botMenuExpireHours', 12),
  botHandoffPauseHours: store.get('botHandoffPauseHours', 4),
}));

ipcMain.handle('chatbot-set-config', (_event, config) => {
  const allowed = ['botEnabled', 'botBusinessHours', 'botMenuExpireHours', 'botHandoffPauseHours'];
  for (const key of allowed) {
    if (key in config) store.set(key, config[key]);
  }
  return { success: true };
});

ipcMain.handle('chatbot-get-stats', () => {
  return chatBot ? chatBot.getStats() : { total: 0, lastReceivedAt: null, sessionCount: 0 };
});

ipcMain.handle('chatbot-clear-sessions', () => {
  if (chatBot) chatBot.clearSessions();
  return { success: true };
});
