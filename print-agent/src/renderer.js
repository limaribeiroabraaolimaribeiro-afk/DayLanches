'use strict';

const PRINT_POLL_MS = 5000;
const FAILURES_BEFORE_RECONNECTING = 2; /* evita "piscar" status por uma falha isolada */

const state = {
  printTimer: null,
  printedCache: new Set(),
  firstPrintRun: true,
  consecutiveFailures: 0,
  configured: false,
  paperType: '80mm',
};

/* ── DOM helpers ── */
const $ = (id) => document.getElementById(id);

const ui = {
  viewMain:      () => $('view-main'),
  viewSettings:  () => $('view-settings'),
  btnOpenSet:    () => $('btn-open-settings'),
  btnCloseSet:   () => $('btn-close-settings'),

  statusDot:     () => $('status-dot'),
  statusText:    () => $('status-text'),
  printer:       () => $('cfg-printer'),
  autoPrint:     () => $('cfg-auto-print'),
  autoLaunch:    () => $('cfg-auto-launch'),
  btnTestPrint:  () => $('btn-test-print'),
  lastCheck:     () => $('last-check'),

  workerUrl:     () => $('cfg-worker-url'),
  token:         () => $('cfg-token'),
  btnTestConn:   () => $('btn-test-conn'),
  btnSaveSet:    () => $('btn-save-settings'),
  logsArea:      () => $('logs-area'),
};

/* ── Registro tecnico (nunca exibido para a Dayane — so dentro de "Configuração avançada") ── */
function log(message, level = 'info') {
  const area = ui.logsArea();
  if (!area) return;
  const time = new Date().toLocaleTimeString('pt-BR');
  const line = document.createElement('div');
  line.className = 'log-line';
  line.innerHTML = `<span class="log-time">[${time}]</span> <span class="log-${level}">${escHtml(message)}</span>`;
  area.prepend(line);
  while (area.children.length > 200) area.removeChild(area.lastChild);
}

function escHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ── Status amigável (nada tecnico aparece aqui) ── */
function setStatus(text, kind) {
  ui.statusDot().className = 'status-dot ' + (kind || '');
  ui.statusText().textContent = text;
}

/* ── Navegação entre as duas vistas (mesma janela) ── */
function openSettings() {
  ui.viewMain().style.display = 'none';
  ui.viewSettings().style.display = 'block';
}
function closeSettings() {
  ui.viewSettings().style.display = 'none';
  ui.viewMain().style.display = 'block';
}

/* ── Config ── */
async function loadConfig() {
  const config = await window.api.getConfig();

  ui.workerUrl().value = config.workerUrl || '';
  ui.token().value = config.printAgentToken || '';
  ui.autoPrint().checked = config.autoPrintEnabled !== false;

  const isAutoLaunch = await window.api.getAutoLaunch();
  ui.autoLaunch().checked = isAutoLaunch;

  await loadPrinters(config.printerName);

  state.paperType = config.paperType || '80mm';
  state.configured = !!(config.workerUrl && config.printAgentToken);
}

/* Deteccao de impressora: usa a salva se ela ainda existir; senao cai para a
   padrao do Windows; se nao houver nenhuma impressora, nao trava — so avisa. */
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

  const savedStillExists = selectedName && printers.some(p => p.name === selectedName);

  if (savedStillExists) {
    select.value = selectedName;
    return;
  }

  const windowsDefault = printers.find(p => p.isDefault);
  select.value = windowsDefault ? windowsDefault.name : '__default__';

  if (selectedName && !savedStillExists) {
    log(`Impressora salva ("${selectedName}") não encontrada. Usando a padrão do Windows.`, 'warn');
  }
  if (!printers.length) {
    log('Nenhuma impressora detectada pelo Windows.', 'warn');
  }

  /* Persiste a selecao automatica para nao perguntar de novo na proxima abertura */
  await window.api.saveConfig({ printerName: select.value });
}

/* ── Auto-save dos controles da vista principal (sem botao "Salvar") ── */
async function persistPrinterChoice() {
  await window.api.saveConfig({ printerName: ui.printer().value });
  log(`Impressora selecionada: ${ui.printer().value}`, 'info');
}
async function persistAutoPrint() {
  await window.api.saveConfig({ autoPrintEnabled: ui.autoPrint().checked });
  log(`Impressão automática: ${ui.autoPrint().checked ? 'ativada' : 'desativada'}.`, 'info');
}
async function persistAutoLaunch() {
  await window.api.setAutoLaunch(ui.autoLaunch().checked);
  log(`Iniciar com o Windows: ${ui.autoLaunch().checked ? 'ativado' : 'desativado'}.`, 'info');
}

/* ── Configuração avançada (URL + token) ── */
async function saveSettings() {
  const btn = ui.btnSaveSet();
  btn.disabled = true;
  try {
    await window.api.saveConfig({
      workerUrl: ui.workerUrl().value.trim().replace(/\/+$/, ''),
      printAgentToken: ui.token().value.trim(),
    });
    log('Configuração avançada salva.', 'success');
    state.configured = !!(ui.workerUrl().value.trim() && ui.token().value.trim());
    startPolling(); /* comeca a monitorar assim que ficar configurado, sem reiniciar o app */
  } finally {
    btn.disabled = false;
  }
}

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
    const res = await fetch(`${getBaseUrl()}/print-agent/health`, { headers: getHeaders() });
    if (res.status === 401) { log('Token inválido.', 'error'); return; }
    if (!res.ok) { log(`Erro de conexão: HTTP ${res.status}`, 'error'); return; }
    const data = await res.json();
    if (data.ok) log('Conexão com o servidor OK.', 'success');
  } catch (err) {
    log(`Erro ao conectar: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Testar conexão';
  }
}

/* ── Teste de impressão ── */
async function testPrint() {
  const btn = ui.btnTestPrint();
  btn.disabled = true;
  btn.textContent = 'Imprimindo...';
  try {
    const html = window.buildTestReceiptHtml(state.paperType);
    const printerName = ui.printer().value;
    const result = await window.api.printReceipt({ html, printerName, paperType: state.paperType });
    if (result.success) {
      log('Teste de impressão OK.', 'success');
    } else {
      log(`Erro no teste de impressão: ${result.error}`, 'error');
    }
  } catch (err) {
    log(`Erro ao testar impressão: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Testar impressão';
  }
}

/* ══════════════════════════════════════════════════════════
   MONITORAMENTO — sempre ativo em segundo plano assim que
   houver URL + token configurados. Sem botao manual de start/stop.
══════════════════════════════════════════════════════════ */

function startPolling() {
  if (state.printTimer) return; /* ja esta rodando */
  if (!state.configured) {
    setStatus('Configuração necessária', 'warn');
    return;
  }
  pollOrders();
  state.printTimer = setInterval(pollOrders, PRINT_POLL_MS);
}

/* ── Print polling ── */

async function pollOrders() {
  try {
    const url = `${getBaseUrl()}/print-agent/pending-orders`;
    const res = await fetch(url, { headers: getHeaders() });

    if (res.status === 401) {
      log('Token inválido. Verifique a configuração avançada.', 'error');
      setStatus('Configuração necessária', 'warn');
      return;
    }

    if (!res.ok) {
      handlePollFailure(`HTTP ${res.status}`);
      return;
    }

    const data = await res.json();
    const orders = data.orders || [];

    handlePollSuccess();

    if (!orders.length) {
      if (state.firstPrintRun) {
        log('Nenhum pedido pendente de impressão.', 'info');
        state.firstPrintRun = false;
      }
      return;
    }
    state.firstPrintRun = false;

    if (!ui.autoPrint().checked) {
      log(`${orders.length} pendente(s), impressão automática desativada.`, 'warn');
      return;
    }

    for (const order of orders) {
      if (state.printedCache.has(order.id)) continue;
      await printOrder(order);
    }
  } catch (err) {
    handlePollFailure(err.message);
  }
}

function handlePollSuccess() {
  state.consecutiveFailures = 0;
  setStatus('Sistema conectado', 'connected');
  ui.lastCheck().textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function handlePollFailure(reason) {
  state.consecutiveFailures++;
  log(`Erro ao verificar pedidos: ${reason}`, 'error');
  /* So muda o status visivel apos falhas seguidas — uma falha isolada nao assusta a Dayane */
  if (state.consecutiveFailures >= FAILURES_BEFORE_RECONNECTING) {
    setStatus('Tentando reconectar...', 'reconnecting');
  }
}

async function printOrder(order) {
  const num = order.order_number || order.id?.slice(0, 8) || '?';

  try {
    const html = window.buildReceiptHtml(order, state.paperType);
    const printerName = ui.printer().value;

    log(`Imprimindo #${num}...`, 'info');
    const result = await window.api.printReceipt({ html, printerName, paperType: state.paperType });

    if (!result.success) {
      log(`Erro ao imprimir #${num}: ${result.error}`, 'error');
      return;
    }

    log(`Comanda #${num} impressa.`, 'success');
    state.printedCache.add(order.id);
    await markPrinted(order.id, num);
  } catch (err) {
    log(`Erro ao imprimir #${num}: ${err.message}`, 'error');
  }
}

async function markPrinted(orderId, orderNum) {
  try {
    const res = await fetch(`${getBaseUrl()}/print-agent/mark-printed`, {
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
  setStatus('Verificando...', '');
  await loadConfig();

  /* Navegação */
  ui.btnOpenSet().addEventListener('click', openSettings);
  ui.btnCloseSet().addEventListener('click', closeSettings);

  /* Vista principal — cada controle salva sozinho, sem botao "Salvar" */
  ui.btnTestPrint().addEventListener('click', testPrint);
  ui.printer().addEventListener('change', persistPrinterChoice);
  ui.autoPrint().addEventListener('change', persistAutoPrint);
  ui.autoLaunch().addEventListener('change', persistAutoLaunch);

  /* Configuração avançada */
  ui.btnTestConn().addEventListener('click', testConnection);
  ui.btnSaveSet().addEventListener('click', saveSettings);

  log('Day Lanches Impressão pronto.', 'info');
  startPolling();
});
