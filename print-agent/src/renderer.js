'use strict';

const PRINT_POLL_MS = 5000;
const NOTIF_POLL_MS = 10000;

const state = {
  monitoring: false,
  printTimer: null,
  notifTimer: null,
  printedCache: new Set(),
  printedCount: 0,
  printErrors: 0,
  waSentCount: 0,
  waErrors: 0,
  firstPrintRun: true,
  waStatus: 'disconnected',
};

/* ── DOM helpers ── */
const $ = (id) => document.getElementById(id);

const ui = {
  workerUrl:    () => $('cfg-worker-url'),
  token:        () => $('cfg-token'),
  printer:      () => $('cfg-printer'),
  paper:        () => $('cfg-paper'),
  autoPrint:    () => $('cfg-auto-print'),
  autoLaunch:   () => $('cfg-auto-launch'),
  autoMonitor:  () => $('cfg-auto-monitor'),
  btnSave:      () => $('btn-save'),
  btnTestConn:  () => $('btn-test-conn'),
  btnTestPrint: () => $('btn-test-print'),
  btnStart:     () => $('btn-start'),
  btnStop:      () => $('btn-stop'),
  statusDot:    () => $('status-dot'),
  statusText:   () => $('status-text'),
  statPrinted:  () => $('stat-printed'),
  statPrintErr: () => $('stat-print-errors'),
  statWaSent:   () => $('stat-wa-sent'),
  statWaErr:    () => $('stat-wa-errors'),
  statLastChk:  () => $('stat-last-check'),
  logsArea:     () => $('logs-area'),
  waIndicator:  () => $('wa-indicator'),
  waStatusText: () => $('wa-status-text'),
  waQrContainer:() => $('wa-qr-container'),
  waQrImg:      () => $('wa-qr-img'),
  btnWaConnect: () => $('btn-wa-connect'),
  btnWaDisconn: () => $('btn-wa-disconnect'),
  waTestPhone:  () => $('wa-test-phone'),
  btnWaTest:    () => $('btn-wa-test'),
};

/* ── Logging ── */
function log(message, level = 'info') {
  const area = ui.logsArea();
  const time = new Date().toLocaleTimeString('pt-BR');
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-${level}">${escHtml(message)}</span>`;
  area.prepend(line);
  while (area.children.length > 300) area.removeChild(area.lastChild);
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Status ── */
function setStatus(text, type) {
  const dot = ui.statusDot();
  const txt = ui.statusText();
  dot.className = 'status-dot ' + (type || '');
  txt.textContent = text;
}

function updateStats() {
  ui.statPrinted().textContent = state.printedCount;
  ui.statPrintErr().textContent = state.printErrors;
  ui.statWaSent().textContent = state.waSentCount;
  ui.statWaErr().textContent = state.waErrors;
  ui.statLastChk().textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/* ── Tabs ── */
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      const target = $('tab-' + btn.dataset.tab);
      if (target) target.classList.add('active');
    });
  });
}

/* ── Config ── */
async function loadConfig() {
  const config = await window.api.getConfig();

  ui.workerUrl().value = config.workerUrl || '';
  ui.token().value = config.printAgentToken || '';
  ui.paper().value = config.paperType || '80mm';
  ui.autoPrint().checked = config.autoPrintEnabled !== false;

  const isAutoLaunch = await window.api.getAutoLaunch();
  ui.autoLaunch().checked = isAutoLaunch;

  const isAutoMonitor = await window.api.getAutoMonitor();
  ui.autoMonitor().checked = isAutoMonitor;

  await loadPrinters(config.printerName);
}

async function loadPrinters(selectedName) {
  const printers = await window.api.getPrinters();
  const select = ui.printer();

  select.innerHTML = '<option value="__default__">Impressora padrao do Windows</option>';

  printers.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.displayName + (p.isDefault ? ' (padrao)' : '');
    select.appendChild(opt);
  });

  if (selectedName) select.value = selectedName;
}

async function saveConfig() {
  const config = {
    workerUrl: ui.workerUrl().value.trim().replace(/\/+$/, ''),
    printAgentToken: ui.token().value.trim(),
    printerName: ui.printer().value,
    paperType: ui.paper().value,
    autoPrintEnabled: ui.autoPrint().checked,
  };

  await window.api.saveConfig(config);

  await window.api.setAutoLaunch(ui.autoLaunch().checked);
  await window.api.setAutoMonitor(ui.autoMonitor().checked);

  log('Configuracoes salvas.', 'success');
}

/* ── API helpers ── */
function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ui.token().value.trim()}`,
  };
}

function getBaseUrl() {
  return ui.workerUrl().value.trim().replace(/\/+$/, '');
}

/* ── Connection test ── */
async function testConnection() {
  const btn = ui.btnTestConn();
  btn.disabled = true;
  btn.textContent = 'Testando...';

  try {
    const url = `${getBaseUrl()}/print-agent/health`;
    const res = await fetch(url, { headers: getHeaders() });

    if (res.status === 401) {
      log('Token invalido.', 'error');
      setStatus('Token invalido', 'error');
      return;
    }

    if (!res.ok) {
      log(`Erro de conexao: HTTP ${res.status}`, 'error');
      setStatus('Erro de conexao', 'error');
      return;
    }

    const data = await res.json();
    if (data.ok) {
      log('Conexao com o Worker OK.', 'success');
      setStatus('Conectado', 'connected');
    }
  } catch (err) {
    log(`Erro ao conectar: ${err.message}`, 'error');
    setStatus('Desconectado', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Testar conexao';
  }
}

/* ── Print test ── */
async function testPrint() {
  const btn = ui.btnTestPrint();
  btn.disabled = true;
  btn.textContent = 'Imprimindo...';

  try {
    const paperType = ui.paper().value;
    const html = window.buildTestReceiptHtml(paperType);
    const printerName = ui.printer().value;

    const result = await window.api.printReceipt({ html, printerName, paperType });

    if (result.success) log('Teste de impressao OK.', 'success');
    else log(`Erro no teste: ${result.error}`, 'error');
  } catch (err) {
    log(`Erro ao testar impressao: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Testar impressao';
  }
}

/* ══════════════════════════════════════════════════════════
   MONITORAMENTO (impressao + notificacoes)
══════════════════════════════════════════════════════════ */

function startMonitoring() {
  if (state.monitoring) return;

  const token = ui.token().value.trim();
  const workerUrl = ui.workerUrl().value.trim();

  if (!token) { log('Configure o token antes de iniciar.', 'warn'); return; }
  if (!workerUrl) { log('Configure a URL do Worker antes de iniciar.', 'warn'); return; }

  state.monitoring = true;
  state.firstPrintRun = true;
  ui.btnStart().style.display = 'none';
  ui.btnStop().style.display = '';
  setStatus('Monitorando...', 'monitoring');
  log('Monitoramento iniciado.', 'info');

  pollOrders();
  state.printTimer = setInterval(pollOrders, PRINT_POLL_MS);

  pollNotifications();
  state.notifTimer = setInterval(pollNotifications, NOTIF_POLL_MS);
}

function stopMonitoring() {
  state.monitoring = false;
  if (state.printTimer) { clearInterval(state.printTimer); state.printTimer = null; }
  if (state.notifTimer) { clearInterval(state.notifTimer); state.notifTimer = null; }
  ui.btnStart().style.display = '';
  ui.btnStop().style.display = 'none';
  setStatus('Parado', '');
  log('Monitoramento parado.', 'warn');
}

/* ── Print polling ── */

async function pollOrders() {
  if (!state.monitoring) return;

  try {
    const url = `${getBaseUrl()}/print-agent/pending-orders`;
    const res = await fetch(url, { headers: getHeaders() });

    if (res.status === 401) {
      log('Token invalido. Parando.', 'error');
      setStatus('Token invalido', 'error');
      stopMonitoring();
      return;
    }

    if (!res.ok) {
      log(`Erro ao buscar pedidos: HTTP ${res.status}`, 'error');
      state.printErrors++;
      updateStats();
      return;
    }

    const data = await res.json();
    const orders = data.orders || [];
    updateStats();

    if (!orders.length) {
      if (state.firstPrintRun) {
        log('Nenhum pedido pendente de impressao.', 'info');
        state.firstPrintRun = false;
      }
      return;
    }

    if (state.firstPrintRun && orders.length > 5) {
      log(`${orders.length} pedidos sem comanda. Imprimindo...`, 'warn');
    }
    state.firstPrintRun = false;

    if (!ui.autoPrint().checked) {
      log(`${orders.length} pendente(s), impressao automatica desativada.`, 'warn');
      return;
    }

    for (const order of orders) {
      if (state.printedCache.has(order.id)) continue;
      await printOrder(order);
    }
  } catch (err) {
    log(`Erro na verificacao de pedidos: ${err.message}`, 'error');
    state.printErrors++;
    updateStats();
  }
}

async function printOrder(order) {
  const num = order.order_number || order.id?.slice(0, 8) || '?';

  try {
    const paperType = ui.paper().value;
    const html = window.buildReceiptHtml(order, paperType);
    const printerName = ui.printer().value;

    log(`Imprimindo #${num}...`, 'info');
    const result = await window.api.printReceipt({ html, printerName, paperType });

    if (!result.success) {
      log(`Erro ao imprimir #${num}: ${result.error}`, 'error');
      state.printErrors++;
      updateStats();
      return;
    }

    log(`Comanda #${num} impressa.`, 'success');
    state.printedCache.add(order.id);
    await markPrinted(order.id, num);
    state.printedCount++;
    updateStats();
  } catch (err) {
    log(`Erro ao imprimir #${num}: ${err.message}`, 'error');
    state.printErrors++;
    updateStats();
  }
}

async function markPrinted(orderId, orderNum) {
  try {
    const url = `${getBaseUrl()}/print-agent/mark-printed`;
    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ order_id: orderId }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success) log(`#${orderNum} marcado como impresso.`, 'success');
    } else {
      log(`Erro ao marcar #${orderNum}: HTTP ${res.status}`, 'error');
    }
  } catch (err) {
    log(`Erro ao marcar #${orderNum}: ${err.message}`, 'error');
  }
}

/* ── Notification polling ── */

let _notifFirstWarn = true;

async function pollNotifications() {
  if (!state.monitoring) return;

  try {
    const url = `${getBaseUrl()}/local-agent/pending-notifications`;
    const res = await fetch(url, { headers: getHeaders() });

    if (!res.ok) {
      if (res.status !== 401) log(`Erro ao buscar notificacoes: HTTP ${res.status}`, 'error');
      return;
    }

    const data = await res.json();
    const notifications = data.notifications || [];

    if (!notifications.length) return;

    if (state.waStatus !== 'connected') {
      if (_notifFirstWarn) {
        log(`${notifications.length} notificacao(oes) pendente(s), WhatsApp nao conectado.`, 'warn');
        _notifFirstWarn = false;
      }
      return;
    }

    _notifFirstWarn = true;

    for (const notif of notifications) {
      await processNotification(notif);
      await sleep(2000);
    }
  } catch (err) {
    log(`Erro ao verificar notificacoes: ${err.message}`, 'error');
  }
}

async function processNotification(notif) {
  const num = notif.order_number || '?';

  try {
    const result = await window.api.whatsappSend({
      phone: notif.customer_phone,
      message: notif.message,
    });

    if (result.success) {
      await markNotifSent(notif.id);
      log(`WhatsApp enviado: pedido #${num} (${notif.status})`, 'success');
      state.waSentCount++;
    } else {
      await markNotifFailed(notif.id, result.error);
      log(`Falha WhatsApp #${num}: ${result.error}`, 'error');
      state.waErrors++;
    }
  } catch (err) {
    await markNotifFailed(notif.id, err.message);
    log(`Erro WhatsApp #${num}: ${err.message}`, 'error');
    state.waErrors++;
  }

  updateStats();
}

async function markNotifSent(id) {
  try {
    await fetch(`${getBaseUrl()}/local-agent/mark-notification-sent`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ notification_id: id }),
    });
  } catch (_) {}
}

async function markNotifFailed(id, error) {
  try {
    await fetch(`${getBaseUrl()}/local-agent/mark-notification-failed`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ notification_id: id, error_message: error }),
    });
  } catch (_) {}
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/* ══════════════════════════════════════════════════════════
   WHATSAPP UI
══════════════════════════════════════════════════════════ */

function updateWaUI(status) {
  state.waStatus = status;

  const indicator = ui.waIndicator();
  const statusText = ui.waStatusText();
  const btnConn = ui.btnWaConnect();
  const btnDisc = ui.btnWaDisconn();
  const qrContainer = ui.waQrContainer();

  const labels = {
    disconnected: 'Desconectado',
    connecting: 'Conectando...',
    qr_ready: 'Aguardando QR Code',
    connected: 'Conectado',
    reconnecting: 'Reconectando...',
  };

  const cls = {
    disconnected: 'ws-disconnected',
    connecting: 'ws-connecting',
    qr_ready: 'ws-connecting',
    connected: 'ws-connected',
    reconnecting: 'ws-connecting',
  };

  statusText.textContent = labels[status] || status;
  statusText.className = 'wa-status-val ' + (cls[status] || '');

  indicator.textContent = 'WhatsApp: ' + (labels[status] || status);
  indicator.className = 'wa-indicator ' + (status === 'connected' ? 'wa-on' : 'wa-off');

  if (status === 'connected') {
    btnConn.style.display = 'none';
    btnDisc.style.display = '';
    qrContainer.style.display = 'none';
  } else if (status === 'qr_ready') {
    btnConn.style.display = 'none';
    btnDisc.style.display = '';
    qrContainer.style.display = '';
  } else {
    btnConn.style.display = '';
    btnDisc.style.display = 'none';
    if (status !== 'connecting' && status !== 'reconnecting') {
      qrContainer.style.display = 'none';
    }
  }
}

async function connectWhatsApp() {
  const btn = ui.btnWaConnect();
  btn.disabled = true;
  btn.textContent = 'Conectando...';
  log('Conectando WhatsApp...', 'info');

  const result = await window.api.whatsappConnect();

  if (!result.success) {
    log(`Erro ao conectar WhatsApp: ${result.error}`, 'error');
  }

  btn.disabled = false;
  btn.textContent = 'Conectar WhatsApp';
}

async function disconnectWhatsApp() {
  const btn = ui.btnWaDisconn();
  btn.disabled = true;
  log('Desconectando WhatsApp...', 'info');

  await window.api.whatsappDisconnect();
  log('WhatsApp desconectado.', 'warn');

  btn.disabled = false;
}

async function testWhatsApp() {
  const phone = ui.waTestPhone().value.trim();
  if (!phone) { log('Informe o telefone de teste.', 'warn'); return; }

  const btn = ui.btnWaTest();
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const message = 'Teste de notificacao automatica Day Lanches.\n\nSe voce recebeu esta mensagem, o WhatsApp automatico esta conectado corretamente.';
    const result = await window.api.whatsappSend({ phone, message });

    if (result.success) {
      log('Mensagem de teste enviada.', 'success');
    } else {
      log(`Falha no teste: ${result.error}`, 'error');
    }
  } catch (err) {
    log(`Erro no teste: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enviar mensagem de teste';
  }
}

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  initTabs();
  await loadConfig();

  /* Buttons */
  ui.btnSave().addEventListener('click', saveConfig);
  ui.btnTestConn().addEventListener('click', testConnection);
  ui.btnTestPrint().addEventListener('click', testPrint);
  ui.btnStart().addEventListener('click', startMonitoring);
  ui.btnStop().addEventListener('click', stopMonitoring);

  /* Toggle changes */
  ui.autoLaunch().addEventListener('change', async () => {
    await window.api.setAutoLaunch(ui.autoLaunch().checked);
  });
  ui.autoMonitor().addEventListener('change', async () => {
    await window.api.setAutoMonitor(ui.autoMonitor().checked);
  });

  /* WhatsApp buttons */
  ui.btnWaConnect().addEventListener('click', connectWhatsApp);
  ui.btnWaDisconn().addEventListener('click', disconnectWhatsApp);
  ui.btnWaTest().addEventListener('click', testWhatsApp);

  /* WhatsApp events from main process */
  window.api.onWhatsAppStatus((status) => {
    updateWaUI(status);
    if (status === 'connected') log('WhatsApp conectado.', 'success');
    if (status === 'reconnecting') log('WhatsApp reconectando...', 'warn');
  });

  window.api.onWhatsAppQR((dataUrl) => {
    ui.waQrImg().src = dataUrl;
    ui.waQrContainer().style.display = '';
    log('QR Code gerado. Escaneie com o WhatsApp da loja.', 'info');
  });

  window.api.onWhatsAppError((msg) => {
    log(`WhatsApp erro: ${msg}`, 'error');
  });

  /* Tray events */
  window.api.onAutoStartMonitoring(() => {
    log('Monitoramento automatico iniciado.', 'info');
    startMonitoring();
  });

  window.api.onTrayStartMonitoring(() => startMonitoring());
  window.api.onTrayStopMonitoring(() => stopMonitoring());

  /* Check initial WA status */
  const waStatus = await window.api.whatsappGetStatus();
  updateWaUI(waStatus);

  const qr = await window.api.whatsappGetQR();
  if (qr) {
    ui.waQrImg().src = qr;
    ui.waQrContainer().style.display = '';
  }

  log('Day Lanches Agent pronto.', 'info');
});
