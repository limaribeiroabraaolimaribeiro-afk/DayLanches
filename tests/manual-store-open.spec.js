// @ts-check
/* Testes do fluxo "Abrir loja hoje" no Gestão (gestao.js/gestao.html):
   modal, validação, gravação em store_settings, cancelamento, prioridade do
   fechamento manual e atualização imediata da UI. Reaproveita o mesmo
   harness de tests/helpers.js e tests/fake-supabase.js usado por
   admin-lock.spec.js — a única adição é um mock stateful de store_settings
   (setTableResponse), que faz .update()/.upsert() realmente mudarem o que
   um .select() seguinte devolve, pra loadConfig()/showSection('config')
   refletirem o estado gravado como o Supabase de verdade faria. */
const { test, expect } = require('@playwright/test');
const { setupMockedPage, adminUser, loginAs, setPinState } = require('./helpers');

/* Registra um mock stateful de store_settings: update/upsert gravam no
   "banco" em memória, select devolve o estado atual dele — assim
   loadConfig()/pdvSyncCloseStoreState() enxergam exatamente o que as
   funções de abrir/fechar loja gravaram, igual ao Supabase real faria. */
async function mockStoreSettings(page, initialRow = {}) {
  await page.evaluate((row) => {
    window.__mockStoreRow = { id: 'store', ...row };
    window.__testAuth.setTableResponse('store_settings', (call) => {
      if (call.method === 'update' || call.method === 'upsert') {
        Object.assign(window.__mockStoreRow, call.payload);
        return { data: [window.__mockStoreRow], error: null };
      }
      return { data: window.__mockStoreRow, error: null };
    });
  }, initialRow);
}

async function todayISO(page) {
  return page.evaluate(() => getSaoPauloDateISO());
}

async function openModal(page) {
  await page.locator('.js-open-store-btn').first().click();
  await page.waitForFunction(() => document.getElementById('gestao-modal-overlay')?.style.display === 'flex');
}

test.describe('Gestão — "Abrir loja hoje" (abertura manual excepcional)', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockedPage(page);
    await loginAs(page, adminUser());
    await setPinState(page);
    await mockStoreSettings(page);
  });

  test('estado inicial: botão mostra "Abrir loja hoje" e não há indicação de abertura excepcional', async ({ page }) => {
    const btn = page.locator('.js-open-store-btn').first();
    await expect(btn).toContainText('Abrir loja hoje');
    expect(await page.evaluate(() => isStoreManuallyOpenToday())).toBe(false);
  });

  test('abre o modal "Abrir loja hoje" com os campos de horário e mensagem', async ({ page }) => {
    await openModal(page);
    await expect(page.locator('#gestao-modal-title')).toHaveText('Abrir loja hoje');
    await expect(page.locator('#open-store-from')).toHaveCount(1);
    await expect(page.locator('#open-store-to')).toHaveCount(1);
    await expect(page.locator('#open-store-note')).toHaveCount(1);
    await expect(page.locator('#gestao-modal-btn-confirm')).toHaveText('Abrir loja hoje');
    await expect(page.locator('#gestao-modal-btn-cancel')).toHaveText('Cancelar');
  });

  test('confirmar com horários válidos grava manual_open_* de hoje, mostra toast e atualiza o botão na hora', async ({ page }) => {
    const iso = await todayISO(page);
    await openModal(page);
    await page.fill('#open-store-from', '17:30');
    await page.fill('#open-store-to', '23:00');
    await page.fill('#open-store-note', 'Hoje estaremos atendendo normalmente.');
    await page.click('#gestao-modal-btn-confirm');

    await expect(page.locator('#g-toast')).toHaveText('Loja configurada para abrir hoje das 17:30 às 23:00.');
    await expect(page.locator('#g-toast')).toHaveClass(/toast-success/);

    // gs.storeConfig atualizado sem precisar de F5 (item 16 do pedido)
    const cfg = await page.evaluate(() => gs.storeConfig);
    expect(cfg.manual_open_date).toBe(iso);
    expect(cfg.manual_open_from).toBe('17:30');
    expect(cfg.manual_open_to).toBe('23:00');
    expect(cfg.manual_open_message).toBe('Hoje estaremos atendendo normalmente.');

    // botão vira "Cancelar abertura de hoje" imediatamente
    await expect(page.locator('.js-open-store-btn').first()).toContainText('Cancelar abertura de hoje');
    expect(await page.evaluate(() => isStoreManuallyOpenToday())).toBe(true);

    // payload realmente enviado ao Supabase tem exatamente os campos esperados
    const calls = await page.evaluate(() => window.__testAuth.getFromCalls().filter(c => c.table === 'store_settings' && c.method === 'update'));
    const last = calls[calls.length - 1];
    expect(last.payload.manual_open_date).toBe(iso);
    expect(last.payload.manual_open_from).toBe('17:30');
    expect(last.payload.manual_open_to).toBe('23:00');
    expect(last.payload.manual_open_message).toBe('Hoje estaremos atendendo normalmente.');
    expect(last.payload.manual_open_at).toBeTruthy();
  });

  test('mensagem opcional vazia grava manual_open_message = null (não string vazia)', async ({ page }) => {
    await openModal(page);
    await page.fill('#open-store-from', '17:30');
    await page.fill('#open-store-to', '23:00');
    await page.click('#gestao-modal-btn-confirm');
    const cfg = await page.evaluate(() => gs.storeConfig);
    expect(cfg.manual_open_message).toBeNull();
  });

  test('validação: sem horário de abertura não grava nada e mostra erro', async ({ page }) => {
    await openModal(page);
    await page.fill('#open-store-to', '23:00');
    await page.click('#gestao-modal-btn-confirm');

    await expect(page.locator('#g-toast')).toHaveText('Informe o horário de abertura.');
    await expect(page.locator('#g-toast')).toHaveClass(/toast-error/);
    expect(await page.evaluate(() => isStoreManuallyOpenToday())).toBe(false);
    const calls = await page.evaluate(() => window.__testAuth.getFromCalls().filter(c => c.table === 'store_settings' && c.method === 'update'));
    expect(calls.length).toBe(0);
  });

  test('validação: sem horário de fechamento não grava nada e mostra erro', async ({ page }) => {
    await openModal(page);
    await page.fill('#open-store-from', '17:30');
    await page.click('#gestao-modal-btn-confirm');
    await expect(page.locator('#g-toast')).toHaveText('Informe o horário de fechamento.');
    expect(await page.evaluate(() => isStoreManuallyOpenToday())).toBe(false);
  });

  test('validação: horário de fechamento igual ou anterior ao de abertura é rejeitado', async ({ page }) => {
    await openModal(page);
    await page.fill('#open-store-from', '23:00');
    await page.fill('#open-store-to', '17:30');
    await page.click('#gestao-modal-btn-confirm');
    await expect(page.locator('#g-toast')).toHaveText('O horário de fechamento deve ser depois do horário de abertura.');
    expect(await page.evaluate(() => isStoreManuallyOpenToday())).toBe(false);
  });

  test('cancelar a abertura excepcional limpa os 5 campos e volta o botão ao estado normal', async ({ page }) => {
    const iso = await todayISO(page);
    await mockStoreSettings(page, {
      manual_open_date: iso, manual_open_from: '17:30:00', manual_open_to: '23:00:00', manual_open_message: 'oi',
    });
    await page.evaluate((iso) => {
      gs.storeConfig = { ...(gs.storeConfig || {}), manual_open_date: iso, manual_open_from: '17:30:00', manual_open_to: '23:00:00', manual_open_message: 'oi' };
      pdvRenderCloseStoreButtons();
    }, iso);
    await expect(page.locator('.js-open-store-btn').first()).toContainText('Cancelar abertura de hoje');

    await page.locator('.js-open-store-btn').first().click();
    await page.waitForFunction(() => document.getElementById('gestao-modal-overlay')?.style.display === 'flex');
    await expect(page.locator('#gestao-modal-title')).toHaveText('Cancelar abertura de hoje');
    await page.click('#gestao-modal-btn-confirm');

    await expect(page.locator('#g-toast')).toHaveText('Abertura excepcional de hoje cancelada.');
    const cfg = await page.evaluate(() => gs.storeConfig);
    expect(cfg.manual_open_date).toBeNull();
    expect(cfg.manual_open_from).toBeNull();
    expect(cfg.manual_open_to).toBeNull();
    expect(cfg.manual_open_message).toBeNull();
    await expect(page.locator('.js-open-store-btn').first()).toContainText('Abrir loja hoje');
    expect(await page.evaluate(() => isStoreManuallyOpenToday())).toBe(false);
  });

  test('prioridade do fechamento: "Fechar loja hoje" com uma abertura excepcional já ativa limpa a abertura também', async ({ page }) => {
    const iso = await todayISO(page);
    await mockStoreSettings(page, {
      manual_open_date: iso, manual_open_from: '17:30:00', manual_open_to: '23:00:00',
    });
    await page.evaluate((iso) => {
      gs.storeConfig = { ...(gs.storeConfig || {}), manual_open_date: iso, manual_open_from: '17:30:00', manual_open_to: '23:00:00' };
      pdvRenderCloseStoreButtons();
    }, iso);

    await page.locator('.js-close-store-btn').first().click();
    await page.waitForFunction(() => document.getElementById('gestao-modal-overlay')?.style.display === 'flex');
    await page.click('#gestao-modal-btn-confirm'); // "Fechar loja hoje", nota opcional em branco

    await expect(page.locator('#g-toast')).toHaveText('Loja fechada manualmente para hoje.');
    const cfg = await page.evaluate(() => gs.storeConfig);
    expect(cfg.manual_closed_date).toBe(iso);
    expect(cfg.manual_open_date).toBeNull();
    expect(cfg.manual_open_from).toBeNull();
    expect(cfg.manual_open_to).toBeNull();

    // o payload enviado ao Supabase também limpou a abertura na mesma chamada
    const calls = await page.evaluate(() => window.__testAuth.getFromCalls().filter(c => c.table === 'store_settings' && c.method === 'update'));
    const last = calls[calls.length - 1];
    expect(last.payload.manual_closed_date).toBe(iso);
    expect(last.payload.manual_open_date).toBeNull();

    await expect(page.locator('.js-open-store-btn').first()).toContainText('Abrir loja hoje');
  });

  test('bloqueio: tentar "Abrir loja hoje" com a loja já fechada manualmente hoje não abre o modal', async ({ page }) => {
    const iso = await todayISO(page);
    await page.evaluate((iso) => {
      gs.storeConfig = { ...(gs.storeConfig || {}), manual_closed_date: iso, manual_closed_message: null };
      pdvRenderCloseStoreButtons();
    }, iso);

    await page.locator('.js-open-store-btn').first().click();
    await expect(page.locator('#g-toast')).toContainText('fechada manualmente hoje');
    expect(await page.evaluate(() => document.getElementById('gestao-modal-overlay')?.style.display)).not.toBe('flex');
    expect(await page.evaluate(() => isStoreManuallyOpenToday())).toBe(false);
  });

  test('erro do Supabase ao abrir: mostra erro e mantém o estado anterior (não finge que salvou)', async ({ page }) => {
    await page.evaluate(() => {
      window.__testAuth.setTableResponse('store_settings', (call) => {
        if (call.method === 'update') return { data: null, error: { message: 'falha de rede' } };
        return { data: window.__mockStoreRow || { id: 'store' }, error: null };
      });
    });

    await openModal(page);
    await page.fill('#open-store-from', '17:30');
    await page.fill('#open-store-to', '23:00');
    await page.click('#gestao-modal-btn-confirm');

    await expect(page.locator('#g-toast')).toContainText('Erro ao configurar abertura excepcional');
    await expect(page.locator('#g-toast')).toHaveClass(/toast-error/);
    expect(await page.evaluate(() => isStoreManuallyOpenToday())).toBe(false);
    await expect(page.locator('.js-open-store-btn').first()).toContainText('Abrir loja hoje');
  });

  test('card de status em Configurações mostra "Aberta excepcionalmente hoje" com o horário e a mensagem', async ({ page }) => {
    const iso = await todayISO(page);
    await mockStoreSettings(page, {
      manual_open_date: iso, manual_open_from: '17:30:00', manual_open_to: '23:00:00', manual_open_message: 'Atendimento normal hoje.',
    });
    await page.evaluate(() => { gs.adminSectionsUnlocked = true; gs.adminUnlockExpiresAt = Date.now() + 999999; showSection('config'); });
    await page.waitForFunction(() => document.getElementById('section-config')?.classList.contains('active'));
    await page.waitForFunction(() => document.getElementById('store-today-status')?.textContent?.includes('Aberta excepcionalmente hoje'));

    const text = await page.locator('#store-today-status').innerText();
    expect(text).toContain('Aberta excepcionalmente hoje');
    expect(text).toContain('17:30');
    expect(text).toContain('23:00');
    expect(text).toContain('Atendimento normal hoje.');
  });

  test('card de status mostra "Fechada manualmente hoje" quando fechada manualmente', async ({ page }) => {
    const iso = await todayISO(page);
    await mockStoreSettings(page, { manual_closed_date: iso, manual_closed_message: 'Sem atendimento hoje.' });
    await page.evaluate(() => { gs.adminSectionsUnlocked = true; gs.adminUnlockExpiresAt = Date.now() + 999999; showSection('config'); });
    await page.waitForFunction(() => document.getElementById('store-today-status')?.textContent?.includes('Fechada manualmente hoje'));
    const text = await page.locator('#store-today-status').innerText();
    expect(text).toContain('Sem atendimento hoje.');
  });
});
