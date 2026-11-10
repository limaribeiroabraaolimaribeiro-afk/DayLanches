// @ts-check
const { test, expect } = require('@playwright/test');

async function openIsolatedCatalog(page) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (!['127.0.0.1','localhost'].includes(url.hostname)) return route.abort();
    if (url.pathname === '/supabase-config.js') {
      return route.fulfill({ contentType: 'application/javascript', body: '' });
    }
    return route.continue();
  });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof state !== 'undefined' && typeof updateCartBar === 'function');
  await page.evaluate(() => {
    const pid = '22222222-2222-4222-8222-222222222222';
    PRODUCTS_DATA = [{
      id: pid, name: 'Produto de Conveniência', desc:'Somente na loja',
      price: 10, cat:'conveniencia', img:'', badges:[],
      deliveryAvailable:false, hasOptions:false,
    }, {
      id:'11111111-1111-4111-8111-111111111111',
      name:'Produto Entregável',desc:'Entrega normal',
      price: 15,cat:'bebidas',img:'',badges:[],
      deliveryAvailable:true,hasOptions:false,
    }];
    state.cart = [];
    state.deliveryType = 'delivery';
    state.search = '';
    state.cat = 'conveniencia';
    renderProducts();
    updateCartBar();
  });
}

test('categoria Conveniência exibe aviso e produto somente no local', async ({ page }) => {
  await openIsolatedCatalog(page);
  await expect(page.locator('#cats-scroll')).toContainText('Conveniência');
  await expect(page.locator('#products-grid')).toContainText('Produto de Conveniência');
  await expect(page.locator('#products-grid')).toContainText('Somente no local');
});

test('carrinho contendo produto restrito força retirada e bloqueia opção de entrega', async ({ page }) => {
  await openIsolatedCatalog(page);
  await page.evaluate(() => {
    addToCart('22222222-2222-4222-8222-222222222222');
    navigateTo('delivery');
  });
  await expect(page.locator('input[name="dtype"][value="pickup"]')).toBeChecked();
  await expect(page.locator('input[name="dtype"][value="delivery"]')).toBeDisabled();
  await expect(page.locator('#delivery-local-only-note')).toBeVisible();
  expect(await page.evaluate(() => state.deliveryType)).toBe('pickup');
});

test('ao retirar o item restrito, entrega volta a ser permitida', async ({ page }) => {
  await openIsolatedCatalog(page);
  await page.evaluate(() => {
    addToCart('22222222-2222-4222-8222-222222222222');
    navigateTo('delivery');
    changeQty('22222222-2222-4222-8222-222222222222', -1);
  });
  await expect(page.locator('input[name="dtype"][value="delivery"]')).toBeEnabled();
  await page.locator('input[name="dtype"][value="delivery"]').check();
  expect(await page.evaluate(() => state.deliveryType)).toBe('delivery');
});

test('checkout bloqueia delivery forçado por código mesmo com item restrito', async ({ page }) => {
  await openIsolatedCatalog(page);
  await page.evaluate(() => {
    addToCart('22222222-2222-4222-8222-222222222222');
    state.deliveryType = 'delivery';
    window.__orders = [];
    saveOrderToSupabase = async data => { window.__orders.push(data); };
  });
  await page.evaluate(async () => { await sendWhatsApp(); });
  expect(await page.evaluate(() => window.__orders.length)).toBe(0);
  expect(await page.evaluate(() => state.deliveryType)).toBe('pickup');
});

test('produto entregue continua com entrega liberada', async ({ page }) => {
  await openIsolatedCatalog(page);
  await page.evaluate(() => {
    addToCart('11111111-1111-4111-8111-111111111111');
    navigateTo('delivery');
  });
  await expect(page.locator('input[name="dtype"][value="delivery"]')).toBeEnabled();
  await expect(page.locator('input[name="dtype"][value="delivery"]')).toBeChecked();
});
