const { test, expect } = require('@playwright/test');

async function openCheckout(page) {
  // Isola serviços externos: nenhum pedido ou pagamento real é enviado.
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (url.pathname === '/supabase-config.js') {
      return route.fulfill({ contentType: 'application/javascript', body: '' });
    }
    return route.continue();
  });
  await page.goto('/index.html');
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    state.deliveryType = 'pickup';
    navigateTo('delivery');
    window.__orders = [];
    window.__messages = [];
    saveOrderToSupabase = async data => { window.__orders.push(data); };
    blockIfManuallyClosed = async () => false;
    window.open = url => { window.__messages.push(url); };
  });
}

test('A: checkout novo inicia sem nome', async ({ page }) => {
  await openCheckout(page);
  await expect(page.locator('#f-name')).toHaveValue('');
  await expect(page.locator('#f-name')).toHaveAttribute('placeholder', 'Digite seu nome completo');
  expect(await page.evaluate(() => state.form.name)).toBe('');
});

for (const [scenario, name] of [['B: vazio', ''], ['C: espaços', '   ']]) {
  test(`${scenario} bloqueia pagamento e envio`, async ({ page }) => {
    await openCheckout(page);
    await page.locator('#f-name').fill(name);
    await page.locator('[onclick="goToPayment()"]').click();
    await expect(page.locator('#delivery-error')).toBeVisible();
    await expect(page.locator('#delivery-error')).toHaveText('Informe seu nome completo para continuar.');
    await expect(page.locator('#f-name')).toBeFocused();
    expect(await page.evaluate(() => ({ page: state.page, name: state.form.name,
      orders: window.__orders, messages: window.__messages }))).toEqual({
      page: 'delivery', name: '', orders: [], messages: [],
    });
  });
}

test('D/E: nome informado chega ao estado e ao pedido', async ({ page }) => {
  await openCheckout(page);
  await page.locator('#f-name').fill('João da Silva');
  await page.locator('#f-phone').fill('47984261357');
  await page.locator('[onclick="goToPayment()"]').click();
  expect(await page.evaluate(() => state.page)).toBe('payment');
  expect(await page.evaluate(() => state.form.name)).toBe('João da Silva');
  await page.evaluate(async () => {
    state.payMethod = 'cash';
    await sendWhatsApp();
  });
  expect(await page.evaluate(() => window.__orders[0].customer_name)).toBe('João da Silva');
  // Exercita também a montagem do pedido online, interrompendo antes do provedor.
  await page.evaluate(async () => {
    window.fetch = async () => ({ ok: false, json: async () => ({}) });
    await handleOnlinePayment('pix_online');
  });
  expect(await page.evaluate(() => window.__orders.map(o => o.customer_name)))
    .toEqual(['João da Silva', 'João da Silva']);
});

test('F: novo acesso e restauração não reutilizam nome', async ({ page, context }) => {
  await openCheckout(page);
  await page.locator('#f-name').fill('João da Silva');
  await page.evaluate(() => {
    state.form.name = 'João da Silva';
    localStorage.setItem('customer_name', state.form.name);
    sessionStorage.setItem('customer_name', state.form.name);
  });
  await page.reload();
  await expect(page.locator('#f-name')).toHaveValue('');
  expect(await page.evaluate(() => state.form.name)).toBe('');
  await page.evaluate(() => {
    document.getElementById('f-name').value = 'João da Silva';
    state.form.name = 'João da Silva';
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(page.locator('#f-name')).toHaveValue('');
  expect(await page.evaluate(() => state.form.name)).toBe('');
  const other = await context.newPage();
  await openCheckout(other);
  await expect(other.locator('#f-name')).toHaveValue('');
  expect(await other.evaluate(() => state.form.name)).toBe('');
});
