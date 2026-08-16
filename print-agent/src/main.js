'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell } = require('electron');
const path = require('path');
const Store = require('electron-store');
const AutoLaunch = require('auto-launch');

/* Reduz uso de GPU/driver em computadores antigos (evita crashes/telas pretas
   em hardware/driver de video desatualizado). Precisa rodar antes do app ficar pronto. */
app.disableHardwareAcceleration();

const store = new Store({
  defaults: {
    workerUrl: 'https://day-lanches-worker.limaribeiroabraaolimaribeiro.workers.dev',
    printAgentToken: '',
    printerName: '',
    paperType: '80mm',
    autoPrintEnabled: true,
    startWithWindows: false,
  },
});

let mainWindow = null;
let printWindow = null;
let tray = null;
let autoLauncher = null;

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
  tray.setToolTip('Day Lanches Impressão');

  const template = [
    { label: 'Abrir painel', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Sair', click: () => { app.isQuitting = true; app.quit(); } },
  ];
  tray.setContextMenu(Menu.buildFromTemplate(template));

  tray.on('double-click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
}

/* ── Window ── */

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 440,
    height: 640,
    minWidth: 380,
    minHeight: 560,
    title: 'Day Lanches Impressão',
    icon: path.join(__dirname, '..', '..', 'assets', 'icons', 'day-lanches-gestao-512.png'),
    show: !isHidden,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  /* Nunca navegar para fora do app nem abrir novas janelas — a janela so mostra
     o index.html local, nunca um site externo. */
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('file://')) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

/* ── App lifecycle ── */

app.whenReady().then(() => {
  autoLauncher = new AutoLaunch({
    name: 'Day Lanches Impressão',
    path: app.getPath('exe'),
    isHidden: true,
  });

  createWindow();
  createTray();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('before-quit', () => {
  app.isQuitting = true;
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
  try {
    const win = mainWindow || BrowserWindow.getAllWindows()[0];
    if (!win) return [];
    const printers = await win.webContents.getPrintersAsync();
    return printers.map(p => ({
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: p.isDefault,
      status: p.status,
    }));
  } catch (_) {
    /* Nao ha impressora instalada ou o Windows falhou ao listar — nunca travar o app */
    return [];
  }
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
