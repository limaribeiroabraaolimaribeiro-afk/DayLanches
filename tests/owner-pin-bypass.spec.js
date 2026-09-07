// @ts-check
/* Bypass do PIN administrativo para role='owner' (Abraão, dono/desenvolvedor
   do sistema) — Dayane (role='admin') e qualquer funcionário continuam
   exatamente como antes (ver admin-lock.spec.js, não alterado). A decisão
   de bypass nunca é calculada no cliente: get_management_pin_state() é a
   única fonte (aqui mockada via setPinState({bypassPin: true}) — o mesmo
   ponto que já mockava is_configured/can_manage/auto_lock_minutes). */
const { test, expect } = require('@playwright/test');
const {
  setupMockedPage, adminUser, ownerUser, loginAs, setPinState, isPinModalOpen,
  PROTECTED,
} = require('./helpers');

async function enterSection(page, name) {
  await page.evaluate((n) => showSection(n), name);
  await page.waitForFunction((n) => document.getElementById(`section-${n}`)?.classList.contains('active'), name);
}

test.describe('Owner (role=owner) — bypass do PIN administrativo', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockedPage(page);
    await loginAs(page, ownerUser());
    await setPinState(page, { bypassPin: true }); // is_configured/can_manage default true, irrelevante pro bypass
  });

  for (const name of PROTECTED) {
    test(`owner acessa ${name} imediatamente, sem modal de PIN`, async ({ page }) => {
      await enterSection(page, name);
      expect(await isPinModalOpen(page)).toBe(false);
      await expect(page.locator(`#section-${name}`)).toHaveClass(/active/);
    });
  }

  test('owner não recebe modal de PIN ao navegar entre TODAS as áreas protegidas em sequência', async ({ page }) => {
    for (const name of PROTECTED) {
      await enterSection(page, name);
      expect(await isPinModalOpen(page)).toBe(false);
    }
    // nem uma verificação de PIN foi feita (bypass_pin já resolveu tudo na 1ª chamada)
    const verifyCalls = await page.evaluate(() => window.__testAuth.getRpcCalls().filter(c => c.name === 'verify_management_pin'));
    expect(verifyCalls.length).toBe(0);
  });

  test('owner nunca sofre auto-lock administrativo (nenhum temporizador é iniciado)', async ({ page }) => {
    await enterSection(page, 'vendas');
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(false); // bypass não usa a mesma flag do PIN
    expect(await page.evaluate(() => gs.adminUnlockExpiresAt)).toBe(0);      // nenhuma expiração agendada
    expect(await page.evaluate(() => gs.ownerPinBypass)).toBe(true);

    // mesmo "passando" bastante tempo, continua acessível sem pedir PIN de novo
    await page.evaluate(() => showSection('produtos'));
    await enterSection(page, 'relatorios');
    expect(await isPinModalOpen(page)).toBe(false);
  });

  test('botão "Bloquear áreas administrativas" nunca aparece para o owner', async ({ page }) => {
    await enterSection(page, 'config');
    await expect(page.locator('#btn-admin-lock')).toBeHidden();
    await enterSection(page, 'acessos');
    await expect(page.locator('#btn-admin-lock')).toBeHidden();
  });

  test('owner bypassa mesmo quando o PIN NUNCA foi configurado (não recebe modal de "criar senha")', async ({ page }) => {
    await setPinState(page, { bypassPin: true, isConfigured: false, canManage: true });
    await enterSection(page, 'vendas');
    expect(await isPinModalOpen(page)).toBe(false);
    await expect(page.locator('#section-vendas')).toHaveClass(/active/);
  });

  test('owner continua podendo configurar/trocar o PIN em Configurações (can_manage=true), mesmo não precisando dele', async ({ page }) => {
    await enterSection(page, 'config');
    await page.waitForSelector('#admin-pin-status-box .btn-secondary');
    await expect(page.locator('#admin-pin-status-box')).not.toContainText('Apenas administradores');
  });

  test('troca de usuário (owner → admin) revalida do zero: o bypass do owner não vaza pra próxima sessão', async ({ page }) => {
    await enterSection(page, 'vendas');
    expect(await page.evaluate(() => gs.ownerPinBypass)).toBe(true);

    await page.evaluate((u) => window.__testAuth.fireAuthEvent('SIGNED_IN', u), adminUser());
    await setPinState(page, { bypassPin: false, canManage: true }); // admin de verdade: sem bypass

    expect(await page.evaluate(() => gs.ownerPinBypass)).toBe(false);
    await page.evaluate(() => showSection('vendas'));
    expect(await isPinModalOpen(page)).toBe(true); // Dayane precisa digitar o PIN normalmente
  });
});

test.describe('Admin (role=admin, Dayane) — continua exigindo PIN mesmo com o campo bypass_pin existindo', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockedPage(page);
    await loginAs(page, adminUser());
  });

  test('admin com can_manage=true e bypass_pin=false continua recebendo o modal de PIN', async ({ page }) => {
    await setPinState(page, { bypassPin: false, canManage: true });
    await page.evaluate(() => showSection('vendas'));
    expect(await isPinModalOpen(page)).toBe(true);
    expect(await page.evaluate(() => gs.ownerPinBypass)).toBe(false);
  });

  test('resposta antiga do RPC sem o campo bypass_pin (undefined) falha fechado: continua exigindo PIN', async ({ page }) => {
    await page.evaluate(() => {
      window.__testAuth.setRpcResponse('get_management_pin_state', () => ({
        data: [{ is_configured: true, can_manage: true, auto_lock_minutes: 30 }], // sem bypass_pin
        error: null,
      }));
    });
    await page.evaluate(() => showSection('relatorios'));
    expect(await isPinModalOpen(page)).toBe(true);
    expect(await page.evaluate(() => gs.ownerPinBypass)).toBe(false);
  });
});

test.describe('Funcionário comum (can_manage=false) — sem bypass, sem gestão de PIN', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockedPage(page);
    await loginAs(page, adminUser({ id: 'uid-funcionario-1', email: 'funcionaria@daylanches.com.br' }));
  });

  test('funcionário com bypass_pin=false e can_manage=false: sem bypass, continua dependendo do PIN', async ({ page }) => {
    await setPinState(page, { bypassPin: false, canManage: false, isConfigured: true });
    await page.evaluate(() => showSection('estoque'));
    expect(await isPinModalOpen(page)).toBe(true);
    expect(await page.evaluate(() => gs.ownerPinBypass)).toBe(false);
  });

  test('funcionário não vê opção de criar/trocar o PIN em Configurações', async ({ page }) => {
    await setPinState(page, { bypassPin: false, canManage: false, isConfigured: true });
    await page.evaluate(() => showSection('config'));
    await page.fill('#admin-pin-input', 'senha-correta');
    await page.click('#admin-pin-submit-btn');
    await page.waitForFunction(() => document.getElementById('section-config')?.classList.contains('active'));
    await expect(page.locator('#admin-pin-status-box')).toContainText('Apenas administradores');
    await expect(page.locator('#admin-lock-minutes-select')).toHaveCount(0);
  });
});
