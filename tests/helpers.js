const path = require('path');

/* Bloqueia rede real (Supabase CDN, fontes, Worker) e injeta o stub de
   window.supabaseClient antes de navegar — ver tests/fake-supabase.js.
   clockTime, se passado, INSTALA o relógio falso do Playwright ANTES do
   goto — é obrigatório instalar antes da navegação pra ele interceptar o
   setInterval do watchdog de 30s que gestao.js registra assim que carrega
   (instalar depois da navegação deixa esse setInterval "real", rodando em
   tempo de parede de verdade, e os testes de timeout nunca fecham). */
async function setupMockedPage(page, { clockTime } = {}) {
  if (clockTime) await page.clock.install({ time: new Date(clockTime) });

  /* gestao.html registra gestao-sw.js (service worker) pra habilitar "Instalar
     app". A neutralização de verdade fica em fake-supabase.js (sobrescreve
     navigator.serviceWorker.register antes de qualquer script da página
     rodar) — um SW ativo assume controle da página e refaz fetch() de
     DENTRO do worker, um target que page.route() não intercepta, o que
     fazia nossos stubs de rede pararem de valer depois de um page.reload().
     Essa rota aqui é só defesa extra caso algo tente buscar o arquivo direto. */
  await page.route('**/gestao-sw.js*', (route) => route.abort());

  /* cache-control: no-store por precaução — sem isso o Chromium poderia
     servir uma 2ª requisição pro mesmo recurso direto do disk cache,
     sem passar pela interceptação de rede do Playwright. */
  const noStore = { 'cache-control': 'no-store' };
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* stubbed in tests */', headers: noStore }));
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '', headers: noStore }));
  await page.route('https://cdnjs.cloudflare.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '', headers: noStore }));
  await page.route('**/day-lanches-worker*/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ configured: false, state: 'closed' }), headers: noStore }));

  await page.addInitScript({ path: path.join(__dirname, 'fake-supabase.js') });
  await page.goto('/gestao.html');
}

function adminUser(overrides = {}) {
  return {
    id: 'uid-admin-1',
    email: 'dayane@daylanches.com.br',
    user_metadata: { name: 'Dayane', role: 'owner' },
    ...overrides,
  };
}

async function loginAs(page, user, event = 'SIGNED_IN') {
  await page.evaluate(({ u, event }) => window.__testAuth.fireAuthEvent(event, u), { u: user, event });
  await page.waitForSelector('#view-dashboard', { state: 'visible' });
}

async function setPinState(page, { isConfigured = true, canManage = true, autoLockMinutes = 30 } = {}) {
  await page.evaluate(({ isConfigured, canManage, autoLockMinutes }) => {
    window.__testAuth.setRpcResponse('get_management_pin_state', () => ({
      data: [{ is_configured: isConfigured, can_manage: canManage, auto_lock_minutes: autoLockMinutes }],
      error: null,
    }));
  }, { isConfigured, canManage, autoLockMinutes });
}

const PROTECTED = ['vendas', 'relatorios', 'config', 'despesas', 'estoque', 'acessos'];
const FREE = ['produtos', 'pedidos', 'balcao', 'caixa'];

async function isPinModalOpen(page) {
  return page.evaluate(() => document.getElementById('admin-pin-overlay')?.style.display === 'flex');
}

async function unlockViaPin(page, sectionName = 'vendas') {
  await page.evaluate((name) => showSection(name), sectionName);
  await page.waitForFunction(() => document.getElementById('admin-pin-overlay')?.style.display === 'flex');
  await page.fill('#admin-pin-input', 'senha-correta');
  await page.click('#admin-pin-submit-btn');
  await page.waitForFunction((name) => document.getElementById(`section-${name}`)?.classList.contains('active'), sectionName);
}

module.exports = { setupMockedPage, adminUser, loginAs, setPinState, isPinModalOpen, unlockViaPin, PROTECTED, FREE };
