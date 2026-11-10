// @ts-check
const { test, expect } = require('@playwright/test');
const { setupMockedPage, adminUser, ownerUser, loginAs, setPinState } = require('./helpers');

async function setCashState(page, { open = true, manager = false, owner = false } = {}) {
  await page.evaluate(({ open, manager, owner }) => {
    const cash = { id: 'a15f14ed-4ae6-4bad-85d1-c92c0a5cb198', opened_at: '2026-11-10T08:00:00.000Z', opened_by_email: 'operador@daylanches.com.br' };
    window.__testAuth.setRpcResponse('get_cash_register_state', () => ({
      data: [{ ...(open ? cash : { id: null, opened_at: null, opened_by_email: null }), can_view_financials: manager, bypass_pin: owner }],
      error: null,
    }));
    window.__testAuth.setRpcResponse('open_cash_register', () => ({ data: cash.id, error: null }));
    window.__testAuth.setRpcResponse('close_cash_register', () => ({ data: true, error: null }));
    window.__testAuth.setTableResponse('cash_closings', ({ filters }) => ({
      data: filters.id ? { ...cash, opening_amount: 50 } : [],
      error: null,
    }));
  }, { open, manager, owner });
}

test.describe('Caixa — segregação do financeiro', () => {
  test.beforeEach(async ({ page }) => { await setupMockedPage(page); });

  test('funcionária vê só campos de operação e não consulta cash_closings diretamente', async ({ page }) => {
    await loginAs(page, adminUser({ id: 'uid-func-1', email: 'funcionaria@daylanches.com.br' }));
    await setCashState(page, { open: true, manager: false });
    await page.evaluate(() => showSection('caixa'));
    await expect(page.locator('#caixa-counted')).toBeVisible();
    await expect(page.locator('#btn-fechar-caixa')).toBeVisible();
    await expect(page.locator('#caixa-content')).toContainText('Valores financeiros protegidos');
    await expect(page.locator('#caixa-content')).not.toContainText('Esperado no caixa');
    await expect(page.locator('#caixa-content')).not.toContainText('Histórico de fechamentos');
    expect(await page.evaluate(() => window.__testAuth.getFromCalls().filter(c => c.table === 'cash_closings').length)).toBe(0);
  });

  test('funcionária abre o caixa registrando só troco e observação', async ({ page }) => {
    await loginAs(page, adminUser());
    await setCashState(page, { open: false, manager: false });
    await page.evaluate(() => showSection('caixa'));
    await page.fill('#caixa-opening', '50,00');
    await page.fill('#caixa-open-notes', 'Turno manhã');
    await page.click('#btn-abrir-caixa');
    await expect.poll(() => page.evaluate(() => window.__testAuth.getRpcCalls().find(c => c.name === 'open_cash_register'))).toMatchObject({
      params: { input_opening_amount: 50, input_notes: 'Turno manhã' },
    });
    await expect(page.locator('#caixa-content')).not.toContainText('Esperado no caixa');
  });

  test('funcionária fecha pelo valor contado sem enviar ou receber esperado/diferença', async ({ page }) => {
    await loginAs(page, adminUser());
    await setCashState(page, { open: true, manager: false });
    await page.evaluate(() => showSection('caixa'));
    await page.fill('#caixa-counted', '63,50');
    await page.click('#btn-fechar-caixa');
    await expect.poll(() => page.evaluate(() => window.__testAuth.getRpcCalls().find(c => c.name === 'close_cash_register'))).toMatchObject({
      params: { input_cash_id: 'a15f14ed-4ae6-4bad-85d1-c92c0a5cb198', input_counted_amount: 63.5, input_notes: null },
    });
    await expect(page.locator('#caixa-content')).not.toContainText('Sobra:');
    await expect(page.locator('#caixa-content')).not.toContainText('Falta:');
  });

  test('dona admin só vê totais depois do PIN e o bloqueio os remove', async ({ page }) => {
    await loginAs(page, adminUser());
    await setCashState(page, { open: true, manager: true });
    await setPinState(page);
    await page.evaluate(() => showSection('caixa'));
    await expect(page.locator('#caixa-content')).not.toContainText('Esperado no caixa');
    await page.click('button:has-text("Desbloquear valores")');
    await page.fill('#admin-pin-input', 'senha-correta');
    await page.click('#admin-pin-submit-btn');
    await expect(page.locator('#caixa-content')).toContainText('Esperado no caixa');
    await page.evaluate(() => lockAdminSectionsManually());
    await expect(page.locator('#caixa-content')).not.toContainText('Esperado no caixa');
  });

  test('owner reconhecido pelo banco consulta financeiro sem PIN', async ({ page }) => {
    await loginAs(page, ownerUser());
    await setCashState(page, { open: true, manager: true, owner: true });
    await page.evaluate(() => showSection('caixa'));
    await expect(page.locator('#caixa-content')).toContainText('Esperado no caixa');
  });
});
