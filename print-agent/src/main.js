const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const AutoLaunch = require('auto-launch');

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

const autoLauncher = new AutoLaunch({
  name: 'Day Lanches Print Agent',
  path: app.getPath('exe'),
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 720,
    minWidth: 600,
    minHeight: 500,
    title: 'Day Lanches Print Agent',
    icon: path.join(__dirname, '..', '..', 'assets', 'icons', 'day-lanches-gestao-512.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
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
  const printers = win.webContents.getPrinters();
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
          resolve({ success: false, error: failureReason || 'Falha na impressão' });
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
