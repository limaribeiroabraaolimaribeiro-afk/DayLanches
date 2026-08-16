'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, safeStorage } = require('electron');
const path = require('path');
const https = require('https');
const Store = require('electron-store');
const AutoLaunch = require('auto-launch');

/* Electron 22 roda sobre Node 16 — nao tem fetch() global nem net.fetch()
   (isso so chegou no Electron 25). Pra nao adicionar uma dependencia so
   pra um unico POST, usa o modulo https nativo do Node diretamente. */
function httpsPostJson(urlString, bodyObj) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(urlString);
    } catch (err) {
      reject(err);
      return;
    }

    const payload = Buffer.from(JSON.stringify(bodyObj || {}), 'utf8');
    const req = https.request({
      hostname: target.hostname,
      port: target.port || 443,
      path: target.pathname + target.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length,
      },
      timeout: 15000,
    }, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        let data = {};
        try { data = raw ? JSON.parse(raw) : {}; } catch (_) { /* resposta nao-JSON */ }
        resolve({ status: res.statusCode, data });
      });
    });

    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/* Reduz uso de GPU/driver em computadores antigos (evita crashes/telas pretas
   em hardware/driver de video desatualizado). Precisa rodar antes do app ficar pronto. */
app.disableHardwareAcceleration();

/* URL do servidor — fixa no app, nunca editada pela usuaria. Nao e secreta
   (e um endereco publico), so nao faz sentido pedir pra Dayane digitar. */
const WORKER_URL = 'https://day-lanches-worker.limaribeiroabraaolimaribeiro.workers.dev';

const store = new Store({
  defaults: {
    /* base64 do device token cifrado via safeStorage. Vazio = nao ativado.
       O token em texto puro NUNCA e gravado em disco. */
    deviceTokenEncrypted: '',
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

/* ── Credencial do dispositivo (safeStorage / DPAPI no Windows) ──

   safeStorage existe desde o Electron 15 — a versao 22.3.27 usada aqui tem
   suporte completo. No Windows, a chave de criptografia vem do DPAPI, presa
   ao usuario+maquina do Windows: o arquivo de config nao serve pra nada se
   copiado pra outro computador ou aberto por outro usuario.

   isEncryptionAvailable() so da resultado confiavel depois do app.whenReady()
   — nunca chamar antes disso. */

function isSafeStorageAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch (_) {
    return false;
  }
}

/* Retorna o device token em texto puro, ou null se nao ativado / nao decifravel. */
function getDeviceToken() {
  const encB64 = store.get('deviceTokenEncrypted', '');
  if (!encB64) return null;
  if (!isSafeStorageAvailable()) return null;
  try {
    return safeStorage.decryptString(Buffer.from(encB64, 'base64'));
  } catch (err) {
    console.error('[Main] Falha ao decifrar device token (arquivo corrompido ou de outro usuario/maquina):', err.message);
    return null;
  }
}

function setDeviceToken(rawToken) {
  const encrypted = safeStorage.encryptString(rawToken);
  store.set('deviceTokenEncrypted', encrypted.toString('base64'));
}

function clearDeviceToken() {
  store.set('deviceTokenEncrypted', '');
}

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

/* ── IPC: Ativação ── */

ipcMain.handle('get-activation-status', () => {
  const safeStorageOk = isSafeStorageAvailable();
  const hasStoredToken = !!store.get('deviceTokenEncrypted', '');
  const token = safeStorageOk ? getDeviceToken() : null;
  return {
    activated: !!token,
    safeStorageAvailable: safeStorageOk,
    /* Tinha token salvo mas nao consegue mais decifrar (safeStorage sumiu,
       ou perfil do Windows mudou) — precisa reativar, e a usuaria precisa saber
       o motivo em vez de simplesmente "nao funcionou". */
    needsReactivation: hasStoredToken && !token,
  };
});

ipcMain.handle('activate-device', async (_event, { code }) => {
  if (!isSafeStorageAvailable()) {
    /* Nunca salvar o token em texto puro como alternativa silenciosa. */
    return {
      success: false,
      error: 'Este Windows não tem suporte a armazenamento seguro de credenciais (safeStorage/DPAPI indisponível). Por segurança, a ativação foi bloqueada. Fale com o suporte.',
    };
  }

  try {
    const { status, data } = await httpsPostJson(`${WORKER_URL}/print-agent/activate`, {
      code: String(code || '').trim(),
      deviceLabel: require('os').hostname(),
    });

    if (status === 429) return { success: false, error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' };
    if (status === 410) return { success: false, error: 'Código expirado. Peça um novo código ao suporte.' };
    if (status < 200 || status >= 300 || !data.deviceToken) {
      return { success: false, error: 'Código inválido. Confira e tente novamente.' };
    }

    setDeviceToken(data.deviceToken);
    return { success: true };
  } catch (err) {
    return { success: false, error: 'Sem conexão com a internet. Verifique e tente novamente.' };
  }
});

ipcMain.handle('deactivate-device', () => {
  clearDeviceToken();
  return { success: true };
});

/* Entrega o token em texto puro pro renderer, que ja faz as chamadas HTTP de
   polling/impressao diretamente (mesma estrutura de antes). O token so existe
   cifrado em disco — em memoria, no processo da propria janela, ele precisa
   estar legivel pra montar o header Authorization das requisicoes. */
ipcMain.handle('get-device-token', () => getDeviceToken());

ipcMain.handle('get-worker-url', () => WORKER_URL);

/* ── IPC: Config ── */

ipcMain.handle('get-config', () => {
  const { deviceTokenEncrypted, ...safeConfig } = store.store;
  return safeConfig; /* nunca devolve o campo cifrado pro renderer por engano */
});

ipcMain.handle('save-config', (_event, config) => {
  const allowed = ['printerName', 'paperType', 'autoPrintEnabled', 'startWithWindows'];
  for (const key of allowed) {
    if (key in config) store.set(key, config[key]);
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
