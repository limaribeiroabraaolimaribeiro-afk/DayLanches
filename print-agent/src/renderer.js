'use strict';

const PRINT_POLL_MS = 5000;

const state = {
  monitoring: false,
  printTimer: null,
  printedCache: new Set(),
  printedCount: 0,
  printErrors: 0,
  firstPrintRun: true,
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
  statLastChk:  () => $('stat-last-check'),
  logsArea:     () => $('logs-area'),
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
   MONITORAMENTO (impressao)
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
}

function stopMonitoring() {
  state.monitoring = false;
  if (state.printTimer) { clearInterval(state.printTimer); state.printTimer = null; }
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

  /* Tray events */
  window.api.onAutoStartMonitoring(() => {
    log('Monitoramento automatico iniciado.', 'info');
    startMonitoring();
  });

  window.api.onTrayStartMonitoring(() => startMonitoring());
  window.api.onTrayStopMonitoring(() => stopMonitoring());

  log('Day Lanches Agent pronto.', 'info');
});
