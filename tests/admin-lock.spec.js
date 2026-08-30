// @ts-check
const { test, expect } = require('@playwright/test');
const {
  setupMockedPage, adminUser, loginAs, setPinState, isPinModalOpen, unlockViaPin,
  PROTECTED, FREE,
} = require('./helpers');

test.describe('Segunda camada de segurança — desbloqueio único (sem controle de relógio)', () => {
  test.beforeEach(async ({ page }) => {
    await setupMockedPage(page);
    await loginAs(page, adminUser());
    await setPinState(page); // default: configurado, can_manage=true, 30 min
  });

  // A ─────────────────────────────────────────────────────────
  test('A: senha correta abre Vendas', async ({ page }) => {
    await unlockViaPin(page, 'vendas');
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(true);
    await expect(page.locator('#section-vendas')).toHaveClass(/active/);
  });

  // B + C ─────────────────────────────────────────────────────
  test('B/C: as 6 áreas protegidas compartilham o mesmo desbloqueio (uma senha só)', async ({ page }) => {
    await unlockViaPin(page, PROTECTED[0]);
    for (const name of PROTECTED.slice(1)) {
      await page.evaluate((n) => showSection(n), name);
      expect(await isPinModalOpen(page)).toBe(false);
      await expect(page.locator(`#section-${name}`)).toHaveClass(/active/);
    }
    // só uma verificação de senha em toda a navegação
    const calls = await page.evaluate(() => window.__testAuth.getRpcCalls().filter(c => c.name === 'verify_management_pin'));
    expect(calls.length).toBe(1);
  });

  // D + Y ─────────────────────────────────────────────────────
  test('D: botão "Bloquear áreas administrativas" bloqueia tudo imediatamente e volta pra Pedidos', async ({ page }) => {
    await unlockViaPin(page, 'relatorios');
    await expect(page.locator('#btn-admin-lock')).toBeVisible();

    await page.click('#btn-admin-lock');

    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(false);
    await expect(page.locator('#section-pedidos')).toHaveClass(/active/);
    await expect(page.locator('#btn-admin-lock')).toBeHidden();

    // qualquer área protegida volta a pedir senha
    await page.evaluate(() => showSection('estoque'));
    expect(await isPinModalOpen(page)).toBe(true);
  });

  test('Y/AG: existe apenas UM botão de bloqueio manual em toda a página (não duplicado)', async ({ page }) => {
    const count = await page.locator('[onclick*="lockAdminSectionsManually"]').count();
    expect(count).toBe(1);
    await expect(page.locator('#btn-admin-lock')).toHaveAttribute('onclick', /lockAdminSectionsManually/);
  });

  // AF — exatamente 1 card de senha administrativa (sem cópia esquecida em Acessos) ──
  test('AF: existe exatamente 1 #admin-pin-status-box e 1 card "Senha administrativa", dentro de Configurações', async ({ page }) => {
    expect(await page.locator('#admin-pin-status-box').count()).toBe(1);
    expect(await page.locator('.g-card-title', { hasText: 'Senha administrativa' }).count()).toBe(1);

    // o card precisa estar DENTRO de #section-config, não mais em #section-acessos
    const parentSectionId = await page.evaluate(() =>
      document.getElementById('admin-pin-status-box')?.closest('section')?.id);
    expect(parentSectionId).toBe('section-config');
  });

  // AK, AL — botão fica visível em QUALQUER seção enquanto unlocked=true ──
  // Antes desta correção, #btn-admin-lock só era sincronizado em
  // unlockAdminSections()/lockAdminSections() — o que já bastava pra ficar
  // visível ao navegar pra uma área livre (nada nesse caminho o escondia),
  // mas o cenário só fica realmente à prova de dúvida com um teste
  // explícito cobrindo cada área livre por nome.
  test('AK: desbloqueia em Vendas → vai pra Pedidos → botão continua visível', async ({ page }) => {
    await unlockViaPin(page, 'vendas');
    await page.evaluate(() => showSection('pedidos'));
    expect(await page.evaluate(() => gs.section)).toBe('pedidos');
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(true);
    await expect(page.locator('#btn-admin-lock')).toBeVisible();
  });

  test('AL: desbloqueia em Vendas → vai pra Produtos/Caixa → botão continua visível', async ({ page }) => {
    await unlockViaPin(page, 'vendas');
    for (const name of ['produtos', 'caixa']) {
      await page.evaluate((n) => showSection(n), name);
      expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(true);
      await expect(page.locator('#btn-admin-lock')).toBeVisible();
    }
    // Balcão é um caso à parte: body.is-balcao esconde TODO o .dash-header
    // (inclusive os botões de som e "fechar loja", pré-existentes) porque o
    // PDV tem seu próprio cabeçalho em tela cheia — não uma regressão desta
    // feature. O ESTADO continua correto (unlocked=true, botão continuaria
    // visível se o header não estivesse oculto por design do Balcão) — só
    // não há pixel visível ali, e por instrução explícita este teste não
    // mexe em nada do Balcão para "corrigir" isso.
    await page.evaluate(() => showSection('balcao'));
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(true);
    expect(await page.evaluate(() => document.getElementById('btn-admin-lock')?.style.display)).toBe('inline-flex');
  });

  // AN — bloqueio manual funciona também a partir de uma área livre ──
  test('AN: clicar "Bloquear" estando em Pedidos bloqueia tudo imediatamente', async ({ page }) => {
    await unlockViaPin(page, 'vendas');
    await page.evaluate(() => showSection('pedidos'));
    await expect(page.locator('#btn-admin-lock')).toBeVisible();

    await page.click('#btn-admin-lock');

    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(false);
    expect(await page.evaluate(() => gs.adminUnlockExpiresAt)).toBe(0);
    await expect(page.locator('#btn-admin-lock')).toBeHidden();
    // já estava em Pedidos (área livre) — lockAdminSections só redireciona
    // se a seção atual for protegida, então permanece em Pedidos sem susto.
    await expect(page.locator('#section-pedidos')).toHaveClass(/active/);

    await page.evaluate(() => showSection('vendas'));
    expect(await isPinModalOpen(page)).toBe(true);
  });

  // AQ, AR, AS, AT — o MESMO #btn-admin-lock se move entre o header normal
  // e o header do PDV (Balcão esconde .dash-header inteiro via CSS
  // pré-existente) — nunca clona, nunca cria um segundo elemento.
  test('AQ: Vendas desbloqueada → Balcão → #btn-admin-lock fica REALMENTE visível (renderizado) no cabeçalho do PDV', async ({ page }) => {
    await unlockViaPin(page, 'vendas');
    await page.evaluate(() => showSection('balcao'));

    const btn = page.locator('#btn-admin-lock');
    await expect(btn).toBeVisible();
    const box = await btn.boundingBox();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(0);

    const parentClass = await page.evaluate(() => document.getElementById('btn-admin-lock').parentElement.className);
    expect(parentClass).toContain('pdv-left-header');
  });

  test('AR: continua existindo exatamente 1 #btn-admin-lock no DOM (mesmo depois de ir e voltar do Balcão)', async ({ page }) => {
    await unlockViaPin(page, 'vendas');
    await page.evaluate(() => showSection('balcao'));
    expect(await page.evaluate(() => document.querySelectorAll('#btn-admin-lock').length)).toBe(1);
    await page.evaluate(() => showSection('produtos'));
    expect(await page.evaluate(() => document.querySelectorAll('#btn-admin-lock').length)).toBe(1);
    expect(await page.locator('[onclick*="lockAdminSectionsManually"]').count()).toBe(1);
  });

  test('AS: Balcão → Produtos → o MESMO elemento (não um clone) volta pro header normal', async ({ page }) => {
    await unlockViaPin(page, 'vendas');
    await page.evaluate(() => showSection('balcao'));
    // marca o nó de verdade com uma propriedade JS arbitrária — um
    // cloneNode() NUNCA preservaria isso, só a referência original preserva.
    await page.evaluate(() => { document.getElementById('btn-admin-lock')._identityMarker = 'nó-original'; });

    await page.evaluate(() => showSection('produtos'));

    const parentClass = await page.evaluate(() => document.getElementById('btn-admin-lock').parentElement.className);
    expect(parentClass).toContain('dash-header');
    expect(await page.evaluate(() => document.getElementById('btn-admin-lock')._identityMarker)).toBe('nó-original');

    // e continua visível ao seguir navegando por áreas livres (comportamento já aprovado)
    await page.evaluate(() => showSection('pedidos'));
    await expect(page.locator('#btn-admin-lock')).toBeVisible();
    await page.evaluate(() => showSection('caixa'));
    await expect(page.locator('#btn-admin-lock')).toBeVisible();
  });

  test('AT: bloquear manualmente estando no Balcão trava as áreas administrativas', async ({ page }) => {
    await unlockViaPin(page, 'vendas');
    await page.evaluate(() => showSection('balcao'));
    await page.click('#btn-admin-lock');

    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(false);
    expect(await page.evaluate(() => gs.adminUnlockExpiresAt)).toBe(0);
    await expect(page.locator('#btn-admin-lock')).toBeHidden();
    // Balcão é área livre — lockAdminSections só redireciona se a seção
    // atual for protegida, então continua no Balcão sem interromper o PDV.
    await expect(page.locator('#section-balcao')).toHaveClass(/active/);

    await page.evaluate(() => showSection('vendas'));
    expect(await isPinModalOpen(page)).toBe(true);
  });

  // I, V — default 30 quando o backend não manda auto_lock_minutes ──
  test('I/V: sem auto_lock_minutes vindo do banco (linha ainda não existe), assume 30', async ({ page }) => {
    await page.evaluate(() => {
      window.__testAuth.setRpcResponse('get_management_pin_state', () => ({
        data: [{ is_configured: true, can_manage: true }], // sem auto_lock_minutes
        error: null,
      }));
    });
    await page.evaluate(() => fetchManagementPinState());
    expect(await page.evaluate(() => gs.adminLockMinutes)).toBe(30);
  });

  // M, N, P, O — eventos de auth ──────────────────────────────
  test('M/AP: logout bloqueia imediatamente e some com o botão', async ({ page }) => {
    await unlockViaPin(page, 'vendas');
    await page.evaluate(() => window.__testAuth.fireAuthEvent('SIGNED_OUT', null));
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(false);
    await expect(page.locator('#btn-admin-lock')).toBeHidden();
  });

  test('N/AP: logar com um usuário DIFERENTE bloqueia imediatamente e some com o botão', async ({ page }) => {
    await unlockViaPin(page, 'vendas');
    await page.evaluate((u) => window.__testAuth.fireAuthEvent('SIGNED_IN', u),
      adminUser({ id: 'uid-admin-2', email: 'outra-admin@daylanches.com.br' }));
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(false);
    await expect(page.locator('#btn-admin-lock')).toBeHidden();
  });

  test('P: TOKEN_REFRESHED do MESMO usuário não bloqueia a sessão administrativa', async ({ page }) => {
    await unlockViaPin(page, 'vendas');
    await page.evaluate((u) => window.__testAuth.fireAuthEvent('TOKEN_REFRESHED', u), adminUser());
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(true);

    await page.evaluate(() => showSection('relatorios'));
    expect(await isPinModalOpen(page)).toBe(false); // continua navegando livre entre as 6 áreas
  });

  test('O/AP: reload volta ao estado bloqueado (e sem botão) mesmo que a sessão do Supabase continue válida', async ({ page }) => {
    await unlockViaPin(page, 'vendas');
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(true);

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.__testAuth !== 'undefined');

    // simula o navegador restaurando a MESMA sessão já existente após o F5 —
    // evento real do Supabase pra isso é INITIAL_SESSION, não SIGNED_IN nem
    // TOKEN_REFRESHED, e mesmo assim deve bloquear.
    await loginAs(page, adminUser(), 'INITIAL_SESSION');
    await setPinState(page);

    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(false);
    await expect(page.locator('#btn-admin-lock')).toBeHidden();
  });

  // Auditoria de onAuthStateChange — matriz completa de eventos ──
  test('auditoria auth: USER_UPDATED do MESMO usuário ainda bloqueia (escolha conservadora deliberada)', async ({ page }) => {
    await unlockViaPin(page, 'acessos');
    // Ex.: administradora troca a própria senha de login em Acessos —
    // dispara USER_UPDATED com o mesmo auth.uid(). Diferente de
    // TOKEN_REFRESHED, isso NÃO é isento: bloqueia por segurança, mesmo
    // sendo uma pequena fricção de UX.
    await page.evaluate((u) => window.__testAuth.fireAuthEvent('USER_UPDATED', u), adminUser());
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(false);
  });

  // Q, R — nada sensível é persistido ──────────────────────────
  test('Q/R: PIN e estado de desbloqueio nunca vão para localStorage/sessionStorage', async ({ page }) => {
    const before = await page.evaluate(() => ({
      local: Object.keys(localStorage).sort(),
      session: Object.keys(sessionStorage).sort(),
    }));

    await unlockViaPin(page, 'vendas');
    await page.evaluate(() => showSection('config'));

    const after = await page.evaluate(() => ({
      local: JSON.stringify(localStorage),
      sessionKeys: Object.keys(sessionStorage).sort(),
      localKeys: Object.keys(localStorage).sort(),
    }));

    expect(after.local).not.toMatch(/senha-correta/i);
    expect(after.local).not.toMatch(/pin/i);
    expect(after.local).not.toMatch(/unlock/i);
    expect(after.localKeys).toEqual(before.local); // nenhuma chave nova no localStorage
    expect(after.sessionKeys).toEqual(before.session); // sessionStorage nunca é usado
  });

  // W — primeiro setup (Dayane sem PIN ainda) ─────────────────
  test('W: primeiro setup continua funcionando quando ainda não existe PIN', async ({ page }) => {
    await setPinState(page, { isConfigured: false, canManage: true, autoLockMinutes: 30 });

    await page.evaluate(() => showSection('vendas'));
    await page.waitForFunction(() => document.getElementById('admin-pin-overlay')?.style.display === 'flex');
    await expect(page.locator('#admin-pin-title')).toHaveText('Criar senha administrativa');

    await page.fill('#admin-pin-input', '123456');
    await page.fill('#admin-pin-confirm-input', '123456');
    await page.click('#admin-pin-submit-btn');

    await page.waitForFunction(() => document.getElementById('section-vendas')?.classList.contains('active'));
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(true);
    expect(await page.evaluate(() => gs.adminLockMinutes)).toBe(30);
  });

  // S — funcionário comum não vê nem consegue alterar ──────────
  test('S: sem can_manage, o seletor de timeout nem aparece (RPC continua sendo a autoridade real)', async ({ page }) => {
    await setPinState(page, { canManage: false });
    await unlockViaPin(page, 'config');
    await expect(page.locator('#admin-lock-minutes-select')).toHaveCount(0);
    await expect(page.locator('#admin-pin-status-box')).toContainText('Apenas administradores');
  });

  // U — valor fora do enum é rejeitado mesmo chamando a RPC direto ──
  test('U: chamar a RPC direto com um valor fora de 15/30/60/120 é rejeitado', async ({ page }) => {
    const result = await page.evaluate(() => getSb().rpc('set_management_pin_auto_lock', { input_minutes: 45 }));
    expect(result.error).toBeTruthy();
  });
});

test.describe('Timeout configurável e inatividade administrativa (relógio controlado)', () => {
  /* clock.install() PRECISA rodar antes do goto — senão o setInterval do
     watchdog de 30s (registrado assim que gestao.js carrega) fica preso no
     tempo real de parede e nunca reage ao tempo "avançado" pelo teste. */
  test.beforeEach(async ({ page }) => {
    await setupMockedPage(page, { clockTime: '2026-01-01T18:00:00' });
    await loginAs(page, adminUser());
    await setPinState(page);
  });

  // E, F, G, H — timeout configurável ─────────────────────────
  for (const minutes of [15, 30, 60, 120]) {
    test(`E-H: timeout de ${minutes} min expira sozinho por inatividade`, async ({ page }) => {
      await setPinState(page, { autoLockMinutes: minutes });

      await unlockViaPin(page, 'vendas');
      expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(true);

      // pouco antes do prazo: continua desbloqueado
      await page.clock.runFor(minutes * 60 * 1000 - 5000);
      expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(true);

      // passa do prazo + um tick do watchdog de 30s: bloqueia sozinho
      await page.clock.runFor(35000);
      expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(false);
    });
  }

  // J, K — atividade real renova o timer, não só trocar de seção ──
  test('J/K: clicar dentro da MESMA área protegida renova o timer (sem trocar de seção)', async ({ page }) => {
    await unlockViaPin(page, 'relatorios'); // expira 18:30

    await page.clock.runFor(20 * 60 * 1000); // 18:20 — ainda dentro do prazo
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(true);

    await page.click('#dash-title'); // atividade real, sem sair de Relatórios
    expect(await page.evaluate(() => gs.section)).toBe('relatorios');

    await page.clock.runFor(25 * 60 * 1000); // 18:45 — só passaria dos 18:30 originais
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(true); // prova que o clique renovou pra 18:50

    await page.clock.runFor(10 * 60 * 1000); // 18:55 — passou dos 18:50 renovados
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(false);
  });

  test('K (exemplo do pedido): 18:00 desbloqueia, 18:20 Relatórios renova p/ 18:50, 18:45 Vendas renova p/ 19:15', async ({ page }) => {
    await unlockViaPin(page, 'relatorios');

    await page.clock.runFor(20 * 60 * 1000); // 18:20
    await page.click('#dash-title'); // renova -> expira 18:50

    await page.clock.runFor(25 * 60 * 1000); // 18:45 (ainda < 18:50)
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(true);
    await page.evaluate(() => showSection('vendas')); // troca de seção também renova -> expira 19:15
    expect(await isPinModalOpen(page)).toBe(false);

    await page.clock.runFor(29 * 60 * 1000); // 19:14 (ainda < 19:15)
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(true);

    await page.clock.runFor(2 * 60 * 1000); // 19:16
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(false);
  });

  // L — área livre não mantém a sessão administrativa viva ────────
  test('L: atividade em Pedidos (área livre) NÃO renova o desbloqueio administrativo', async ({ page }) => {
    await unlockViaPin(page, 'vendas'); // expira 18:30

    await page.evaluate(() => showSection('pedidos')); // área livre
    expect(await page.evaluate(() => gs.section)).toBe('pedidos');

    await page.clock.runFor(20 * 60 * 1000); // 18:20
    await page.click('#dash-title'); // atividade, mas em área livre — não deve renovar

    await page.clock.runFor(15 * 60 * 1000); // 18:35 — passou dos 18:30 originais, sem renovação
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(false);
  });

  // AM — exemplo literal do pedido: trabalhar em Pedidos não impede o timeout ──
  test('AM: desbloqueou 18:00, vai pra Pedidos às 18:05, trabalha até 18:31 → bloqueia sozinho', async ({ page }) => {
    await unlockViaPin(page, 'vendas'); // 18:00, expira 18:30 (timeout 30 min)

    await page.clock.runFor(5 * 60 * 1000); // 18:05
    await page.evaluate(() => showSection('pedidos'));
    expect(await page.evaluate(() => gs.section)).toBe('pedidos');

    // "fica trabalhando em Pedidos" até 18:31 — vários cliques ao longo do
    // caminho, todos em área livre, nenhum deve renovar o prazo original.
    await page.clock.runFor(10 * 60 * 1000); // 18:15
    await page.click('#dash-title');
    await page.clock.runFor(10 * 60 * 1000); // 18:25
    await page.click('#dash-title');
    await page.clock.runFor(6 * 60 * 1000);  // 18:31 — passou dos 18:30

    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(false);
  });

  // AO — depois do timeout, o botão some e a área protegida volta a pedir senha ──
  test('AO: timeout expirado em Pedidos → botão some e Vendas volta a pedir senha', async ({ page }) => {
    await unlockViaPin(page, 'vendas');
    await page.evaluate(() => showSection('pedidos'));
    await expect(page.locator('#btn-admin-lock')).toBeVisible();

    await page.clock.runFor(30 * 60 * 1000 + 35000); // passa dos 30 min + 1 tick do watchdog

    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(false);
    await expect(page.locator('#btn-admin-lock')).toBeHidden();

    await page.evaluate(() => showSection('vendas'));
    expect(await isPinModalOpen(page)).toBe(true);
  });

  // AU — timeout também funciona com o botão morando no header do PDV ──
  test('AU: timeout expira estando no Balcão → botão some e Vendas volta a pedir senha', async ({ page }) => {
    await unlockViaPin(page, 'vendas');
    await page.evaluate(() => showSection('balcao'));
    await expect(page.locator('#btn-admin-lock')).toBeVisible();

    await page.clock.runFor(30 * 60 * 1000 + 35000); // passa dos 30 min + 1 tick do watchdog

    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(false);
    await expect(page.locator('#btn-admin-lock')).toBeHidden();

    await page.evaluate(() => showSection('vendas'));
    expect(await isPinModalOpen(page)).toBe(true);
  });

  // T — só admin/owner altera, e recalcula expiração na hora ──
  test('T: alterar o tempo de bloqueio na tela de Segurança atualiza a sessão em andamento', async ({ page }) => {
    await unlockViaPin(page, 'config');
    await page.waitForSelector('#admin-lock-minutes-select');

    await page.selectOption('#admin-lock-minutes-select', '60');
    await page.waitForFunction(() => gs.adminLockMinutes === 60);

    // expiração recalculada a partir de AGORA com o novo tempo (60 min), não dos 30 originais
    await page.clock.runFor(45 * 60 * 1000);
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(true);
    await page.clock.runFor(20 * 60 * 1000);
    expect(await page.evaluate(() => gs.adminSectionsUnlocked)).toBe(false);
  });
});

// X — mobile: 360 a 430px sem overflow horizontal ────────────────
test.describe('Responsividade mobile (360–430px)', () => {
  for (const width of [360, 375, 390, 412, 430]) {
    test(`X: sem overflow horizontal em ${width}px com o botão de bloqueio visível`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await setupMockedPage(page);
      await loginAs(page, adminUser());
      await setPinState(page);
      await unlockViaPin(page, 'config'); // pior caso: header com botão de lock + card com select

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(width);

      const lockBtnBox = await page.locator('#btn-admin-lock').boundingBox();
      expect(lockBtnBox.x + lockBtnBox.width).toBeLessThanOrEqual(width + 1);
    });
  }

  // AV — mesma checagem, mas dentro do cabeçalho do PDV (Balcão) ──────
  for (const width of [360, 375, 390, 412, 430]) {
    test(`AV: Balcão sem overflow horizontal em ${width}px, com o botão de bloqueio visível no header do PDV`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await setupMockedPage(page);
      await loginAs(page, adminUser());
      await setPinState(page);
      await unlockViaPin(page, 'vendas');
      await page.evaluate(() => showSection('balcao'));

      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      expect(scrollWidth).toBeLessThanOrEqual(width);

      const lockBtn = page.locator('#btn-admin-lock');
      await expect(lockBtn).toBeVisible();
      const lockBtnBox = await lockBtn.boundingBox();
      expect(lockBtnBox.x + lockBtnBox.width).toBeLessThanOrEqual(width + 1);

      // não pode sobrepor o nome do usuário do PDV nem ficar cortado por ele
      const userBox = await page.locator('#pdv-user-display').boundingBox();
      if (userBox) expect(lockBtnBox.x + lockBtnBox.width).toBeLessThanOrEqual(userBox.x + 1);
    });
  }
});

// Z — smoke de não regressão nas áreas livres ────────────────────
test.describe('Não regressão em áreas livres', () => {
  test('Z: Pedidos e Balcão continuam livres, sem pedir senha, sem erros de console', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await setupMockedPage(page);
    await loginAs(page, adminUser());
    await setPinState(page);

    for (const name of FREE) {
      await page.evaluate((n) => showSection(n), name);
      expect(await isPinModalOpen(page)).toBe(false);
      await expect(page.locator(`#section-${name}`)).toHaveClass(/active/);
    }

    expect(errors).toEqual([]);
  });
});
