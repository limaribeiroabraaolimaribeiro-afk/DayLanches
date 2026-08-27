'use strict';
/* Day Lanches — Atendimento (garçom). Interface mobile independente do
   Balcão da Gestão (gestao.js não é tocado nem referenciado aqui), mas fala
   com o MESMO modelo de dados (tabela orders, mesmos campos, mesmo índice
   único de mesa aberta, mesmo contrato de impressão incremental do Print
   Agent) — só reproduz a lógica necessária: mesa → produtos → carrinho →
   comanda → impressão automática já existente. Nenhum pagamento, nenhum
   fechamento de mesa, nenhuma ação administrativa aqui. */

const TOTAL_MESAS = 10; // mesma quantidade usada hoje pelo Balcão (pdvRenderMesas)

function getSb() {
  const c = window.supabaseClient;
  if (!c) throw new Error('Supabase não carregado. Verifique supabase-config.js.');
  return c;
}

function elid(id) { return document.getElementById(id); }
function esc(s) { return String(s || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function fmt(n) { return Number(n || 0).toFixed(2).replace('.', ','); }

function toast(msg, isErr) {
  const t = elid('gc-toast');
  if (!t) return;
  t.textContent = msg;
  t.className = 'gc-toast show' + (isErr ? ' toast-error' : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.classList.remove('show'); }, 3200);
}

/* ══════════════════════════════════════════════════════════
   ESTADO
══════════════════════════════════════════════════════════ */
const gc = {
  currentUser: null,
  products: [],
  tableNumber: null,
  existingOrder: null,   // comanda aberta da mesa selecionada, se houver (histórico — nunca editado aqui)
  cart: [],              // itens novos, ainda não enviados
  catFilter: '',
  optProduct: null,
  optGroups: [],
  optSelections: {},
  optQty: 1,
  submitting: false,
  pendingSwap: false,
};

function gcShowView(name) {
  document.querySelectorAll('.gc-view').forEach(v => { v.style.display = 'none'; });
  const el = elid('view-' + name);
  if (el) el.style.display = 'flex';
  window.scrollTo({ top: 0, behavior: 'instant' });

  if (name === 'cart') {
    elid('cart-header-title').textContent = `MESA ${gc.tableNumber}`;
    gcRenderCartItemsInto('cart-items', true);
    gcRenderCartTotals();
  }
}

/* ══════════════════════════════════════════════════════════
   AUTENTICAÇÃO — mesmo Supabase Auth já usado pela Gestão, sem role nova.
   Qualquer sessão válida (mesma conta usada na Gestão) já é suficiente,
   exatamente como funciona hoje em gestao.js (onAuthStateChange só checa
   session?.user, sem checagem de role) — não crio um portão de acesso
   diferente do que já existe.
══════════════════════════════════════════════════════════ */
function gcInitAuth() {
  const form = elid('login-form');
  if (form) {
    form.addEventListener('submit', gcHandleLogin);
  }

  getSb().auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      gc.currentUser = session.user;
      gcOnAuthenticated();
    } else {
      gc.currentUser = null;
      gc.tableNumber = null;
      gc.existingOrder = null;
      gc.cart = [];
      gcShowView('login');
    }
  });

  getSb().auth.getSession().then(({ data: { session } }) => {
    if (!session) gcShowView('login');
  });
}

async function gcHandleLogin(e) {
  e.preventDefault();
  const email = elid('login-email')?.value.trim() || '';
  const password = elid('login-password')?.value || '';
  const errEl = elid('login-error');
  const btn = elid('login-btn');
  if (errEl) errEl.style.display = 'none';
  if (btn) { btn.disabled = true; btn.textContent = 'Entrando...'; }

  try {
    const { error } = await getSb().auth.signInWithPassword({ email, password });
    if (error) {
      if (errEl) {
        errEl.textContent = /invalid login credentials/i.test(error.message)
          ? 'E-mail ou senha incorretos.'
          : 'Não foi possível entrar. Tente novamente.';
        errEl.style.display = 'block';
      }
    }
    // sucesso: onAuthStateChange cuida da navegação
  } catch (err) {
    if (errEl) { errEl.textContent = 'Erro de conexão. Tente novamente.'; errEl.style.display = 'block'; }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Entrar'; }
  }
}

function gcLogout() {
  getSb().auth.signOut().catch(() => {});
}

async function gcOnAuthenticated() {
  gcShowView('mesas');
  await gcLoadProducts();
  await gcRenderMesas();
}

/* ══════════════════════════════════════════════════════════
   PRODUTOS / CATEGORIAS / ADICIONAIS — mesma fonte (products,
   product_option_groups, product_option_items) e mesmo critério de "tem
   adicionais" usado no Balcão (pdvLoadProductOptions).
══════════════════════════════════════════════════════════ */
async function gcLoadProducts() {
  try {
    const { data, error } = await getSb().from('products').select('*').order('name');
    if (error) throw error;
    gc.products = (data || []).filter(p => p.active !== false);

    const ids = gc.products.map(p => p.id).filter(Boolean);
    if (ids.length) {
      const { data: groups } = await getSb().from('product_option_groups').select('product_id').in('product_id', ids).eq('active', true);
      const withOpts = new Set((groups || []).map(g => g.product_id));
      gc.products.forEach(p => { p._hasOptions = withOpts.has(p.id); });
    }
  } catch (e) {
    console.error('[Garçom] Erro ao carregar produtos:', e);
    toast('Erro ao carregar o cardápio.', true);
  }
}

function gcRenderProducts() {
  const grid = elid('products-grid');
  const loading = elid('products-loading');
  const catRow = elid('cat-row');
  if (!grid) return;

  if (loading) loading.style.display = 'none';
  grid.style.display = 'grid';

  const q = (elid('gc-search')?.value || '').toLowerCase();
  const cats = [...new Set(gc.products.map(p => p.category || p.cat || '').filter(Boolean))];
  if (catRow) {
    catRow.innerHTML = `<button type="button" class="gc-cat-btn${!gc.catFilter ? ' active' : ''}" onclick="gcFilterCat('')">Todos</button>` +
      cats.map(c => `<button type="button" class="gc-cat-btn${gc.catFilter === c ? ' active' : ''}" onclick="gcFilterCat('${esc(c)}')">${esc(c)}</button>`).join('');
  }

  let list = gc.products;
  if (gc.catFilter) list = list.filter(p => (p.category || p.cat) === gc.catFilter);
  if (q) list = list.filter(p => (p.name || '').toLowerCase().includes(q));

  if (!list.length) {
    grid.innerHTML = '<p class="gc-empty-msg">Nenhum produto encontrado.</p>';
    return;
  }

  grid.innerHTML = list.map(p => {
    const img = p.image_url || p.img || '';
    const hasOptions = p._hasOptions;
    return `<div class="gc-product-card">
      ${img
        ? `<img class="gc-product-img" src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" onerror="this.outerHTML='<div class=&quot;gc-product-img-ph&quot;><i class=&quot;fas fa-image&quot;></i></div>'">`
        : '<div class="gc-product-img-ph"><i class="fas fa-image"></i></div>'}
      <div class="gc-product-body">
        <div class="gc-product-name">${esc(p.name)}</div>
        <div class="gc-product-price">R$ ${fmt(p.price)}</div>
        <button type="button" class="gc-product-add" onclick="gcAddProduct('${p.id}')">
          <i class="fas fa-${hasOptions ? 'sliders' : 'plus'}"></i> ${hasOptions ? 'Escolher' : 'Adicionar'}
        </button>
      </div>
    </div>`;
  }).join('');
}

function gcFilterCat(cat) { gc.catFilter = cat; gcRenderProducts(); }

async function gcAddProduct(productId) {
  const p = gc.products.find(x => x.id === productId);
  if (!p) return;

  if (p._hasOptions) {
    await gcOpenOptions(p);
    return;
  }

  const existing = gc.cart.find(c => c.productId === productId && !c.options?.length);
  if (existing) {
    existing.qty++;
    existing.total = existing.qty * existing.unitPrice;
  } else {
    gc.cart.push({ productId, name: p.name, unitPrice: Number(p.price || 0), qty: 1, total: Number(p.price || 0), options: [] });
  }
  gcRenderCartBar();
  toast(`${p.name} adicionado!`);
}

/* ══════════════════════════════════════════════════════════
   ADICIONAIS — bottom sheet mobile (equivalente funcional do modal de
   opções do Balcão, reescrito para toque em vez de mouse).
══════════════════════════════════════════════════════════ */
async function gcOpenOptions(product) {
  gc.optProduct = product;
  gc.optQty = 1;
  gc.optSelections = {};
  gc.optGroups = [];

  elid('opt-title').textContent = product.name;
  elid('opt-subtitle').textContent = `R$ ${fmt(product.price)}`;
  elid('opt-qty').textContent = '1';

  try {
    const { data: groups } = await getSb().from('product_option_groups').select('*').eq('product_id', product.id).eq('active', true).order('display_order');
    if (!groups?.length) {
      gcAddProductDirect(product);
      return;
    }
    const groupIds = groups.map(g => g.id);
    const { data: items } = await getSb().from('product_option_items').select('*').in('group_id', groupIds).eq('active', true).order('display_order');
    const byGroup = {};
    (items || []).forEach(i => { (byGroup[i.group_id] = byGroup[i.group_id] || []).push(i); });

    gc.optGroups = groups.map(g => ({ ...g, items: byGroup[g.id] || [] }));
    gcRenderOptionsSheet();
    elid('opt-overlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
  } catch (e) {
    console.error('[Garçom] Erro ao carregar adicionais:', e);
    toast('Erro ao carregar adicionais.', true);
  }
}

function gcAddProductDirect(p) {
  gc.cart.push({ productId: p.id, name: p.name, unitPrice: Number(p.price || 0), qty: 1, total: Number(p.price || 0), options: [] });
  gcRenderCartBar();
  toast(`${p.name} adicionado!`);
}

function gcRenderOptionsSheet() {
  const wrap = elid('opt-groups');
  wrap.innerHTML = gc.optGroups.map(g => {
    const sel = gc.optSelections[g.id] || [];
    const max = g.max_select || (g.required && !g.multiple ? 1 : 0);
    const itemsHtml = g.items.map(i => {
      const isSel = sel.includes(i.id);
      const priceLabel = Number(i.price_delta || 0) > 0 ? `+ R$ ${fmt(i.price_delta)}` : (g.free_limit > 0 ? 'Grátis' : '');
      return `<div class="gc-opt-item${isSel ? ' selected' : ''}" onclick="gcToggleOption('${g.id}','${i.id}',${max})">
        <span class="gc-opt-item-label">${esc(i.name)}</span>
        ${priceLabel ? `<span class="gc-opt-item-price">${priceLabel}</span>` : ''}
        <span class="gc-opt-check"><i class="fas fa-check"></i></span>
      </div>`;
    }).join('');
    return `<div class="gc-opt-group">
      <div class="gc-opt-group-title">${esc(g.title)}${g.required ? ' *' : ''}</div>
      ${g.free_limit > 0 ? `<div class="gc-opt-group-hint">${g.free_limit} grátis, demais cobrados</div>` : ''}
      ${itemsHtml}
    </div>`;
  }).join('');
  gcUpdateOptTotal();
}

function gcToggleOption(groupId, itemId, maxSelect) {
  const sel = gc.optSelections[groupId] || (gc.optSelections[groupId] = []);
  const idx = sel.indexOf(itemId);
  if (idx !== -1) {
    sel.splice(idx, 1);
  } else {
    if (maxSelect && sel.length >= maxSelect) sel.shift(); // single-select vira "trocar escolha"
    sel.push(itemId);
  }
  gcRenderOptionsSheet();
}

function gcOptQty(delta) {
  gc.optQty = Math.max(1, gc.optQty + delta);
  elid('opt-qty').textContent = String(gc.optQty);
  gcUpdateOptTotal();
}

function gcUpdateOptTotal() {
  const p = gc.optProduct;
  if (!p) return;
  let extra = 0;
  gc.optGroups.forEach(g => {
    const sel = gc.optSelections[g.id] || [];
    const freeLimit = g.free_limit || 0;
    let freeUsed = 0;
    sel.forEach(itemId => {
      const item = g.items.find(i => i.id === itemId);
      if (!item) return;
      if (freeLimit > 0 && freeUsed < freeLimit) { freeUsed++; return; }
      extra += Number(item.price_delta || 0);
    });
  });
  const unit = Number(p.price || 0) + extra;
  elid('opt-total').textContent = `R$ ${fmt(unit * gc.optQty)}`;
}

function gcConfirmOptions() {
  const p = gc.optProduct;
  if (!p) return;

  const requiredGroups = gc.optGroups.filter(g => g.required);
  for (const g of requiredGroups) {
    if (!(gc.optSelections[g.id] || []).length) {
      toast(`Escolha uma opção em "${g.title}".`, true);
      return;
    }
  }

  const options = [];
  let extra = 0;
  gc.optGroups.forEach(g => {
    const sel = gc.optSelections[g.id] || [];
    if (!sel.length) return;
    const freeLimit = g.free_limit || 0;
    let freeUsed = 0;
    const selectedItems = sel.map(itemId => {
      const item = g.items.find(i => i.id === itemId);
      if (!item) return null;
      let charged = 0;
      if (freeLimit > 0 && freeUsed < freeLimit) { freeUsed++; } else { charged = Number(item.price_delta || 0); extra += charged; }
      return { name: item.name, price_delta: charged };
    }).filter(Boolean);
    options.push({ groupTitle: g.title, items: selectedItems });
  });

  const unitPrice = Number(p.price || 0) + extra;
  gc.cart.push({
    productId: p.id, name: p.name, unitPrice, finalUnitPrice: unitPrice,
    qty: gc.optQty, total: unitPrice * gc.optQty, options,
  });

  gcCloseOptions();
  gcRenderCartBar();
  toast(`${p.name} adicionado!`);
}

function gcCloseOptions() {
  elid('opt-overlay').style.display = 'none';
  document.body.style.overflow = '';
  gc.optProduct = null;
  gc.optGroups = [];
  gc.optSelections = {};
}

function gcCloseOptionsOutside(e) {
  if (e.target === elid('opt-overlay')) gcCloseOptions();
}

/* ══════════════════════════════════════════════════════════
   MESAS — mesmo predicado de "comanda aberta" usado hoje no Balcão
   (pdvIsOpenTableOrder): mesa de balcão, não cancelada, ainda não paga.
   Ocupação é sempre derivada de orders na hora, nunca guardada à parte.
══════════════════════════════════════════════════════════ */
function gcIsPaidOrder(o) {
  const status = String(o.payment_status || '').toLowerCase();
  return ['pago', 'paid', 'confirmado', 'confirmed', 'pagamento_confirmado'].includes(status) || !!o.paid_at;
}

function gcIsOpenTableOrder(o) {
  if (!o.table_number) return false;
  if (o.order_source !== 'balcao' && o.delivery_type !== 'balcao') return false;
  if (o.status === 'cancelado') return false;
  return !gcIsPaidOrder(o);
}

async function gcFetchOccupiedTables() {
  const { data, error } = await getSb().from('orders').select('*')
    .eq('order_source', 'balcao')
    .not('table_number', 'is', null)
    .neq('status', 'cancelado');
  if (error) throw error;
  const occupied = {};
  (data || []).forEach(o => {
    if (!gcIsOpenTableOrder(o)) return;
    occupied[o.table_number] = o;
  });
  return occupied;
}

async function gcRenderMesas() {
  const grid = elid('mesas-grid');
  const loading = elid('mesas-loading');
  if (!grid) return;

  try {
    const occupied = await gcFetchOccupiedTables();
    if (loading) loading.style.display = 'none';
    grid.style.display = 'grid';

    grid.innerHTML = Array.from({ length: TOTAL_MESAS }, (_, i) => {
      const num = i + 1;
      const order = occupied[num];
      const isOccupied = !!order;
      const cls = isOccupied ? 'ocupada' : 'livre';
      const info = isOccupied
        ? `<span class="gc-mesa-info">${esc(order.customer_name || 'Cliente balcão')} · R$ ${fmt(order.total)}</span>`
        : '';
      return `<button type="button" class="gc-mesa-btn ${cls}" onclick="gcSelectMesa(${num})">
        <span class="gc-mesa-num">${num}</span>
        <span class="gc-mesa-status">${isOccupied ? 'Ocupada' : 'Livre'}</span>
        ${info}
      </button>`;
    }).join('');
  } catch (e) {
    console.error('[Garçom] Erro ao carregar mesas:', e);
    if (loading) loading.innerHTML = 'Erro ao carregar mesas. <button type="button" onclick="gcRenderMesas()" style="color:var(--primary);border:none;background:none;font-weight:700">Tentar de novo</button>';
  }
}

async function gcSelectMesa(num) {
  gc.tableNumber = num;
  gc.cart = [];
  gc.catFilter = '';

  // Releitura na hora da seleção — reduz (não elimina; a proteção real é o
  // índice único no banco) a janela de decidir com base numa lista já velha.
  let occupied = {};
  try { occupied = await gcFetchOccupiedTables(); } catch (_) {}
  gc.existingOrder = occupied[num] || null;

  gcRenderTableBanner();
  gcRenderComandaAtual();
  gcShowView('comanda');

  const catalogo = elid('catalogo-block');
  if (gc.existingOrder) {
    if (catalogo) catalogo.style.display = 'none';
  } else {
    if (catalogo) catalogo.style.display = '';
    gcRenderProducts();
  }
  gcRenderCartBar();
}

function gcRenderTableBanner() {
  const numEl = document.querySelector('#table-banner .gc-table-banner-num');
  const statusEl = elid('table-banner-status');
  if (numEl) numEl.textContent = `MESA ${gc.tableNumber}`;
  if (statusEl) statusEl.textContent = gc.existingOrder ? 'Comanda aberta' : 'Mesa livre';
}

function gcRenderComandaAtual() {
  const block = elid('comanda-atual-block');
  if (!block) return;
  if (!gc.existingOrder) { block.style.display = 'none'; return; }

  block.style.display = '';
  const items = Array.isArray(gc.existingOrder.items) ? gc.existingOrder.items : [];
  const itemsEl = elid('comanda-atual-items');
  itemsEl.innerHTML = items.length
    ? items.map(i => {
        const t = i.total || (i.finalUnitPrice || i.unitPrice || 0) * (i.qty || 1) || 0;
        return `<div class="gc-comanda-item-row"><span>${i.qty || 1}x ${esc(i.name)}</span><span>R$ ${fmt(t)}</span></div>`;
      }).join('')
    : '<p class="gc-cart-empty">Nenhum item ainda.</p>';
  elid('comanda-atual-total').textContent = `R$ ${fmt(gc.existingOrder.total)}`;

  const addBtn = elid('btn-adicionar-pedido');
  if (addBtn) addBtn.style.display = '';
}

function gcStartAdding() {
  const catalogo = elid('catalogo-block');
  if (catalogo) catalogo.style.display = '';
  gcRenderProducts();
  const addBtn = elid('btn-adicionar-pedido');
  if (addBtn) addBtn.style.display = 'none';
  document.getElementById('catalogo-block')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function gcTrocarMesa() {
  if (gc.cart.length) {
    gc.pendingSwap = true;
    elid('confirm-swap-overlay').style.display = 'flex';
    return;
  }
  gcGoToMesaGrid();
}

function gcCancelSwap() {
  gc.pendingSwap = false;
  elid('confirm-swap-overlay').style.display = 'none';
}

function gcConfirmSwap() {
  gc.pendingSwap = false;
  elid('confirm-swap-overlay').style.display = 'none';
  gcGoToMesaGrid();
}

function gcGoToMesaGrid() {
  gc.tableNumber = null;
  gc.existingOrder = null;
  gc.cart = [];
  gcShowView('mesas');
  gcRenderMesas();
}

/* ══════════════════════════════════════════════════════════
   CARRINHO (itens novos)
══════════════════════════════════════════════════════════ */
function gcCartTotal() {
  return gc.cart.reduce((s, c) => s + c.total, 0);
}

function gcRenderCartBar() {
  const bar = elid('cart-bar');
  if (!bar) return;
  if (!gc.cart.length) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  const count = gc.cart.reduce((s, c) => s + c.qty, 0);
  elid('cart-bar-summary').textContent = `${count} ${count === 1 ? 'item' : 'itens'} • R$ ${fmt(gcCartTotal())}`;
}

function gcRenderCartItemsInto(containerId, editable) {
  const el = elid(containerId);
  if (!el) return;
  if (!gc.cart.length) { el.innerHTML = '<p class="gc-cart-empty">Nenhum item novo ainda.</p>'; return; }

  el.innerHTML = gc.cart.map((c, i) => {
    const opts = (c.options || []).map(og => `${og.groupTitle}: ${(og.items || []).map(oi => oi.name).join(', ')}`).join(' · ');
    return `<div class="gc-cart-item">
      <div class="gc-cart-item-info">
        <div class="gc-cart-item-name">${c.qty}x ${esc(c.name)}</div>
        ${opts ? `<div class="gc-cart-item-opts">${esc(opts)}</div>` : ''}
        ${editable ? `<div class="gc-cart-item-actions">
          <div class="gc-qty-stepper">
            <button type="button" class="gc-qty-btn" onclick="gcChangeQty(${i},-1)"><i class="fas fa-minus"></i></button>
            <span>${c.qty}</span>
            <button type="button" class="gc-qty-btn" onclick="gcChangeQty(${i},1)"><i class="fas fa-plus"></i></button>
          </div>
          <button type="button" class="gc-cart-item-remove" onclick="gcRemoveItem(${i})"><i class="fas fa-trash"></i> Remover</button>
        </div>` : ''}
      </div>
      <div class="gc-cart-item-price">R$ ${fmt(c.total)}</div>
    </div>`;
  }).join('');
}

function gcChangeQty(index, delta) {
  const item = gc.cart[index];
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  item.total = item.qty * item.unitPrice;
  gcRenderCartItemsInto('cart-items', true);
  gcRenderCartTotals();
  gcRenderCartBar();
}

function gcRemoveItem(index) {
  gc.cart.splice(index, 1);
  gcRenderCartItemsInto('cart-items', true);
  gcRenderCartTotals();
  gcRenderCartBar();
  if (!gc.cart.length) gcShowView('comanda');
}

function gcRenderCartTotals() {
  const totalEl = elid('cart-total');
  if (totalEl) totalEl.textContent = `R$ ${fmt(gcCartTotal())}`;
}

function gcGoToConfirm() {
  if (!gc.cart.length) { toast('Adicione pelo menos um produto.', true); return; }
  elid('confirm-table-label').textContent = `MESA ${gc.tableNumber}`;
  elid('btn-enviar-label').textContent = `Enviar para Mesa ${gc.tableNumber}`;
  gcRenderCartItemsInto('confirm-items', false);
  elid('confirm-total').textContent = `R$ ${fmt(gcCartTotal())}`;
  gcShowView('confirm');
}

/* ══════════════════════════════════════════════════════════
   ENVIO — cria comanda nova OU adiciona à comanda existente, usando
   EXATAMENTE os mesmos campos/regra que o Balcão (pdvSave /
   pdvConfirmAddToTable). O Print Agent detecta e imprime sozinho —
   nenhuma chamada de impressão é feita aqui.
══════════════════════════════════════════════════════════ */
function gcGetCurrentActor() {
  const u = gc.currentUser;
  if (!u) return { id: null, email: null, name: null };
  return { id: u.id, email: u.email, name: u.user_metadata?.name || u.email?.split('@')[0] || null };
}

async function gcLogAudit(action, entityId, entityLabel, metadata) {
  try {
    const { data: { user } } = await getSb().auth.getUser();
    await getSb().from('audit_logs').insert({
      actor_user_id: user?.id || null,
      actor_email: user?.email || null,
      actor_name: user?.user_metadata?.name || user?.email?.split('@')[0] || null,
      action,
      entity_type: 'order',
      entity_id: entityId || null,
      entity_label: entityLabel || null,
      metadata: { ...(metadata || {}), source: 'garcom' },
      source: 'garcom',
      user_agent: navigator.userAgent || null,
    });
  } catch (e) { console.warn('[Garçom] Falha ao registrar auditoria:', e); }
}

async function gcSubmitOrder() {
  if (gc.submitting) return; // trava contra duplo toque
  if (!gc.cart.length) { toast('Adicione pelo menos um produto.', true); return; }
  if (!gc.tableNumber) { toast('Selecione uma mesa.', true); return; }

  gc.submitting = true;
  const btn = elid('btn-enviar-pedido');
  const originalLabel = elid('btn-enviar-label')?.textContent || 'Enviar pedido';
  if (btn) { btn.disabled = true; }
  const labelEl = elid('btn-enviar-label');
  if (labelEl) labelEl.textContent = 'Enviando...';

  const notes = (elid('cart-notes')?.value || '').trim();

  try {
    if (gc.existingOrder) {
      await gcSubmitAddToExisting(notes);
    } else {
      await gcSubmitNewTable(notes);
    }
  } catch (e) {
    console.error('[Garçom] Erro ao enviar pedido:', e);
    toast('Erro ao enviar pedido: ' + (e.message || 'tente novamente.'), true);
  } finally {
    gc.submitting = false;
    if (btn) btn.disabled = false;
    if (labelEl) labelEl.textContent = originalLabel;
  }
}

async function gcSubmitNewTable(notes) {
  const actor = gcGetCurrentActor();
  const subtotal = gcCartTotal();
  const orderNumber = `DL-${Math.floor(Math.random() * 90000) + 10000}`;

  const orderItems = gc.cart.map(c => ({
    name: c.name, qty: c.qty, unitPrice: c.unitPrice,
    finalUnitPrice: c.finalUnitPrice || c.unitPrice, total: c.total, options: c.options || [],
  }));

  const orderData = {
    order_number: orderNumber,
    customer_name: 'Cliente balcão',
    customer_phone: null,
    delivery_type: 'balcao',
    delivery_fee: 0,
    payment_method: 'a_definir',
    payment_status: 'pendente',
    paid_at: null,
    status: 'novo',
    subtotal,
    total: subtotal,
    items: orderItems,
    notes: notes || null,
    order_source: 'balcao',
    table_number: gc.tableNumber,
    customer_address_text: null,
    location: null,
    created_by_user_id: actor.id,
    created_by_email: actor.email,
    handled_by_user_id: actor.id,
    handled_by_email: actor.email,
  };

  const { data, error } = await getSb().from('orders').insert(orderData).select('*').single();

  if (error) {
    /* Índice único orders_one_open_table: outro garçom abriu essa mesa
       entre a seleção e o envio. Mesmo tratamento do Balcão — recarrega a
       comanda existente e avisa, sem tentar contornar a proteção. */
    if (error.code === '23505') {
      toast(`Mesa ${gc.tableNumber} já possui uma comanda aberta.`, true);
      gc.cart = [];
      await gcSelectMesa(gc.tableNumber);
      gcShowView('comanda');
      return;
    }
    throw error;
  }

  await gcLogAudit('create_order', data.id, `#${orderNumber}`, { table: gc.tableNumber, deliveryType: 'balcao', total: subtotal, channel: 'garcom' });

  gcHandleSubmitSuccess();
}

async function gcSubmitAddToExisting(notes) {
  const orderId = gc.existingOrder.id;

  // Releitura fresca imediatamente antes de mesclar — usa o estado mais
  // atual possível dos itens (mesmo padrão de "só anexa" do Balcão).
  const { data: freshOrder, error: fetchErr } = await getSb().from('orders').select('*').eq('id', orderId).single();
  if (fetchErr) throw fetchErr;

  if (!gcIsOpenTableOrder(freshOrder)) {
    toast('Esta mesa não está mais com comanda aberta. Recarregando...', true);
    gc.cart = [];
    await gcSelectMesa(gc.tableNumber);
    return;
  }

  const newItems = gc.cart.map(c => ({
    name: c.name, qty: c.qty, unitPrice: c.unitPrice,
    finalUnitPrice: c.finalUnitPrice || c.unitPrice, total: c.total, options: c.options || [],
  }));

  const existingItems = Array.isArray(freshOrder.items) ? freshOrder.items : [];
  const mergedItems = [...existingItems, ...newItems]; // só anexa — nunca reordena/edita itens antigos
  const subtotal = mergedItems.reduce((s, i) => s + (i.total || 0), 0);
  const discount = Number(freshOrder.discount_amount || 0);
  const courtesy = Number(freshOrder.courtesy_amount || 0);
  const total = Math.max(0, subtotal - discount - courtesy);

  const updatePayload = { items: mergedItems, subtotal, total, updated_at: new Date().toISOString() };
  if (notes) {
    updatePayload.notes = freshOrder.notes ? `${freshOrder.notes}\n${notes}` : notes;
  }

  const { data, error } = await getSb().from('orders').update(updatePayload).eq('id', orderId).select('*').single();
  if (error) throw error;

  gc.existingOrder = data;

  await gcLogAudit('add_table_items', orderId, `#${data.order_number || orderId.slice(-8).toUpperCase()}`, {
    added: newItems.length, table: freshOrder.table_number, channel: 'garcom',
  });

  gcHandleSubmitSuccess();
}

function gcHandleSubmitSuccess() {
  gc.cart = [];
  const notesEl = elid('cart-notes');
  if (notesEl) notesEl.value = '';
  elid('success-table-label').textContent = `Mesa ${gc.tableNumber}`;
  gcShowView('success');
}

async function gcContinueTable() {
  const table = gc.tableNumber;
  gcShowView('comanda');
  await gcSelectMesa(table);
}

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  if (!window.supabaseClient) {
    const errEl = elid('login-error');
    if (errEl) { errEl.textContent = 'Supabase não carregado.'; errEl.style.display = 'block'; }
    return;
  }
  gcInitAuth();
});
