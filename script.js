/* ═══════════════════════════════════════════════════════
   DAY LANCHES — CARDÁPIO DIGITAL
   JavaScript — Lógica completa do protótipo
   ═══════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────
   1. DADOS DO CARDÁPIO (mockados)
   Substitua pelas imagens reais da cliente
────────────────────────────────────────── */
const PRODUCTS = [
  /* ── AÇAÍ ── */
  {
    id: 1, cat: 'acai',
    name: 'Açaí 300ml',
    desc: 'Açaí de 300ml com leite em pó e leite condensado',
    price: 25.00,
    img: 'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?w=400&h=300&fit=crop&q=80',
    badges: [],
  },
  {
    id: 2, cat: 'acai',
    name: 'Açaí 500ml',
    desc: 'Cremoso, geladinho e perfeito para qualquer hora',
    price: 30.00,
    img: 'https://images.unsplash.com/photo-1628557044797-f21a177c37ec?w=400&h=300&fit=crop&q=80',
    badges: ['mais'],
  },
  {
    id: 3, cat: 'combos',
    name: 'Combo Açaí 500ML',
    desc: 'Açaí 500ml + 3 adicionais grátis para você montar',
    price: 35.00,
    img: 'https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?w=400&h=300&fit=crop&q=80',
    badges: ['combo'],
  },
  /* ── ADICIONAIS AÇAÍ (produtos da loja) ── */
  {
    id: 4, cat: 'acai',
    name: 'Freegells',
    desc: 'Extra forte e refrescante para qualquer hora',
    price: 2.50,
    img: null, /* trocar pela foto real */
    fallbackIcon: 'fa-candy-cane',
    fallbackLabel: 'Freegells',
    badges: ['novo'],
  },
  {
    id: 5, cat: 'acai',
    name: 'OREO',
    desc: 'Crocante e irresistível para seu açaí',
    price: 5.00,
    img: null, /* trocar pela foto real */
    fallbackIcon: 'fa-cookie',
    fallbackLabel: 'OREO',
    badges: ['mais'],
  },
  {
    id: 6, cat: 'acai',
    name: 'Paçoquinha',
    desc: 'O sabor tradicional que todo mundo ama',
    price: 1.00,
    img: null, /* trocar pela foto real */
    fallbackIcon: 'fa-square',
    fallbackLabel: 'Paçoquinha',
    badges: [],
  },
  {
    id: 7, cat: 'acai',
    name: 'Pirulito',
    desc: 'Docinho que alegra qualquer momento',
    price: 0.50,
    img: null, /* trocar pela foto real */
    fallbackIcon: 'fa-candy-cane',
    fallbackLabel: 'Pirulito',
    badges: [],
  },
  /* ── HAMBÚRGUER ── */
  {
    id: 8, cat: 'hamburguer',
    name: 'Burguer Duplo',
    desc: 'Dois hamburgers suculentos com queijo derretido',
    price: 20.00,
    img: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop&q=80',
    badges: [],
  },
  /* ── ARTESANAIS ── */
  {
    id: 9, cat: 'artesanais',
    name: 'X-Burger',
    desc: 'Hambúrguer artesanal com queijo, alface e tomate',
    price: 18.00,
    img: 'https://images.unsplash.com/photo-1586190848861-99aa4a171e90?w=400&h=300&fit=crop&q=80',
    badges: ['mais'],
  },
  {
    id: 10, cat: 'artesanais',
    name: 'X-Salada',
    desc: 'Hambúrguer com mix de folhas e molho especial',
    price: 24.00,
    img: 'https://images.unsplash.com/photo-1550317138-10000687a72b?w=400&h=300&fit=crop&q=80',
    badges: [],
  },
  {
    id: 11, cat: 'artesanais',
    name: 'X-Bacon',
    desc: 'Carne artesanal com bacon crocante e cheddar',
    price: 32.00,
    img: 'https://images.unsplash.com/photo-1553979459-d2229ba7433b?w=400&h=300&fit=crop&q=80',
    badges: ['dest'],
  },
  /* ── HOT DOGS ── */
  {
    id: 12, cat: 'hotdog',
    name: 'Hot Dog Simples',
    desc: 'Hot dog clássico com molhos e coberturas especiais',
    price: 20.00,
    img: 'https://images.unsplash.com/photo-1612392166886-ee8475b03af2?w=400&h=300&fit=crop&q=80',
    badges: [],
  },
  {
    id: 13, cat: 'hotdog',
    name: 'Hot Dog Bacon',
    desc: 'Hot dog com bacon crocante e catupiry',
    price: 28.00,
    img: 'https://images.unsplash.com/photo-1612392166886-ee8475b03af2?w=400&h=300&fit=crop&q=80',
    badges: ['novo'],
  },
  /* ── PORÇÕES ── */
  {
    id: 14, cat: 'porcoes',
    name: 'Fritas 500g',
    desc: 'Porção de batata frita crocante e dourada',
    price: 32.00,
    img: 'https://images.unsplash.com/photo-1573080496219-bb080dd4f877?w=400&h=300&fit=crop&q=80',
    badges: ['mais'],
  },
  {
    id: 15, cat: 'porcoes',
    name: 'Fritas Bacon & Cheddar',
    desc: 'Fritas com bacon crocante, cheddar e cebolinha',
    price: 49.00,
    img: 'https://images.unsplash.com/photo-1585109649139-366815a0d713?w=400&h=300&fit=crop&q=80',
    badges: ['dest'],
  },
  /* ── BEBIDAS ── */
  {
    id: 16, cat: 'bebidas',
    name: 'Coca-Cola 2L',
    desc: 'Gelada, perfeita para acompanhar seu pedido',
    price: 16.00,
    img: null, /* trocar pela foto real */
    fallbackIcon: 'fa-bottle-droplet',
    fallbackLabel: 'Coca-Cola',
    badges: [],
  },
];

/* ──────────────────────────────────────────
   2. ESTADO DA APLICAÇÃO
────────────────────────────────────────── */
const state = {
  cart:        [],         /* [{ id, name, price, img, qty }] */
  page:        'catalog',  /* catalog | delivery | payment | confirmation */
  cartOpen:    false,
  cat:         'all',
  search:      '',
  deliveryType: 'delivery',  /* delivery | pickup */
  form: {
    name: '', phone: '', street: '', number: '',
    hood: '', comp: '', notes: ''
  },
  payMethod:   'pix',
  payStatus:   'idle',     /* idle | waiting | confirmed | production */
  couponApplied: false,
  discount:    0,
  orderId:     null,
};

const DELIVERY_FEE = 6.00;
const VALID_COUPONS = { 'DAY10': 10, 'PROMO5': 5 }; /* Cupons válidos (demo) */

/* ──────────────────────────────────────────
   3. NAVEGAÇÃO
────────────────────────────────────────── */
function navigateTo(page) {
  if (ppProductId) closeProductPage();
  if (spOpen) closeSearchPage();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  state.page = page;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (page === 'payment') {
    updatePaymentPage();
    startPixSimulation();
    drawQRCode();
  }
  if (page === 'confirmation') {
    updateConfirmationPage();
  }
}

function goBack() {
  const prev = { delivery: 'catalog', payment: 'delivery', confirmation: 'catalog' };
  navigateTo(prev[state.page] || 'catalog');
}

function setDeliveryType(type) {
  state.deliveryType = type;
  const addrBlock = document.getElementById('address-block');
  if (addrBlock) addrBlock.style.display = type === 'pickup' ? 'none' : 'block';
}

/* ──────────────────────────────────────────
   4. CARRINHO
────────────────────────────────────────── */
function getCartQty(id) {
  const item = state.cart.find(i => i.id === id);
  return item ? item.qty : 0;
}

function addToCart(id) {
  const product = PRODUCTS.find(p => p.id === id);
  if (!product) return;

  const existing = state.cart.find(i => i.id === id);
  if (existing) {
    existing.qty++;
  } else {
    state.cart.push({ ...product, qty: 1 });
  }
  saveCart();
  refreshCartCount();
  refreshProductCard(id);
  renderCartItems();
  showToast(`${product.name} adicionado!`);
}

function changeQty(id, delta) {
  const item = state.cart.find(i => i.id === id);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    state.cart = state.cart.filter(i => i.id !== id);
  }
  saveCart();
  refreshCartCount();
  refreshProductCard(id);
  renderCartItems();
}

function removeFromCart(id) {
  state.cart = state.cart.filter(i => i.id !== id);
  saveCart();
  refreshCartCount();
  refreshProductCard(id);
  renderCartItems();
}

function getSubtotal() {
  return state.cart.reduce((s, i) => s + i.price * i.qty, 0);
}

function getDeliveryFee() {
  return state.deliveryType === 'pickup' ? 0 : DELIVERY_FEE;
}

function getTotal() {
  return Math.max(0, getSubtotal() - state.discount + getDeliveryFee());
}

function saveCart() {
  try { localStorage.setItem('daylanches_cart', JSON.stringify(state.cart)); } catch(e) {}
}
function loadCart() {
  try {
    const saved = localStorage.getItem('daylanches_cart');
    if (saved) state.cart = JSON.parse(saved);
  } catch(e) {}
}

/* ──────────────────────────────────────────
   5. RENDERIZAÇÃO DO CARRINHO
────────────────────────────────────────── */
function openCart()  {
  state.cartOpen = true;
  document.getElementById('cart-overlay').classList.add('open');
  document.getElementById('cart-sidebar').classList.add('open');
  document.body.style.overflow = 'hidden';
  renderCartItems();
}

function closeCart() {
  state.cartOpen = false;
  document.getElementById('cart-overlay').classList.remove('open');
  document.getElementById('cart-sidebar').classList.remove('open');
  document.body.style.overflow = '';
}

function renderCartItems() {
  const list    = document.getElementById('cart-items-list');
  const empty   = document.getElementById('cart-empty');
  const footer  = document.getElementById('cart-ft');

  if (state.cart.length === 0) {
    empty.style.display = 'flex';
    list.innerHTML = '';
    footer.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  footer.style.display = 'block';

  list.innerHTML = state.cart.map(item => `
    <div class="cart-item">
      ${item.img
        ? `<img class="ci-img" src="${item.img}" alt="${item.name}" loading="lazy" onerror="this.style.display='none'">`
        : `<div class="ci-img" style="display:flex;align-items:center;justify-content:center;background:#f3f3f3;border-radius:8px"><i class="fas ${item.fallbackIcon || 'fa-utensils'}" style="color:#aaa;font-size:1.3rem"></i></div>`
      }
      <div class="ci-info">
        <div class="ci-name">${item.name}</div>
        <div class="ci-price">R$ ${fmt(item.price)}</div>
        <div class="ci-controls">
          <button class="ci-btn minus-btn" onclick="changeQty(${item.id}, -1)" aria-label="Diminuir">
            <i class="fas ${item.qty === 1 ? 'fa-trash' : 'fa-minus'}"></i>
          </button>
          <span class="ci-qty">${item.qty}</span>
          <button class="ci-btn" onclick="changeQty(${item.id}, 1)" aria-label="Aumentar">
            <i class="fas fa-plus"></i>
          </button>
        </div>
      </div>
      <div class="ci-total">R$ ${fmt(item.price * item.qty)}</div>
    </div>
  `).join('');

  const sub   = getSubtotal();
  const fee   = getDeliveryFee();
  const total = getTotal();

  document.getElementById('cart-sub').textContent   = `R$ ${fmt(sub)}`;
  document.getElementById('cart-total').textContent = `R$ ${fmt(total)}`;
  const feeTxt = document.getElementById('cart-fee-txt');
  if (feeTxt) feeTxt.textContent = fee > 0 ? `R$ ${fmt(fee)}` : 'Grátis';
}

function refreshCartCount() {
  const total = state.cart.reduce((s, i) => s + i.qty, 0);
  const badge = document.getElementById('cart-count');
  badge.textContent = total;
  badge.style.display = total > 0 ? 'flex' : 'none';
}

/* ──────────────────────────────────────────
   6. RENDERIZAÇÃO DOS PRODUTOS
────────────────────────────────────────── */
function renderProducts() {
  const grid  = document.getElementById('products-grid');
  const empty = document.getElementById('empty-state');
  const title = document.getElementById('section-title');

  const catLabels = {
    all: '⭐ Destaques do cardápio',
    acai: '🍇 Açaí',
    artesanais: '🥩 Artesanais',
    combos: '🎁 Combos',
    porcoes: '🍟 Porções',
    hamburguer: '🍔 Hambúrguer',
    hotdog: '🌭 Hot Dogs',
    bebidas: '🥤 Bebidas',
  };

  const q = state.search.toLowerCase().trim();
  const filtered = PRODUCTS.filter(p => {
    const matchCat    = state.cat === 'all' || p.cat === state.cat;
    const matchSearch = !q || p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q);
    return matchCat && matchSearch;
  });

  if (title) {
    title.innerHTML = q
      ? `<i class="fas fa-search"></i> Resultados para "${state.search}"`
      : `<i class="fas fa-star"></i> ${catLabels[state.cat] || 'Cardápio'}`;
  }

  if (filtered.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = filtered.map(p => buildProductCard(p)).join('');
}

function buildProductCard(p) {
  const qty = getCartQty(p.id);
  const badgeMap = {
    mais:  ['badge-mais',  'Mais pedido'],
    novo:  ['badge-novo',  'Novo'],
    combo: ['badge-combo', '3 adicionais grátis'],
    dest:  ['badge-dest',  'Destaque'],
  };
  const badgeHTML = p.badges.length > 0
    ? `<span class="badge ${badgeMap[p.badges[0]][0]}">${badgeMap[p.badges[0]][1]}</span>`
    : '';

  const imgHTML = p.img
    ? `<img src="${p.img}" alt="${p.name}" loading="lazy" onerror="this.parentNode.innerHTML='<div class=\\"card-img-placeholder\\"><i class=\\"fas ${p.fallbackIcon || 'fa-utensils'}\\"></i><span>Foto em breve</span></div>'">`
    : `<div class="card-img-placeholder"><i class="fas ${p.fallbackIcon || 'fa-utensils'}"></i><span>Foto em breve</span></div>`;

  const ctrlHTML = qty > 0
    ? `<div class="qty-ctrl" id="ctrl-${p.id}" onclick="event.stopPropagation()">
        <button class="qty-btn" onclick="changeQty(${p.id},-1)" aria-label="Diminuir"><i class="fas fa-minus"></i></button>
        <span class="qty-val">${qty}</span>
        <button class="qty-btn" onclick="addToCart(${p.id})" aria-label="Aumentar"><i class="fas fa-plus"></i></button>
      </div>`
    : `<button class="btn-add" id="ctrl-${p.id}" onclick="event.stopPropagation();addToCart(${p.id})">
        <i class="fas fa-plus"></i> Adicionar
      </button>`;

  return `
    <div class="product-card" data-id="${p.id}" onclick="openProductPage(${p.id})">
      <div class="card-img-wrap">
        ${imgHTML}
        ${badgeHTML}
      </div>
      <div class="card-body">
        <h3 class="card-name">${p.name}</h3>
        <p class="card-desc">${p.desc}</p>
        <div class="card-footer">
          <span class="card-price">R$ ${fmt(p.price)}</span>
          ${ctrlHTML}
        </div>
      </div>
    </div>`;
}

function refreshProductCard(id) {
  const card = document.querySelector(`.product-card[data-id="${id}"]`);
  if (!card) return;
  const p   = PRODUCTS.find(p => p.id === id);
  const qty = getCartQty(id);
  const ctrl = card.querySelector(`#ctrl-${id}`);
  if (!ctrl) return;

  if (qty > 0) {
    ctrl.outerHTML = `<div class="qty-ctrl" id="ctrl-${id}" onclick="event.stopPropagation()">
      <button class="qty-btn" onclick="changeQty(${id},-1)" aria-label="Diminuir"><i class="fas fa-minus"></i></button>
      <span class="qty-val">${qty}</span>
      <button class="qty-btn" onclick="addToCart(${id})" aria-label="Aumentar"><i class="fas fa-plus"></i></button>
    </div>`;
  } else {
    ctrl.outerHTML = `<button class="btn-add" id="ctrl-${id}" onclick="event.stopPropagation();addToCart(${id})">
      <i class="fas fa-plus"></i> Adicionar
    </button>`;
  }
}

/* ──────────────────────────────────────────
   7. FILTROS E BUSCA
────────────────────────────────────────── */
function filterCat(cat, btn) {
  state.cat = cat;
  document.querySelectorAll('.cat-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderProducts();
}

function handleSearch(val) {
  state.search = val;
  renderProducts();
}

/* ──────────────────────────────────────────
   8. CHECKOUT — ENTREGA
────────────────────────────────────────── */
function goToCheckout() {
  if (state.cart.length === 0) {
    showToast('Adicione produtos ao carrinho primeiro');
    return;
  }
  closeCart();
  navigateTo('delivery');
}

function goToPayment() {
  const name  = document.getElementById('f-name').value.trim();
  const phone = document.getElementById('f-phone').value.trim();

  let hasError = false;
  if (!name || !phone) hasError = true;

  if (state.deliveryType === 'delivery') {
    const street = document.getElementById('f-street').value.trim();
    const number = document.getElementById('f-number').value.trim();
    if (!street || !number) hasError = true;
  }

  const errBox = document.getElementById('delivery-error');
  if (hasError) {
    errBox.style.display = 'flex';
    errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  errBox.style.display = 'none';

  state.form = {
    name,
    phone,
    street: el('f-street')?.value.trim() || '',
    number: el('f-number')?.value.trim() || '',
    hood:   el('f-hood')?.value.trim() || '',
    comp:   el('f-comp')?.value.trim() || '',
    notes:  el('f-notes')?.value.trim() || '',
  };

  navigateTo('payment');
}

/* ──────────────────────────────────────────
   9. PAGAMENTO
────────────────────────────────────────── */
function selectPayMethod(method) {
  state.payMethod = method;
  clearInterval(state._pixTimer);
  state.payStatus = 'idle';

  /* Remove active style from all */
  document.querySelectorAll('.pay-method').forEach(m => m.classList.remove('active'));
  document.getElementById('pm-' + method)?.classList.add('active');

  /* Show/hide sections */
  el('pix-section').style.display  = method === 'pix'  ? 'block' : 'none';
  el('card-section').style.display = method === 'card' ? 'block' : 'none';
  el('cash-section').style.display = method === 'cash' ? 'block' : 'none';

  if (method === 'card') {
    const tot = el('card-total-txt');
    if (tot) tot.textContent = `R$ ${fmt(getTotal())}`;
  }
  if (method === 'pix') {
    startPixSimulation();
    drawQRCode();
  }
}

function updatePaymentPage() {
  const sub  = getSubtotal();
  const fee  = getDeliveryFee();
  const disc = state.discount;
  const tot  = Math.max(0, sub - disc + fee);

  el('pay-subtotal').textContent = `R$ ${fmt(sub)}`;
  el('pay-fee').textContent      = fee > 0 ? `R$ ${fmt(fee)}` : 'Grátis';
  el('pay-total').textContent    = `R$ ${fmt(tot)}`;

  /* Items preview */
  const count = state.cart.reduce((s, i) => s + i.qty, 0);
  const list  = el('pay-items-list');
  if (list) {
    list.innerHTML = `<p class="pay-items-preview">${count} ite${count !== 1 ? 'ns' : 'm'}</p>`;
  }

  /* Address */
  const f = state.form;
  const addrCard = el('pay-address-card');
  const addrTxt  = el('pay-address-txt');
  if (state.deliveryType === 'pickup') {
    if (addrTxt) addrTxt.textContent = 'Retirada no local — R. Faustino Martini, 160, Luiz Alves - SC';
  } else {
    if (addrTxt) {
      const parts = [f.street, f.number, f.comp, f.hood].filter(Boolean);
      addrTxt.textContent = parts.join(', ') + ' — Luiz Alves, SC';
    }
  }

  /* Phone */
  const phoneTxt = el('pay-phone-txt');
  if (phoneTxt) phoneTxt.textContent = f.phone;
}

function applyCoupon() {
  const code  = el('coupon-input').value.trim().toUpperCase();
  const msgEl = el('coupon-msg');
  const disc  = VALID_COUPONS[code];

  if (disc) {
    state.discount     = disc;
    state.couponApplied = true;
    msgEl.className    = 'coupon-ok';
    msgEl.innerHTML    = `<i class="fas fa-check-circle"></i> Cupom aplicado! Desconto de R$ ${fmt(disc)}`;
    updatePaymentPage();
  } else {
    state.discount     = 0;
    state.couponApplied = false;
    msgEl.className    = 'coupon-err';
    msgEl.innerHTML    = `<i class="fas fa-times-circle"></i> Cupom inválido`;
  }
}

/* ──────────────────────────────────────────
   10. SIMULAÇÃO DE PAGAMENTO PIX
       Para pagamento real: integrar com Mercado Pago,
       Efí/Gerencianet ou similar via webhook backend.
────────────────────────────────────────── */
function startPixSimulation() {
  clearInterval(state._pixTimer);
  resetPixProgress();

  /* Aguardando */
  setPixStep('waiting');

  /* Confirmado após ~5s */
  const t1 = setTimeout(() => setPixStep('confirmed'), 5000);
  /* Em produção após ~9s */
  const t2 = setTimeout(() => setPixStep('production'), 9000);

  state._pixTimers = [t1, t2];
}

function resetPixProgress() {
  const pp1 = el('pp-1'), pp2 = el('pp-2'), pp3 = el('pp-3');
  if (!pp1) return;
  pp1.className = 'pp-step'; pp2.className = 'pp-step'; pp3.className = 'pp-step';
  pp1.querySelector('.pp-icon').innerHTML = '<i class="fas fa-clock"></i>';
  pp2.querySelector('.pp-icon').innerHTML = '<i class="fas fa-check-circle"></i>';
  pp3.querySelector('.pp-icon').innerHTML = '<i class="fas fa-fire"></i>';
}

function setPixStep(step) {
  state.payStatus = step;
  const pp1 = el('pp-1'), pp2 = el('pp-2'), pp3 = el('pp-3');
  if (!pp1) return;

  if (step === 'waiting') {
    pp1.className = 'pp-step pp-waiting';
    pp1.querySelector('.pp-icon').innerHTML = '<i class="fas fa-circle-notch fa-spin"></i>';
  }
  if (step === 'confirmed') {
    pp1.className = 'pp-step pp-confirmed';
    pp1.querySelector('.pp-icon').innerHTML = '<i class="fas fa-check-circle"></i>';
    pp2.className = 'pp-step pp-confirmed';
    pp2.querySelector('.pp-icon').innerHTML = '<i class="fas fa-check-circle"></i>';
  }
  if (step === 'production') {
    pp3.className = 'pp-step pp-production';
    pp3.querySelector('.pp-icon').innerHTML = '<i class="fas fa-fire"></i>';
    /* Auto-redirecionar para confirmação */
    setTimeout(autoConfirm, 1500);
  }
}

function autoConfirm() {
  if (state.page === 'payment') confirmOrder();
}

function copyPix() {
  const code = el('pix-code').textContent;
  navigator.clipboard.writeText(code).catch(() => {});
  const btn = el('btn-copy-pix');
  btn.classList.add('copied');
  btn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
  setTimeout(() => {
    btn.classList.remove('copied');
    btn.innerHTML = '<i class="fas fa-copy"></i> Copiar código';
  }, 2500);
}

function confirmOrder() {
  if (state.cart.length === 0) return;
  state.orderId = Math.floor(Math.random() * 90000) + 10000;
  if (state._pixTimers) state._pixTimers.forEach(clearTimeout);
  navigateTo('confirmation');
}

/* ──────────────────────────────────────────
   11. QR CODE (canvas — demonstração visual)
       Para QR Code real: usar a imagem retornada
       pelo gateway de pagamento (Mercado Pago etc.)
────────────────────────────────────────── */
function drawQRCode() {
  const canvas = el('qr-canvas');
  if (!canvas) return;
  const ctx  = canvas.getContext('2d');
  const size = canvas.width;
  const MOD  = 29;
  const CELL = Math.floor(size / MOD);

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';

  /* Finder patterns nos 3 cantos */
  drawFinder(ctx, 0, 0, CELL);
  drawFinder(ctx, (MOD - 7) * CELL, 0, CELL);
  drawFinder(ctx, 0, (MOD - 7) * CELL, CELL);

  /* Timing patterns */
  for (let i = 8; i < MOD - 8; i++) {
    if (i % 2 === 0) {
      ctx.fillRect(i * CELL, 6 * CELL, CELL, CELL);
      ctx.fillRect(6 * CELL, i * CELL, CELL, CELL);
    }
  }

  /* Alignment pattern */
  const ap = Math.floor(MOD / 2);
  drawAlign(ctx, ap * CELL, ap * CELL, CELL);

  /* Módulos de dados (pseudo-aleatório determinístico) */
  let r = 0xDEADBEEF;
  const rng = () => { r ^= r << 13; r ^= r >> 17; r ^= r << 5; return (r >>> 0) / 0x100000000; };

  for (let row = 0; row < MOD; row++) {
    for (let col = 0; col < MOD; col++) {
      if (isReserved(row, col, MOD, ap)) continue;
      if (rng() > 0.48) {
        ctx.fillStyle = '#000';
        ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
      }
    }
  }
}

function drawFinder(ctx, x, y, c) {
  ctx.fillStyle = '#000'; ctx.fillRect(x, y, 7*c, 7*c);
  ctx.fillStyle = '#fff'; ctx.fillRect(x+c, y+c, 5*c, 5*c);
  ctx.fillStyle = '#000'; ctx.fillRect(x+2*c, y+2*c, 3*c, 3*c);
}

function drawAlign(ctx, x, y, c) {
  ctx.fillStyle = '#000'; ctx.fillRect(x-2*c, y-2*c, 5*c, 5*c);
  ctx.fillStyle = '#fff'; ctx.fillRect(x-c, y-c, 3*c, 3*c);
  ctx.fillStyle = '#000'; ctx.fillRect(x, y, c, c);
}

function isReserved(r, c, MOD, ap) {
  if (r < 9 && c < 9) return true;
  if (r < 9 && c >= MOD-8) return true;
  if (r >= MOD-8 && c < 9) return true;
  if (r === 6 || c === 6) return true;
  if (Math.abs(r - ap) <= 2 && Math.abs(c - ap) <= 2) return true;
  return false;
}

/* ──────────────────────────────────────────
   12. CONFIRMAÇÃO
────────────────────────────────────────── */
function updateConfirmationPage() {
  el('confirm-num').textContent = `#${state.orderId}`;

  const items = el('confirm-items-list');
  const total = getTotal();
  if (items) {
    items.innerHTML = state.cart.map(i =>
      `<div class="summary-line"><span>${i.qty}x ${i.name}</span><span>R$ ${fmt(i.price * i.qty)}</span></div>`
    ).join('') + `<div class="summary-line"><span>Taxa de entrega</span><span>${getDeliveryFee() > 0 ? 'R$ ' + fmt(getDeliveryFee()) : 'Grátis'}</span></div>`;
  }
  el('confirm-total-val').textContent = `R$ ${fmt(total)}`;
}

/* ──────────────────────────────────────────
   13. WHATSAPP
────────────────────────────────────────── */
function sendWhatsApp() {
  const f     = state.form;
  const items = state.cart.map(i => `• ${i.qty}x ${i.name} — R$ ${fmt(i.price * i.qty)}`).join('\n');
  const payLabels = { pix: 'PIX ✅', card: 'Cartão 💳', cash: 'Dinheiro 💵' };
  const addr = state.deliveryType === 'pickup'
    ? 'Retirada no local'
    : `${f.street}, ${f.number}${f.comp ? ` (${f.comp})` : ''}${f.hood ? `, ${f.hood}` : ''} — Luiz Alves, SC`;

  const msg = encodeURIComponent(
    `🍔 *Pedido Day Lanches* 🍔\n` +
    `*Pedido nº ${state.orderId}*\n\n` +
    `*Itens:*\n${items}\n\n` +
    `*Subtotal:* R$ ${fmt(getSubtotal())}\n` +
    `*Taxa de entrega:* ${getDeliveryFee() > 0 ? 'R$ ' + fmt(getDeliveryFee()) : 'Grátis'}\n` +
    `*Total:* R$ ${fmt(getTotal())}\n\n` +
    `*Pagamento:* ${payLabels[state.payMethod] || state.payMethod}\n\n` +
    `*Endereço:*\n${f.name}\n${addr}\n📱 ${f.phone}` +
    (f.notes ? `\n\n*Observações:* ${f.notes}` : '')
  );

  window.open(`https://wa.me/5547991559926?text=${msg}`, '_blank');
}

/* ──────────────────────────────────────────
   PÁGINA DE DETALHES DO PRODUTO
────────────────────────────────────────── */
let ppProductId = null;
let ppQty = 1;

const PP_CAT_LABELS = {
  acai: '🍇 Açaí', artesanais: '🥩 Artesanais',
  combos: '🎁 Combos', porcoes: '🍟 Porções',
  hamburguer: '🍔 Hambúrguer', hotdog: '🌭 Hot Dogs',
  bebidas: '🥤 Bebidas',
};

function openProductPage(id) {
  const p = PRODUCTS.find(p => p.id === id);
  if (!p) return;
  ppProductId = id;
  ppQty = 1;

  /* Imagem */
  const hero = el('pp-hero');
  const existingMedia = hero.querySelector('.pp-hero-img, .pp-hero-placeholder');
  if (existingMedia) existingMedia.remove();

  if (p.img) {
    const img = document.createElement('img');
    img.className = 'pp-hero-img';
    img.src = p.img;
    img.alt = p.name;
    hero.insertBefore(img, hero.firstChild);
  } else {
    const ph = document.createElement('div');
    ph.className = 'pp-hero-placeholder';
    ph.innerHTML = `<i class="fas ${p.fallbackIcon || 'fa-utensils'}"></i>`;
    hero.insertBefore(ph, hero.firstChild);
  }

  /* Badge */
  const badgeMap = { mais: ['badge-mais','Mais pedido'], novo: ['badge-novo','Novo'], combo: ['badge-combo','3 adicionais grátis'], dest: ['badge-dest','Destaque'] };
  const slot = el('pp-badge-slot');
  if (slot) slot.innerHTML = p.badges.length ? `<span class="badge ${badgeMap[p.badges[0]][0]}">${badgeMap[p.badges[0]][1]}</span>` : '';

  /* Textos */
  el('pp-name').textContent  = p.name;
  el('pp-price').textContent = `R$ ${fmt(p.price)}`;
  el('pp-desc').textContent  = p.desc;
  el('pp-cat-tag').textContent = PP_CAT_LABELS[p.cat] || p.cat;
  el('pp-qty-val').textContent = ppQty;

  /* Obs */
  const obs = el('pp-obs');
  if (obs) obs.value = '';

  const page = el('product-page');
  if (page) { page.classList.add('open'); document.body.style.overflow = 'hidden'; }
}

function closeProductPage() {
  const page = el('product-page');
  if (page) page.classList.remove('open');
  if (!state.cartOpen && !spOpen) document.body.style.overflow = '';
  ppProductId = null;
}

function ppChangeQty(delta) {
  ppQty = Math.max(1, ppQty + delta);
  el('pp-qty-val').textContent = ppQty;
}

function ppAddToCart() {
  if (!ppProductId) return;
  const p = PRODUCTS.find(p => p.id === ppProductId);
  if (!p) return;

  const existing = state.cart.find(c => c.id === ppProductId);
  if (existing) {
    existing.qty += ppQty;
  } else {
    state.cart.push({ ...p, qty: ppQty });
  }

  saveCart();
  refreshCartCount();
  refreshProductCard(ppProductId);
  renderCartItems();

  const obs = el('pp-obs')?.value.trim();
  showToast(obs ? `${p.name} adicionado! (${obs})` : `${p.name} adicionado!`);
  closeProductPage();
}

/* ──────────────────────────────────────────
   TELA DE PESQUISA
────────────────────────────────────────── */
const SP_SUGGEST_IDS = [8, 2, 15, 16]; /* Burguer Duplo, Açaí 500ml, Fritas Bacon, Coca-Cola */

let spOpen = false;

function openSearchPage() {
  const page = el('search-page');
  if (!page) return;
  page.classList.add('open');
  spOpen = true;
  document.body.style.overflow = 'hidden';
  renderSpHistory();
  renderSpSuggestions();
  setTimeout(() => { el('sp-input')?.focus(); }, 320);
}

function closeSearchPage() {
  const page = el('search-page');
  if (!page) return;
  page.classList.remove('open');
  spOpen = false;
  if (!state.cartOpen) document.body.style.overflow = '';
  /* Limpa estado interno */
  const inp = el('sp-input');
  if (inp) inp.value = '';
  el('sp-body').style.display    = '';
  el('sp-results').style.display = 'none';
  el('sp-clear-btn').style.display = 'none';
}

function handleSearchPage(val) {
  el('sp-clear-btn').style.display = val ? 'flex' : 'none';
  if (val.trim()) {
    el('sp-body').style.display    = 'none';
    el('sp-results').style.display = '';
    renderSpResults(val.trim());
  } else {
    el('sp-body').style.display    = '';
    el('sp-results').style.display = 'none';
  }
}

function handleSearchPageKey(e) {
  if (e.key === 'Enter') {
    const val = el('sp-input')?.value.trim();
    if (val) saveSpHistory(val);
  }
}

function clearSpInput() {
  const inp = el('sp-input');
  if (inp) { inp.value = ''; inp.focus(); }
  handleSearchPage('');
}

/* ── Histórico ── */
function getSpHistory() {
  try { return JSON.parse(localStorage.getItem('dl_search_hist') || '[]'); } catch(e) { return []; }
}

function saveSpHistory(term) {
  if (!term) return;
  let h = getSpHistory().filter(t => t.toLowerCase() !== term.toLowerCase());
  h.unshift(term);
  if (h.length > 5) h = h.slice(0, 5);
  try { localStorage.setItem('dl_search_hist', JSON.stringify(h)); } catch(e) {}
  renderSpHistory();
}

function clearSearchHistory() {
  try { localStorage.removeItem('dl_search_hist'); } catch(e) {}
  renderSpHistory();
}

function removeSpHistItem(term) {
  const h = getSpHistory().filter(t => t !== term);
  try { localStorage.setItem('dl_search_hist', JSON.stringify(h)); } catch(e) {}
  renderSpHistory();
}

function applySpHistory(term) {
  const inp = el('sp-input');
  if (inp) { inp.value = term; inp.focus(); }
  handleSearchPage(term);
}

function renderSpHistory() {
  const sec  = el('sp-history-section');
  const list = el('sp-history-list');
  if (!sec || !list) return;
  const h = getSpHistory();
  if (!h.length) { sec.style.display = 'none'; return; }
  sec.style.display = 'block';
  list.innerHTML = h.map(term => `
    <div class="sp-history-item" onclick="applySpHistory('${term.replace(/'/g,"\\'")}')">
      <i class="fas fa-clock sp-hist-ico"></i>
      <span class="sp-hist-term">${term}</span>
      <button class="sp-hist-remove" onclick="event.stopPropagation();removeSpHistItem('${term.replace(/'/g,"\\'")}')">
        <i class="fas fa-times"></i>
      </button>
    </div>`).join('');
}

/* ── Sugestões ── */
function renderSpSuggestions() {
  const grid = el('sp-suggest-grid');
  if (!grid) return;
  const items = SP_SUGGEST_IDS.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);
  grid.innerHTML = items.map(p => {
    const imgH = p.img
      ? `<img class="sp-suggest-img" src="${p.img}" alt="${p.name}" loading="lazy">`
      : `<div class="sp-suggest-placeholder"><i class="fas ${p.fallbackIcon||'fa-utensils'}"></i></div>`;
    return `
      <div class="sp-suggest-card" onclick="spSelectProduct(${p.id})">
        ${imgH}
        <div class="sp-suggest-info">
          <div class="sp-suggest-name">${p.name}</div>
          <div class="sp-suggest-price">R$ ${fmt(p.price)}</div>
        </div>
      </div>`;
  }).join('');
}

/* ── Resultados ── */
function renderSpResults(q) {
  const list  = el('sp-results-list');
  const noRes = el('sp-no-results');
  if (!list || !noRes) return;
  const ql = q.toLowerCase();
  const filtered = PRODUCTS.filter(p =>
    p.name.toLowerCase().includes(ql) || p.desc.toLowerCase().includes(ql)
  );
  if (!filtered.length) {
    list.innerHTML = '';
    noRes.style.display = 'block';
    return;
  }
  noRes.style.display = 'none';
  list.innerHTML = filtered.map(p => {
    const imgH = p.img
      ? `<img class="sp-result-img" src="${p.img}" alt="${p.name}" loading="lazy">`
      : `<div class="sp-result-placeholder"><i class="fas ${p.fallbackIcon||'fa-utensils'}"></i></div>`;
    const safeN = p.name.replace(/'/g, "\\'");
    return `
      <div class="sp-result-item" onclick="spSelectProduct(${p.id})">
        ${imgH}
        <div class="sp-result-info">
          <div class="sp-result-name">${p.name}</div>
          <div class="sp-result-desc">${p.desc}</div>
          <div class="sp-result-price">R$ ${fmt(p.price)}</div>
        </div>
        <button class="sp-result-add" onclick="event.stopPropagation();addToCart(${p.id});showToast('${safeN} adicionado!')">
          <i class="fas fa-plus"></i> Add
        </button>
      </div>`;
  }).join('');
}

/* ── Ações ── */
function searchGoCategory(cat) {
  closeSearchPage();
  setTimeout(() => {
    state.cat    = cat;
    state.search = '';
    document.querySelectorAll('.cat-chip').forEach(c =>
      c.classList.toggle('active', !!c.getAttribute('onclick')?.includes(`'${cat}'`))
    );
    const sinp = el('search-input');
    if (sinp) sinp.value = '';
    renderProducts();
    setTimeout(() => el('products-grid')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
  }, 320);
}

function spSelectProduct(id) {
  const term = el('sp-input')?.value.trim();
  if (term) saveSpHistory(term);
  closeSearchPage();
  setTimeout(() => {
    const p = PRODUCTS.find(p => p.id === id);
    scrollToCategory(p ? p.cat : 'all', id);
  }, 320);
}

/* ──────────────────────────────────────────
   CARROSSEL DE DESTAQUES
────────────────────────────────────────── */
const CAROUSEL_IDS = [2, 3, 8, 11, 15, 16];

const CAROUSEL_BADGE_MAP = {
  2:  { badge: 'mais',  label: 'Mais pedido' },
  3:  { badge: 'combo', label: '3 adicionais grátis' },
  8:  { badge: 'promo', label: 'Promoção' },
  11: { badge: 'dest',  label: 'Destaque' },
  15: { badge: 'dest',  label: 'Destaque' },
  16: { badge: 'novo',  label: 'Novo' },
};

const CAROUSEL_CAT_MAP = {
  2:  'acai',
  3:  'acai',
  8:  'hamburguer',
  11: 'artesanais',
  15: 'porcoes',
  16: 'bebidas',
};

const carousel = {
  index:    0,
  total:    CAROUSEL_IDS.length,
  timer:    null,
  dragging: false,
  startX:   0,
};

function initCarousel() {
  const track  = el('carousel-track');
  const dotsEl = el('carousel-dots');
  if (!track || !dotsEl) {
    setTimeout(initCarousel, 200);
    return;
  }

  const slides = CAROUSEL_IDS.map(id => {
    const p    = PRODUCTS.find(p => p.id === id);
    const meta = CAROUSEL_BADGE_MAP[id] || {};
    if (!p) return null;
    return { ...p, cBadge: meta.badge || 'novo', cLabel: meta.label || '' };
  }).filter(Boolean);

  carousel.total   = slides.length;
  track.innerHTML  = slides.map(p => buildCarouselSlide(p)).join('');
  dotsEl.innerHTML = slides.map((_, i) =>
    `<button class="carousel-dot${i === 0 ? ' active' : ''}" onclick="goToSlide(${i})" aria-label="Slide ${i + 1}"></button>`
  ).join('');

  setupCarouselTouch();
  carousel.timer = setInterval(autoNextSlide, 3500);
}

function buildCarouselSlide(p) {
  const cat     = CAROUSEL_CAT_MAP[p.id] || 'all';
  const imgHTML = p.img
    ? `<img class="slide-banner-img" src="${p.img}" alt="${p.name}" loading="eager">`
    : `<div class="slide-banner-placeholder"><i class="fas ${p.fallbackIcon || 'fa-utensils'}"></i></div>`;

  return `
    <div class="carousel-slide" onclick="scrollToCategory('${cat}', ${p.id})" role="button" tabindex="0" aria-label="${p.name}">
      <div class="slide-banner">
        ${imgHTML}
        <div class="slide-banner-overlay"></div>
        <div class="slide-banner-content">
          <span class="slide-badge slide-badge-${p.cBadge}">${p.cLabel}</span>
          <h2 class="slide-name">${p.name}</h2>
          <div class="slide-price">R$ ${fmt(p.price)}</div>
          <p class="slide-desc">${p.desc}</p>
        </div>
      </div>
    </div>`;
}

function goToSlide(index) {
  const track = el('carousel-track');
  const dots  = document.querySelectorAll('.carousel-dot');
  if (!track) return;
  carousel.index = ((index % carousel.total) + carousel.total) % carousel.total;
  track.style.transform = `translateX(-${carousel.index * 100}%)`;
  dots.forEach((d, i) => d.classList.toggle('active', i === carousel.index));
}

function nextSlide() {
  clearInterval(carousel.timer);
  goToSlide(carousel.index + 1);
  carousel.timer = setInterval(autoNextSlide, 3500);
}

function prevSlide() {
  clearInterval(carousel.timer);
  goToSlide(carousel.index - 1);
  carousel.timer = setInterval(autoNextSlide, 3500);
}

function autoNextSlide() {
  goToSlide(carousel.index + 1);
}

function setupCarouselTouch() {
  const wrap = el('carousel-track-wrap');
  if (!wrap) return;

  /* Touch (mobile) */
  wrap.addEventListener('touchstart', e => {
    carousel.startX   = e.touches[0].clientX;
    carousel.dragging = true;
  }, { passive: true });

  wrap.addEventListener('touchend', e => {
    if (!carousel.dragging) return;
    const diff = carousel.startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) { diff > 0 ? nextSlide() : prevSlide(); }
    carousel.dragging = false;
  }, { passive: true });

  /* Mouse drag (desktop) */
  wrap.addEventListener('mousedown', e => {
    carousel.startX   = e.clientX;
    carousel.dragging = true;
    e.preventDefault();
  });
  wrap.addEventListener('mouseup', e => {
    if (!carousel.dragging) return;
    const diff = carousel.startX - e.clientX;
    if (Math.abs(diff) > 40) { diff > 0 ? nextSlide() : prevSlide(); }
    carousel.dragging = false;
  });
  wrap.addEventListener('mouseleave', () => { carousel.dragging = false; });
}

function scrollToCategory(cat, productId) {
  state.cat    = cat;
  state.search = '';

  document.querySelectorAll('.cat-chip').forEach(chip => {
    const matches = chip.getAttribute('onclick')?.includes(`'${cat}'`);
    chip.classList.toggle('active', !!matches);
  });

  const searchEl = el('search-input');
  if (searchEl) searchEl.value = '';

  renderProducts();

  setTimeout(() => {
    const card   = document.querySelector(`.product-card[data-id="${productId}"]`);
    const target = card || el('products-grid');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (card) {
        card.style.outline = '3px solid var(--primary)';
        setTimeout(() => { card.style.outline = ''; }, 1800);
      }
    }
  }, 120);
}

/* ──────────────────────────────────────────
   14. TOAST
────────────────────────────────────────── */
let toastTimer;
function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ──────────────────────────────────────────
   15. UTILIDADES
────────────────────────────────────────── */
function fmt(n) {
  return Number(n).toFixed(2).replace('.', ',');
}
function el(id) {
  return document.getElementById(id);
}
function toggleMenu() {
  showToast('Menu em breve!');
}

/* ──────────────────────────────────────────
   16. INICIALIZAÇÃO
────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadCart();
  refreshCartCount();
  renderProducts();
  initCarousel();

  /* Pre-fill form with demo data para facilitar a demonstração */
  setTimeout(() => {
    const fn = el('f-name');  if (fn && !fn.value) fn.value = 'Maria da Silva';
    const fp = el('f-phone'); if (fp && !fp.value) fp.value = '(47) 99155-9926';
    const fs = el('f-street');if (fs && !fs.value) fs.value = 'R. Faustino Martini';
    const fn2= el('f-number');if (fn2 && !fn2.value) fn2.value = '160';
    const fh = el('f-hood');  if (fh && !fh.value)  fh.value = 'Rio do Peixe';
  }, 200);

  /* Inicializa seção de pagamento PIX visível */
  const pixSec  = el('pix-section');
  const cardSec = el('card-section');
  const cashSec = el('cash-section');
  if (pixSec)  pixSec.style.display  = 'block';
  if (cardSec) cardSec.style.display = 'none';
  if (cashSec) cashSec.style.display = 'none';

  /* Keyboard: ESC fecha detalhes, pesquisa ou carrinho */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (ppProductId)         closeProductPage();
      else if (spOpen)         closeSearchPage();
      else if (state.cartOpen) closeCart();
    }
  });

  console.log('%c🍔 Day Lanches — Cardápio Digital', 'color:#FF6B00;font-size:16px;font-weight:bold;');
  console.log('%cProtótipo demonstrativo • Desenvolvido para apresentação comercial', 'color:#888');
});
