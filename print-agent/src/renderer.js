'use strict';

const POLL_INTERVAL_MS = 5000;

const state = {
  monitoring: false,
  pollTimer: null,
  printedCache: new Set(),
  printedCount: 0,
  errorCount: 0,
  firstRun: true,
};

/* ── DOM refs ── */
const $ = (id) => document.getElementById(id);

const ui = {
  workerUrl:   () => $('cfg-worker-url'),
  token:       () => $('cfg-token'),
  printer:     () => $('cfg-printer'),
  paper:       () => $('cfg-paper'),
  autoPrint:   () => $('cfg-auto-print'),
  autoLaunch:  () => $('cfg-auto-launch'),
  btnSave:     () => $('btn-save'),
  btnTestConn: () => $('btn-test-conn'),
  btnTestPrint:() => $('btn-test-print'),
  btnStart:    () => $('btn-start'),
  btnStop:     () => $('btn-stop'),
  statusDot:   () => $('status-dot'),
  statusText:  () => $('status-text'),
  statPrinted: () => $('stat-printed'),
  statErrors:  () => $('stat-errors'),
  statLastChk: () => $('stat-last-check'),
  logsArea:    () => $('logs-area'),
};

/* ── Logging ── */
function log(message, level = 'info') {
  const area = ui.logsArea();
  const time = new Date().toLocaleTimeString('pt-BR');
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-${level}">${escHtml(message)}</span>`;
  area.prepend(line);

  while (area.children.length > 200) {
    area.removeChild(area.lastChild);
  }
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
  ui.statErrors().textContent = state.errorCount;
  ui.statLastChk().textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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

  await loadPrinters(config.printerName);
}

async function loadPrinters(selectedName) {
  const printers = await window.api.getPrinters();
  const select = ui.printer();

  select.innerHTML = '<option value="__default__">Impressora padrão do Windows</option>';

  printers.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.name;
    opt.textContent = p.displayName + (p.isDefault ? ' (padrão)' : '');
    select.appendChild(opt);
  });

  if (selectedName) {
    select.value = selectedName;
  }
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

  const autoLaunch = ui.autoLaunch().checked;
  await window.api.setAutoLaunch(autoLaunch);

  log('Configurações salvas com sucesso.', 'success');
}

/* ── API calls ── */
function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${ui.token().value.trim()}`,
  };
}

function getBaseUrl() {
  return ui.workerUrl().value.trim().replace(/\/+$/, '');
}

async function testConnection() {
  const btn = ui.btnTestConn();
  btn.disabled = true;
  btn.textContent = 'Testando...';

  try {
    const url = `${getBaseUrl()}/print-agent/health`;
    const res = await fetch(url, { headers: getHeaders() });

    if (res.status === 401) {
      log('Token inválido. Verifique o token de impressão.', 'error');
      setStatus('Token inválido', 'error');
      return;
    }

    if (!res.ok) {
      log(`Erro de conexão: HTTP ${res.status}`, 'error');
      setStatus('Erro de conexão', 'error');
      return;
    }

    const data = await res.json();
    if (data.ok) {
      log('Conexão com o Worker estabelecida com sucesso.', 'success');
      setStatus('Conectado', 'connected');
    } else {
      log('Resposta inesperada do Worker.', 'warn');
    }
  } catch (err) {
    log(`Não foi possível conectar ao Worker: ${err.message}`, 'error');
    setStatus('Desconectado', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>🔌</span> Testar conexão';
  }
}

async function testPrint() {
  const btn = ui.btnTestPrint();
  btn.disabled = true;
  btn.textContent = 'Imprimindo...';

  try {
    const paperType = ui.paper().value;
    const html = window.buildTestReceiptHtml(paperType);
    const printerName = ui.printer().value;

    const result = await window.api.printReceipt({ html, printerName, paperType });

    if (result.success) {
      log('Teste de impressão enviado com sucesso.', 'success');
    } else {
      log(`Erro no teste de impressão: ${result.error}`, 'error');
    }
  } catch (err) {
    log(`Erro ao testar impressão: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>🖨️</span> Testar impressão';
  }
}

/* ── Monitoring ── */
function startMonitoring() {
  if (state.monitoring) return;

  const token = ui.token().value.trim();
  const workerUrl = ui.workerUrl().value.trim();

  if (!token) {
    log('Configure o token de impressão antes de iniciar.', 'warn');
    return;
  }
  if (!workerUrl) {
    log('Configure a URL do Worker antes de iniciar.', 'warn');
    return;
  }

  state.monitoring = true;
  state.firstRun = true;
  ui.btnStart().style.display = 'none';
  ui.btnStop().style.display = '';
  setStatus('Aguardando pedidos...', 'monitoring');
  log('Monitoramento iniciado. Verificando pedidos a cada 5 segundos.', 'info');

  pollOrders();
  state.pollTimer = setInterval(pollOrders, POLL_INTERVAL_MS);
}

function stopMonitoring() {
  state.monitoring = false;
  if (state.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
  ui.btnStart().style.display = '';
  ui.btnStop().style.display = 'none';
  setStatus('Monitoramento parado', '');
  log('Monitoramento parado.', 'warn');
}

async function pollOrders() {
  if (!state.monitoring) return;

  try {
    const url = `${getBaseUrl()}/print-agent/pending-orders`;
    const res = await fetch(url, { headers: getHeaders() });

    if (res.status === 401) {
      log('Token inválido. Parando monitoramento.', 'error');
      setStatus('Token inválido', 'error');
      stopMonitoring();
      return;
    }

    if (!res.ok) {
      log(`Erro ao buscar pedidos: HTTP ${res.status}`, 'error');
      state.errorCount++;
      updateStats();
      return;
    }

    const data = await res.json();
    const orders = data.orders || [];

    updateStats();

    if (!orders.length) {
      if (state.firstRun) {
        log('Nenhum pedido pendente de impressão.', 'info');
        state.firstRun = false;
      }
      return;
    }

    if (state.firstRun && orders.length > 5) {
      log(`Existem ${orders.length} pedidos sem comanda impressa. Imprimindo automaticamente...`, 'warn');
    }

    state.firstRun = false;

    if (!ui.autoPrint().checked) {
      log(`${orders.length} pedido(s) pendente(s), mas impressão automática está desativada.`, 'warn');
      return;
    }

    for (const order of orders) {
      if (state.printedCache.has(order.id)) continue;
      await printOrder(order);
    }
  } catch (err) {
    log(`Erro na verificação: ${err.message}`, 'error');
    state.errorCount++;
    updateStats();
  }
}

async function printOrder(order) {
  const num = order.order_number || order.id?.slice(0, 8) || '?';

  try {
    const paperType = ui.paper().value;
    const html = window.buildReceiptHtml(order, paperType);
    const printerName = ui.printer().value;

    log(`Imprimindo comanda #${num}...`, 'info');

    const result = await window.api.printReceipt({ html, printerName, paperType });

    if (!result.success) {
      log(`Erro ao imprimir #${num}: ${result.error}`, 'error');
      state.errorCount++;
      updateStats();
      return;
    }

    log(`Comanda #${num} impressa com sucesso.`, 'success');
    state.printedCache.add(order.id);

    await markPrinted(order.id, num);

    state.printedCount++;
    updateStats();
  } catch (err) {
    log(`Erro ao imprimir #${num}: ${err.message}`, 'error');
    state.errorCount++;
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

    if (!res.ok) {
      log(`Erro ao marcar #${orderNum} como impresso: HTTP ${res.status}`, 'error');
      return;
    }

    const data = await res.json();
    if (data.success) {
      log(`Pedido #${orderNum} marcado como impresso no sistema.`, 'success');
    }
  } catch (err) {
    log(`Erro ao marcar #${orderNum}: ${err.message}`, 'error');
  }
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', async () => {
  await loadConfig();

  ui.btnSave().addEventListener('click', saveConfig);
  ui.btnTestConn().addEventListener('click', testConnection);
  ui.btnTestPrint().addEventListener('click', testPrint);
  ui.btnStart().addEventListener('click', startMonitoring);
  ui.btnStop().addEventListener('click', stopMonitoring);

  ui.autoLaunch().addEventListener('change', async () => {
    await window.api.setAutoLaunch(ui.autoLaunch().checked);
  });

  log('Day Lanches Print Agent pronto.', 'info');
});
