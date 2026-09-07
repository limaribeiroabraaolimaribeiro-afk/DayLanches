// @ts-check
/* Testes de isStoreOpenNow() (script.js — cardápio público), cobrindo a
   abertura manual excepcional ("Abrir loja hoje") somada ao que já existia
   (horário semanal + fechamento manual "Fechar loja hoje"). Roda contra
   /index.html de verdade (não é um mock de DOM) — só a rede (Supabase/CDN)
   é bloqueada, então loadProductsFromDatabase()/loadStoreConfig() caem no
   caminho "sem Supabase" (storeConfig vira {}) e o teste sobrescreve
   storeConfig com o cenário que quer testar antes de chamar isStoreOpenNow().

   page.clock.install() PRECISA rodar antes do goto (mesmo motivo do
   admin-lock.spec.js): assim `new Date()` dentro de isStoreOpenNow() usa o
   horário congelado do teste, não o relógio real da máquina — sem isso os
   testes ficariam instáveis dependendo da hora em que rodam de verdade. */
const { test, expect } = require('@playwright/test');

async function setupStorePage(page, isoDateTime) {
  await page.clock.install({ time: new Date(isoDateTime) });

  const noStore = { 'cache-control': 'no-store' };
  await page.route('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: '/* stubbed in tests */', headers: noStore }));
  await page.route('https://fonts.googleapis.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '', headers: noStore }));
  await page.route('https://cdnjs.cloudflare.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/css', body: '', headers: noStore }));
  await page.route(/^https:\/\/(tse4\.mm\.bing\.net|static-images\.ifood\.com\.br|.*\.(png|jpg|jpeg|webp))/, (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from([]), headers: noStore }));
  await page.route('**/day-lanches-worker*/**', (route) => route.abort());

  await page.goto('/index.html');
  await page.waitForFunction(() => typeof window.isStoreOpenNow === 'function' || typeof isStoreOpenNow === 'function');
}

/* Injeta o storeConfig do cenário e lê o retorno de isStoreOpenNow() —
   storeConfig é `let` no topo de script.js (não é módulo, não vira
   window.storeConfig), mas o corpo da função passada a page.evaluate roda
   no mesmo escopo global da página, então a referência bare funciona igual
   ao padrão já usado em tests/admin-lock.spec.js com `gs`. */
async function getStatus(page, cfg) {
  return page.evaluate((c) => {
    storeConfig = c;
    return isStoreOpenNow();
  }, cfg);
}

/* Horário semanal usado nos cenários: sempre o fallback do projeto
   ("Quarta a domingo 17:30 às 23:00") deixado vazio de propósito — os
   testes fixam o dia da semana via clockTime, então isto cobre tanto "hoje
   é um dia normalmente aberto" quanto "hoje é um dia normalmente fechado"
   sem precisar duplicar o texto do horário em cada teste. */
const NO_SCHEDULE = {};

test.describe('isStoreOpenNow() — abertura manual excepcional ("Abrir loja hoje")', () => {
  // 1 — dia normalmente fechado (segunda) + abertura manual válida = abre no período definido
  test('dia normalmente fechado (segunda) + abertura manual hoje 17:30–23:00, agora 18:00 → aberto', async ({ page }) => {
    await setupStorePage(page, '2026-01-05T18:00:00-03:00'); // segunda-feira
    const status = await getStatus(page, {
      ...NO_SCHEDULE,
      manual_open_date: '2026-01-05', manual_open_from: '17:30:00', manual_open_to: '23:00:00',
    });
    expect(status.isOpen).toBe(true);
    expect(status.manualOpen).toBe(true);
    expect(status.manualOpenPhase).toBe('during');
    expect(status.manualOpenFrom).toBe('17:30');
    expect(status.manualOpenTo).toBe('23:00');
  });

  // 2 — abertura manual antes do horário = ainda fechado, mas informa que abre hoje
  test('abertura manual hoje 17:30–23:00, agora 15:00 (antes) → fechado, mas manualOpen=true/phase=before', async ({ page }) => {
    await setupStorePage(page, '2026-01-05T15:00:00-03:00');
    const status = await getStatus(page, {
      ...NO_SCHEDULE,
      manual_open_date: '2026-01-05', manual_open_from: '17:30:00', manual_open_to: '23:00:00',
    });
    expect(status.isOpen).toBe(false);
    expect(status.manualOpen).toBe(true);
    expect(status.manualOpenPhase).toBe('before');
  });

  // 3 — abertura manual durante o horário = aberto (mesmo cenário do teste 1, checado via message também)
  test('abertura manual durante o horário → aberto, message="Aberto agora"', async ({ page }) => {
    await setupStorePage(page, '2026-01-05T20:00:00-03:00');
    const status = await getStatus(page, {
      ...NO_SCHEDULE,
      manual_open_date: '2026-01-05', manual_open_from: '17:30:00', manual_open_to: '23:00:00',
    });
    expect(status.isOpen).toBe(true);
    expect(status.message).toBe('Aberto agora');
  });

  // 4 — abertura manual depois do horário = fechado
  test('abertura manual hoje 17:30–23:00, agora 23:30 (depois) → fechado, phase=after', async ({ page }) => {
    await setupStorePage(page, '2026-01-05T23:30:00-03:00');
    const status = await getStatus(page, {
      ...NO_SCHEDULE,
      manual_open_date: '2026-01-05', manual_open_from: '17:30:00', manual_open_to: '23:00:00',
    });
    expect(status.isOpen).toBe(false);
    expect(status.manualOpen).toBe(true);
    expect(status.manualOpenPhase).toBe('after');
  });

  // 5 — abertura manual de ontem = ignorada
  test('manual_open_date de ontem → ignorado, loja segue o horário semanal (fechada, segunda)', async ({ page }) => {
    await setupStorePage(page, '2026-01-05T20:00:00-03:00'); // segunda
    const status = await getStatus(page, {
      ...NO_SCHEDULE,
      manual_open_date: '2026-01-04', manual_open_from: '17:30:00', manual_open_to: '23:00:00',
    });
    expect(status.manualOpen).toBe(false);
    expect(status.isOpen).toBe(false); // fallback semanal: segunda não está em "quarta a domingo"
  });

  // 6 — abertura manual de amanhã = ignorada hoje
  test('manual_open_date de amanhã → ignorado hoje', async ({ page }) => {
    await setupStorePage(page, '2026-01-05T20:00:00-03:00');
    const status = await getStatus(page, {
      ...NO_SCHEDULE,
      manual_open_date: '2026-01-06', manual_open_from: '17:30:00', manual_open_to: '23:00:00',
    });
    expect(status.manualOpen).toBe(false);
    expect(status.isOpen).toBe(false);
  });

  // 7 — fechamento manual hoje + abertura manual hoje = fechado (fechamento sempre vence)
  test('manual_closed_date=hoje + manual_open_date=hoje → fechado, manualOpen=false', async ({ page }) => {
    await setupStorePage(page, '2026-01-05T20:00:00-03:00'); // dentro da janela de abertura manual
    const status = await getStatus(page, {
      ...NO_SCHEDULE,
      manual_closed_date: '2026-01-05',
      manual_open_date: '2026-01-05', manual_open_from: '17:30:00', manual_open_to: '23:00:00',
    });
    expect(status.isOpen).toBe(false);
    expect(status.manualClosed).toBe(true);
    expect(status.manualOpen).toBe(false);
  });

  // 8 — horário semanal continua funcionando normalmente (sem nenhum campo manual)
  test('sem nenhum campo manual, quarta 18:00 → aberto pelo fallback semanal (quarta a domingo 17:30–23:00)', async ({ page }) => {
    await setupStorePage(page, '2026-01-07T18:00:00-03:00'); // quarta-feira
    const status = await getStatus(page, { ...NO_SCHEDULE });
    expect(status.isOpen).toBe(true);
    expect(status.manualOpen).toBe(false);
    expect(status.manualClosed).toBe(false);
  });

  test('sem nenhum campo manual, segunda 18:00 → fechado pelo fallback semanal', async ({ page }) => {
    await setupStorePage(page, '2026-01-05T18:00:00-03:00'); // segunda-feira
    const status = await getStatus(page, { ...NO_SCHEDULE });
    expect(status.isOpen).toBe(false);
    expect(status.manualOpen).toBe(false);
  });

  // 9 — "Fechar loja hoje" continua funcionando isoladamente (sem nenhum campo de abertura manual)
  test('manual_closed_date=hoje sozinho (sem abertura manual) → fechado, message="Fechado hoje"', async ({ page }) => {
    await setupStorePage(page, '2026-01-07T18:00:00-03:00'); // quarta (normalmente aberta)
    const status = await getStatus(page, { ...NO_SCHEDULE, manual_closed_date: '2026-01-07', manual_closed_message: 'Sem atendimento hoje.' });
    expect(status.isOpen).toBe(false);
    expect(status.manualClosed).toBe(true);
    expect(status.manualClosedMessage).toBe('Sem atendimento hoje.');
    expect(status.message).toBe('Fechado hoje');
  });

  // Horário final antes/igual ao inicial nunca é tratado como válido (mesma regra da validação no Gestão)
  test('manual_open_to <= manual_open_from → tratado como inválido (manualOpen=false, cai no horário semanal)', async ({ page }) => {
    await setupStorePage(page, '2026-01-05T20:00:00-03:00');
    const status = await getStatus(page, {
      ...NO_SCHEDULE,
      manual_open_date: '2026-01-05', manual_open_from: '23:00:00', manual_open_to: '17:30:00',
    });
    expect(status.manualOpen).toBe(false);
    expect(status.isOpen).toBe(false);
  });
});
