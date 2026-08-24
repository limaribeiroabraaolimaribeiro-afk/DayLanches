'use strict';

const PRINT_POLL_MS = 5000;
const FAILURES_BEFORE_RECONNECTING = 2; /* evita "piscar" status por uma falha isolada */

const state = {
  printTimer: null,
  printedCache: new Set(),
  firstPrintRun: true,
  consecutiveFailures: 0,
  paperType: '80mm',
  deviceToken: null,
  workerUrl: null,
};

/* ── DOM helpers ── */
const $ = (id) => document.getElementById(id);

const ui = {
  viewActivation: () => $('view-activation'),
  viewMain:       () => $('view-main'),
  activationCode: () => $('activation-code'),
  btnActivate:    () => $('btn-activate'),
  activationErr:  () => $('activation-error'),
  activationBlk:  () => $('activation-blocked'),

  statusDot:     () => $('status-dot'),
  statusText:    () => $('status-text'),
  printer:       () => $('cfg-printer'),
  autoPrint:     () => $('cfg-auto-print'),
  autoLaunch:    () => $('cfg-auto-launch'),
  btnTestPrint:  () => $('btn-test-print'),
  lastCheck:     () => $('last-check'),
  btnDeactivate: () => $('btn-deactivate'),
  logsArea:      () => $('logs-area'),
};

/* ── Registro tecnico (recolhido por padrao — nunca aparece sozinho pra Dayane) ── */
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

function setStatus(text, kind) {
  ui.statusDot().className = 'status-dot ' + (kind || '');
  ui.statusText().textContent = text;
}

/* ══════════════════════════════════════════════════════════
   ATIVAÇÃO
══════════════════════════════════════════════════════════ */

function showActivationView() {
  ui.viewMain().style.display = 'none';
  ui.viewActivation().style.display = 'block';
}

function showMainView() {
  ui.viewActivation().style.display = 'none';
  ui.viewMain().style.display = 'block';
}

async function checkActivation() {
  const status = await window.api.getActivationStatus();

  if (!status.safeStorageAvailable) {
    showActivationView();
    ui.activationCode().style.display = 'none';
    ui.btnActivate().style.display = 'none';
    ui.activationBlk().style.display = 'block';
    ui.activationBlk().textContent =
      'Este computador não tem suporte a armazenamento seguro de credenciais do Windows. ' +
      'Por segurança, não é possível ativar aqui. Fale com o suporte.';
    log('Ativação bloqueada: safeStorage indisponível neste Windows.', 'error');
    return false;
  }

  if (status.needsReactivation) {
    showActivationView();
    ui.activationErr().style.display = 'block';
    ui.activationErr().textContent = 'A credencial salva não pôde ser lida (Windows ou usuário mudou). Ative de novo.';
    log('Reativação necessária: credencial salva não pôde ser decifrada.', 'warn');
    return false;
  }

  if (!status.activated) {
    showActivationView();
    return false;
  }

  state.deviceToken = await window.api.getDeviceToken();
  state.workerUrl = await window.api.getWorkerUrl();
  showMainView();
  return true;
}

async function activate() {
  const codeInput = ui.activationCode();
  const btn = ui.btnActivate();
  const errEl = ui.activationErr();
  const code = codeInput.value.trim().toUpperCase();

  errEl.style.display = 'none';

  if (!code) {
    errEl.textContent = 'Digite o código de ativação.';
    errEl.style.display = 'block';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Ativando...';

  try {
    const result = await window.api.activateDevice(code);
    if (!result.success) {
      log(`Ativação falhou: ${result.error}`, 'error');
      errEl.textContent = result.error;
      errEl.style.display = 'block';
      return;
    }

    log('Dispositivo ativado com sucesso.', 'success');
    codeInput.value = '';
    const ok = await checkActivation();
    if (ok) {
      await loadConfig();
      startPolling();
    }
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ativar';
  }
}

async function deactivate() {
  if (!confirm('Isso desconecta este computador do sistema. Você vai precisar de um novo código para ativar de novo. Continuar?')) return;

  stopPolling();
  await window.api.deactivateDevice();
  state.deviceToken = null;
  log('Dispositivo desativado.', 'warn');
  showActivationView();
}

/* ══════════════════════════════════════════════════════════
   CONFIG / IMPRESSORA
══════════════════════════════════════════════════════════ */

async function loadConfig() {
  const config = await window.api.getConfig();

  ui.autoPrint().checked = config.autoPrintEnabled !== false;
  state.paperType = config.paperType || '80mm';

  const isAutoLaunch = await window.api.getAutoLaunch();
  ui.autoLaunch().checked = isAutoLaunch;

  await loadPrinters(config.printerName);
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

  await window.api.saveConfig({ printerName: select.value });
}

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
   MONITORAMENTO — sempre ativo em segundo plano assim que ativado.
   Sem botao manual de start/stop.
══════════════════════════════════════════════════════════ */

function getHeaders() {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${state.deviceToken}`,
  };
}
function getBaseUrl() {
  return state.workerUrl;
}

function startPolling() {
  if (state.printTimer) return;
  if (!state.deviceToken) {
    setStatus('Configuração necessária', 'warn');
    return;
  }
  pollOrders();
  state.printTimer = setInterval(pollOrders, PRINT_POLL_MS);
}

function stopPolling() {
  if (state.printTimer) { clearInterval(state.printTimer); state.printTimer = null; }
}

async function pollOrders() {
  try {
    const url = `${getBaseUrl()}/print-agent/pending-orders`;
    const res = await fetch(url, { headers: getHeaders() });

    if (res.status === 401) {
      log('Credencial inválida ou revogada. É necessário reativar.', 'error');
      stopPolling();
      state.deviceToken = null;
      await window.api.deactivateDevice();
      showActivationView();
      ui.activationErr().style.display = 'block';
      ui.activationErr().textContent = 'Este computador precisa ser ativado novamente.';
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
      /* Chave inclui o "antes" da contagem de itens impressos: um pedido já
         impresso uma vez pode legitimamente voltar a aparecer aqui com um
         delta novo (mais itens adicionados numa mesa) — nesse caso é um
         trabalho de impressão diferente e não deve ser pulado pelo cache. */
      const cacheKey = `${order.id}:${order.printed_items_count_before ?? (order.printed_items_count || 0)}`;
      if (state.printedCache.has(cacheKey)) continue;
      await printOrder(order, cacheKey);
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
  if (state.consecutiveFailures >= FAILURES_BEFORE_RECONNECTING) {
    setStatus('Tentando reconectar...', 'reconnecting');
  }
}

async function printOrder(order, cacheKey) {
  const num = order.order_number || order.id?.slice(0, 8) || '?';
  const isAddition = !!order.is_addition;

  try {
    const html = isAddition
      ? window.buildAdditionReceiptHtml(order, state.paperType)
      : window.buildReceiptHtml(order, state.paperType);
    const printerName = ui.printer().value;

    log(isAddition ? `Imprimindo itens adicionados — #${num}...` : `Imprimindo #${num}...`, 'info');
    const result = await window.api.printReceipt({ html, printerName, paperType: state.paperType });

    if (!result.success) {
      log(`Erro ao imprimir #${num}: ${result.error}`, 'error');
      return;
    }

    log(isAddition ? `Adicional #${num} impresso.` : `Comanda #${num} impressa.`, 'success');
    state.printedCache.add(cacheKey);
    const printedUpTo = isAddition
      ? (order.printed_items_count_before || 0) + order.items.length
      : order.items.length;
    await markPrinted(order.id, num, printedUpTo);
  } catch (err) {
    log(`Erro ao imprimir #${num}: ${err.message}`, 'error');
  }
}

async function markPrinted(orderId, orderNum, printedUpTo) {
  try {
    const res = await fetch(`${getBaseUrl()}/print-agent/mark-printed`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ order_id: orderId, printed_up_to: printedUpTo }),
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
  ui.btnActivate().addEventListener('click', activate);
  ui.activationCode().addEventListener('keydown', (e) => { if (e.key === 'Enter') activate(); });

  const activated = await checkActivation();

  if (activated) {
    setStatus('Verificando...', '');
    await loadConfig();

    ui.btnTestPrint().addEventListener('click', testPrint);
    ui.printer().addEventListener('change', persistPrinterChoice);
    ui.autoPrint().addEventListener('change', persistAutoPrint);
    ui.autoLaunch().addEventListener('change', persistAutoLaunch);
    ui.btnDeactivate().addEventListener('click', deactivate);

    log('Day Lanches Impressão pronto.', 'info');
    startPolling();
  }
});
