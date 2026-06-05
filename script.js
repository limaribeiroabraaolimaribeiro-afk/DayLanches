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
    img: 'https://images.pexels.com/photos/25539500/pexels-photo-25539500.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    badges: [],
  },
  {
    id: 2, cat: 'acai',
    name: 'Açaí 500ml',
    desc: 'Cremoso, geladinho e perfeito para qualquer hora',
    price: 30.00,
    img: 'https://images.pexels.com/photos/11094181/pexels-photo-11094181.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    badges: ['mais'],
  },
  {
    id: 3, cat: 'combos',
    name: 'Combo Açaí 500ML',
    desc: 'Açaí 500ml + 3 adicionais grátis para você montar',
    price: 35.00,
    img: 'https://images.pexels.com/photos/25539500/pexels-photo-25539500.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    badges: ['combo'],
  },
  /* ── ADICIONAIS AÇAÍ (produtos da loja) ── */
  {
    id: 4, cat: 'acai',
    name: 'Freegells',
    desc: 'Extra forte e refrescante para qualquer hora',
    price: 2.50,
    img: 'https://th.bing.com/th/id/R.ddc6e43a970855f00f18a6b2af203e45?rik=URB9V9GioZGblQ&pid=ImgRaw&r=0',
    fallbackIcon: 'fa-candy-cane',
    fallbackLabel: 'Freegells',
    badges: ['novo'],
  },
  {
    id: 5, cat: 'acai',
    name: 'OREO',
    desc: 'Crocante e irresistível para seu açaí',
    price: 5.00,
    img: 'https://i.mlcdn.com.br/portaldalu/fotosconteudo/91770_01.jpg',
    fallbackIcon: 'fa-cookie',
    fallbackLabel: 'OREO',
    badges: ['mais'],
  },
  {
    id: 6, cat: 'acai',
    name: 'Paçoquinha',
    desc: 'O sabor tradicional que todo mundo ama',
    price: 1.00,
    img: 'https://images.pexels.com/photos/5865653/pexels-photo-5865653.jpeg?auto=compress&cs=tinysrgb&w=800',
    fallbackIcon: 'fa-square',
    fallbackLabel: 'Paçoquinha',
    badges: [],
  },
  {
    id: 7, cat: 'acai',
    name: 'Pirulito',
    desc: 'Docinho que alegra qualquer momento',
    price: 0.50,
    img: 'https://images.pexels.com/photos/9743246/pexels-photo-9743246.jpeg?auto=compress&cs=tinysrgb&w=800',
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
    img: 'https://images.pexels.com/photos/8162589/pexels-photo-8162589.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    badges: [],
  },
  /* ── ARTESANAIS ── */
  {
    id: 9, cat: 'artesanais',
    name: 'X-Burger',
    desc: 'Hambúrguer artesanal com queijo, alface e tomate',
    price: 18.00,
    img: 'https://images.pexels.com/photos/4628466/pexels-photo-4628466.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    badges: ['mais'],
  },
  {
    id: 10, cat: 'artesanais',
    name: 'X-Salada',
    desc: 'Hambúrguer com mix de folhas e molho especial',
    price: 24.00,
    img: 'https://images.pexels.com/photos/4628466/pexels-photo-4628466.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    badges: [],
  },
  {
    id: 11, cat: 'artesanais',
    name: 'X-Bacon',
    desc: 'Carne artesanal com bacon crocante e cheddar',
    price: 32.00,
    img: 'https://images.pexels.com/photos/6088519/pexels-photo-6088519.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    badges: ['dest'],
  },
  /* ── HOT DOGS ── */
  {
    id: 12, cat: 'hotdog',
    name: 'Hot Dog Simples',
    desc: 'Cachorro-quente tradicional, completo e saboroso',
    price: 20.00,
    img: 'https://www.comidaereceitas.com.br/wp-content/uploads/2019/06/Cachorro-quente-completo-freepik-780x520.jpg',
    badges: [],
  },
  {
    id: 13, cat: 'hotdog',
    name: 'Hot Dog Bacon',
    desc: 'Hot dog caprichado com bacon crocante e molho especial',
    price: 28.00,
    img: 'https://receitasbr.com.br/wp-content/uploads/2023/06/cachorro-quente-com-bacon.jpg',
    badges: ['novo'],
  },
  {
    id: 34, cat: 'hotdog',
    name: 'Hot Dog Calabresa',
    desc: 'Hot dog com calabresa acebolada e muito sabor',
    price: 28.00,
    img: 'https://s2.glbimg.com/1xoFGeFPFrMqqeE2yufX5EFSe0c=/1200x/smart/filters:cover():strip_icc()/i.s3.glbimg.com/v1/AUTH_1f540e0b94d8437dbbc39d567a1dee68/internal_photos/bs/2021/7/w/YNR7wZQEGsRUDdJ9OvhQ/cachorro-quente-de-calabresa-acebolada.jpg',
    badges: [],
  },
  {
    id: 35, cat: 'hotdog',
    name: 'Hot Dog Duplo',
    desc: 'Dois sabores em um lanche reforçado e bem recheado',
    price: 22.00,
    img: 'https://img.magnific.com/fotos-premium/cachorro-quente-com-salsicha-grande-recheada-com-maionese-derretida-e-uma-pitada-de-verduras-picadas_358001-22843.jpg',
    badges: [],
  },
  {
    id: 36, cat: 'hotdog',
    name: 'Hot Dog Frango',
    desc: 'Hot dog com frango cremoso, molhos e acompanhamentos',
    price: 29.00,
    img: 'https://imagens.imirante.com.br/imagens/noticias/2023/12/26/VMWgzaAS96O9BGbuCr5dqJ8jPsYzhk3wLMBkmPaN.png?w=896&h=448&crop=538%2C+269%2C+0%2C+39.5&fit=crop&s=9db2068290bfcbb5652c1b84952f901d',
    badges: [],
  },
  /* ── PORÇÕES ── */
  {
    id: 14, cat: 'porcoes',
    name: 'Fritas 500g',
    desc: 'Porção de batata frita crocante e dourada',
    price: 32.00,
    img: 'https://images.pexels.com/photos/36570988/pexels-photo-36570988.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    badges: ['mais'],
  },
  {
    id: 15, cat: 'porcoes',
    name: 'Fritas Bacon & Cheddar',
    desc: 'Fritas com bacon crocante, cheddar e cebolinha',
    price: 49.00,
    img: 'https://images.pexels.com/photos/37121076/pexels-photo-37121076.jpeg?auto=compress&cs=tinysrgb&w=400&h=300&fit=crop',
    badges: ['dest'],
  },
  /* ── BEBIDAS ── */
  {
    id: 16, cat: 'bebidas',
    name: 'Coca-Cola 2 Litros',
    desc: 'Gelada, perfeita para acompanhar seu pedido',
    price: 16.00,
    img: 'https://andinacocacola.vtexassets.com/arquivos/ids/158758-800-auto?aspect=true&height=auto&v=639156020671730000&width=800',
    badges: [],
  },
  {
    id: 17, cat: 'bebidas',
    name: 'Água',
    desc: 'Água mineral gelada, perfeita para qualquer momento',
    price: 3.00,
    img: 'https://aguamineralhydrate.com.br/wp-content/uploads/2016/02/Garrafa-Agua-Mineral-500-ml-pacote-12-unidades.jpg',
    badges: [],
  },
  {
    id: 18, cat: 'bebidas',
    name: 'Caipirinha',
    desc: 'Caipirinha artesanal gelada e refrescante',
    price: 20.00,
    img: 'https://cdn.thefreshmancook.com/wp-content/uploads/2024/04/Caipirinha-Recipe-2-1024x1024.jpg',
    badges: [],
  },
  {
    id: 19, cat: 'bebidas',
    name: 'Caixa de Brahma',
    desc: 'Caixa com cervejas Brahma geladas',
    price: 60.00,
    img: 'https://choppbrahmaexpress.vtexassets.com/arquivos/ids/158114-800-auto?v=638410151046000000&width=800&height=auto&aspect=true',
    badges: [],
  },
  {
    id: 20, cat: 'bebidas',
    name: 'Caixa de Kaiser',
    desc: 'Caixa com cervejas Kaiser geladas',
    price: 50.00,
    img: 'https://2.bp.blogspot.com/-3jCrEZl2hjA/V_fDGDiIrQI/AAAAAAABjOg/jMpPn9PaDscn31Do1quhmNGclWpZdGQVACLcB/s1600/kaiser%2B6.jpg',
    badges: [],
  },
  {
    id: 21, cat: 'bebidas',
    name: 'Caixa de Skol',
    desc: 'Caixa com cervejas Skol geladas',
    price: 60.00,
    img: 'https://http2.mlstatic.com/D_NQ_NP_2X_909577-MLB45554443155_042021-F.jpg',
    badges: [],
  },
  {
    id: 22, cat: 'bebidas',
    name: 'Coca-Cola 600ml',
    desc: 'Coca-Cola garrafa 600ml gelada',
    price: 9.00,
    img: 'https://tse3.mm.bing.net/th/id/OIP.AvYbB6jhJxGC_SCus4CpwwHaHa?w=2847&h=2847&rs=1&pid=ImgDetMain&o=7&rm=3',
    badges: [],
  },
  {
    id: 23, cat: 'bebidas',
    name: 'Coca-Cola Lata',
    desc: 'Coca-Cola lata 350ml gelada',
    price: 6.00,
    img: 'https://static.vecteezy.com/system/resources/previews/047/280/244/non_2x/a-can-of-coca-cola-on-a-white-background-free-photo.jpg',
    badges: [],
  },
  {
    id: 24, cat: 'bebidas',
    name: 'Copão',
    desc: 'Whisky, gin, vodka e muitos outros drinks',
    price: 25.00,
    img: 'images/copao.jpg',
    badges: [],
  },
  {
    id: 25, cat: 'bebidas',
    name: 'Del Valle',
    desc: 'Suco Del Valle gelado, vários sabores',
    price: 7.00,
    img: 'https://andinacocacola.vtexassets.com/arquivos/ids/158622-800-auto?aspect=true&height=auto&v=639094449084230000&width=800',
    badges: [],
  },
  {
    id: 26, cat: 'bebidas',
    name: 'Guaraná',
    desc: 'Guaraná Antarctica gelado e refrescante',
    price: 6.00,
    img: 'https://drogariacristina.com.br/BACKOFFICE/Uploads/Produto/Normal/7891991000826.jpg',
    badges: [],
  },
  {
    id: 27, cat: 'bebidas',
    name: 'Kaiser',
    desc: 'Cerveja Kaiser lata 350ml gelada',
    price: 6.00,
    img: 'https://cdn.irmaospatrocinio.com.br/img/p/1/6/8/9/5/4/168954-thickbox_default.jpg',
    badges: [],
  },
  {
    id: 28, cat: 'bebidas',
    name: 'Mini Coca',
    desc: 'Coca-Cola mini 250ml gelada',
    price: 3.00,
    img: 'https://www.sanmiguelchapultepec.shop/wp-content/uploads/2020/04/coca-cola-mini-250-ml.jpg',
    badges: [],
  },
  {
    id: 29, cat: 'bebidas',
    name: 'Red Bull',
    desc: 'Red Bull energético 250ml',
    price: 15.00,
    img: 'https://barcodelive.org/filemanager/data-images/imgs/20230223/News_10%20Best%20Red%20Bull%20Flavors%20You%20Should%20Try_2.jpg',
    badges: [],
  },
  {
    id: 30, cat: 'bebidas',
    name: 'Skol Lata',
    desc: 'Cerveja Skol lata 350ml gelada',
    price: 7.00,
    img: 'https://a-static.mlcdn.com.br/800x560/cerveja-skol-lata-caixa-com-12/bartropical/9479d15413fb11ed853c4201ac185079/dd3eccaf4fa30803d455dd28510aad07.jpg',
    badges: [],
  },
  {
    id: 31, cat: 'bebidas',
    name: 'Brahma',
    desc: 'Cerveja Brahma lata 350ml gelada',
    price: 7.00,
    img: 'https://choppbrahmaexpress.vtexassets.com/arquivos/ids/155702/brahma-lata-350ml.jpg?v=637353454674430000',
    badges: [],
  },
  {
    id: 32, cat: 'bebidas',
    name: 'Heineken',
    desc: 'Cerveja Heineken 330ml gelada',
    price: 12.00,
    img: 'https://jamaicagetawaytravels.com/wp-content/uploads/2020/06/Heineken.jpg',
    badges: ['mais'],
  },
  {
    id: 33, cat: 'bebidas',
    name: 'Heineken Zero',
    desc: 'Heineken Zero Álcool 330ml',
    price: 7.00,
    img: 'https://penielvicfalls.com/wp-content/uploads/2024/09/Heineken-zero-1024x1024.jpeg',
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
    name: '', notes: ''
  },
  geo: { lat: null, lon: null, link: '', routeLink: '' },
  payMethod:   '',
  payStatus:   'idle',     /* idle | waiting | confirmed | production */
  couponApplied: false,
  discount:    0,
  orderId:     null,
};

const DELIVERY_FEE = 6.00;
const VALID_COUPONS = { 'DAY10': 10, 'PROMO5': 5 }; /* Cupons válidos (demo) */

/* ── CONFIGURAÇÕES DA LOJA ── */
// Trocar pelo número real no formato internacional (sem + e sem espaços)
const STORE_WHATSAPP = "554791559926";
// Trocar pela chave PIX real da loja (celular, CPF, email ou chave aleatória)
const PIX_KEY = "47997483342";

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

  if (page === 'delivery') {
    state.geo = { lat: null, lon: null, link: '', routeLink: '' };
    const btn = el('btn-geo');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-location-dot"></i> Usar minha localização atual'; btn.classList.remove('btn-geo-done'); }
    const stat = el('geo-status');
    if (stat) stat.style.display = 'none';
  }
  if (page === 'payment') {
    updatePaymentPage();
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
  const geoCard = el('geo-card');
  if (geoCard) geoCard.style.display = type === 'pickup' ? 'none' : 'block';
}

function requestGeoLocation() {
  const btn  = el('btn-geo');
  const stat = el('geo-status');

  if (!navigator.geolocation) {
    showToast('Geolocalização não disponível neste navegador.');
    return;
  }

  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Obtendo localização...'; }

  navigator.geolocation.getCurrentPosition(
    pos => {
      const lat       = pos.coords.latitude.toFixed(6);
      const lon       = pos.coords.longitude.toFixed(6);
      const link      = `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;
      const routeLink = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
      state.geo = { lat, lon, link, routeLink };

      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Localização obtida'; btn.classList.add('btn-geo-done'); }
      if (stat) stat.style.display = 'block';
      const geoLink = el('geo-link');
      if (geoLink) geoLink.href = link;
      showToast('Localização adicionada com sucesso!');
    },
    err => {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-location-dot"></i> Usar minha localização atual'; }
      const msgs = { 1: 'Permissão negada. Você pode continuar sem localização.', 2: 'Localização indisponível.', 3: 'Tempo esgotado. Tente novamente.' };
      showToast(msgs[err.code] || 'Não foi possível obter a localização.');
    },
    { timeout: 10000, enableHighAccuracy: true }
  );
}

function handlePixPayment() {
  if (state.deliveryType === 'delivery' && !state.geo.lat) {
    showToast('Para entrega, use o botão de localização antes de continuar.');
    navigateTo('delivery');
    return;
  }
  state.payMethod = 'pix';
  state.orderId   = Math.floor(Math.random() * 90000) + 10000;
  openPixPage();
}

function handleCardPayment() {
  if (state.deliveryType === 'delivery' && !state.geo.lat) {
    showToast('Para entrega, use o botão de localização antes de continuar.');
    navigateTo('delivery');
    return;
  }
  state.payMethod = 'card';
  state.orderId   = Math.floor(Math.random() * 90000) + 10000;
  sendWhatsApp();
  navigateTo('confirmation');
}

function handleCashPayment() {
  if (state.deliveryType === 'delivery' && !state.geo.lat) {
    showToast('Para entrega, use o botão de localização antes de continuar.');
    navigateTo('delivery');
    return;
  }
  openTrocoModal();
}

function openTrocoModal() {
  const modal = el('troco-modal');
  if (modal) { modal.style.display = 'flex'; document.body.style.overflow = 'hidden'; }
  const inp = el('troco-input');
  if (inp) { inp.value = ''; setTimeout(() => inp.focus(), 100); }
}

function closeTrocoModal() {
  const modal = el('troco-modal');
  if (modal) modal.style.display = 'none';
  if (!state.cartOpen && !spOpen) document.body.style.overflow = '';
}

function closeTrocoModalOutside(e) {
  if (e.target === el('troco-modal')) closeTrocoModal();
}

function confirmCashPayment() {
  state.payMethod = 'cash';
  state.orderId   = state.orderId || Math.floor(Math.random() * 90000) + 10000;
  closeTrocoModal();
  sendWhatsApp();
  navigateTo('confirmation');
}

function openPixPage() {
  const keyEl = el('pix-key-display');
  if (keyEl) keyEl.textContent = PIX_KEY;
  const page = el('pix-page');
  if (page) { page.classList.add('open'); document.body.style.overflow = 'hidden'; }
}

function closePixPage() {
  const page = el('pix-page');
  if (page) page.classList.remove('open');
  if (!state.cartOpen && !spOpen) document.body.style.overflow = '';
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
  updateCartBar();
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
  updateCartBar();
  refreshProductCard(id);
  renderCartItems();
}

function removeFromCart(id) {
  state.cart = state.cart.filter(i => i.id !== id);
  saveCart();
  refreshCartCount();
  updateCartBar();
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

function updateCartBar() {
  const bar   = el('cart-bar');
  const waBar = el('wa-bar');
  if (!bar) return;

  const qty      = state.cart.reduce((s, i) => s + i.qty, 0);
  const subtotal = getSubtotal();

  if (qty === 0) {
    bar.style.display = 'none';
    if (waBar) waBar.style.display = 'block';
    return;
  }

  bar.style.display = 'block';
  if (waBar) waBar.style.display = 'none';

  const countEl = el('cart-bar-count');
  const totalEl = el('cart-bar-total');
  if (countEl) countEl.textContent = qty === 1 ? '1 item' : `${qty} itens`;
  if (totalEl) totalEl.textContent = `R$ ${fmt(subtotal)}`;
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

  const icon    = p.fallbackIcon || 'fa-utensils';
  const imgHTML = p.img
    ? `<img src="${p.img}" alt="${p.name}" loading="lazy" onerror="handleCardImgError(this,'${icon}')">`
    : `<div class="card-img-placeholder"><i class="fas ${icon}"></i><span>Foto em breve</span></div>`;

  const ctrlHTML = qty > 0
    ? `<div class="qty-ctrl" id="ctrl-${p.id}" onclick="event.stopPropagation()">
        <button class="qty-btn" onclick="changeQty(${p.id},-1)" aria-label="Diminuir"><i class="fas fa-minus"></i></button>
        <span class="qty-val">${qty}</span>
        <button class="qty-btn" onclick="addToCart(${p.id})" aria-label="Aumentar"><i class="fas fa-plus"></i></button>
      </div>`
    : `<button class="btn-add" id="ctrl-${p.id}" onclick="event.stopPropagation();addToCart(${p.id})" aria-label="Adicionar ${p.name}">
        <i class="fas fa-cart-plus"></i> Adicionar
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
    ctrl.outerHTML = `<button class="btn-add" id="ctrl-${id}" onclick="event.stopPropagation();addToCart(${id})" aria-label="Adicionar">
      <i class="fas fa-cart-plus"></i> Adicionar
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
  const name = document.getElementById('f-name').value.trim();
  const errBox = document.getElementById('delivery-error');

  if (!name) {
    errBox.style.display = 'flex';
    errBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    return;
  }
  errBox.style.display = 'none';

  state.form = {
    name,
    notes: el('f-notes')?.value.trim() || '',
  };

  navigateTo('payment');
}

/* ──────────────────────────────────────────
   9. PAGAMENTO
────────────────────────────────────────── */

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

  /* Endereço / localização */
  const addrTxt = el('pay-address-txt');
  if (state.deliveryType === 'pickup') {
    if (addrTxt) addrTxt.textContent = 'Retirada no local — R. Faustino Martini, 160, Luiz Alves - SC';
  } else if (state.geo.lat) {
    if (addrTxt) addrTxt.innerHTML = `<a href="${state.geo.link}" target="_blank" rel="noopener" style="color:var(--primary);font-weight:700"><i class="fas fa-location-dot"></i> Localização enviada — Abrir no mapa</a>`;
  } else {
    if (addrTxt) addrTxt.textContent = 'Localização não informada';
  }
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
   10. PAGAMENTO — PIX
────────────────────────────────────────── */
function copyPixKey() {
  navigator.clipboard.writeText(PIX_KEY).catch(() => {});
  const btn = el('btn-copy-pix');
  btn.classList.add('copied');
  btn.innerHTML = '<i class="fas fa-check"></i> Copiado!';
  setTimeout(() => {
    btn.classList.remove('copied');
    btn.innerHTML = '<i class="fas fa-copy"></i> Copiar chave PIX';
  }, 2500);
}

function sendWhatsAppPixContact() {
  sendWhatsApp();
}

// Futuramente:
// integrar Mercado Pago,
// gerar PIX real,
// receber webhook,
// confirmar pagamento automaticamente,
// e criar painel ADM para acompanhar pedidos.

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

  const noteEl = el('confirm-pay-note');
  if (noteEl) {
    if (state.payMethod === 'pix') {
      noteEl.innerHTML = '<i class="fas fa-circle-info"></i> Após o pagamento, envie o comprovante pelo WhatsApp.';
      noteEl.className = 'confirm-pay-note confirm-pay-note-pix';
    } else {
      noteEl.innerHTML = '<i class="fas fa-circle-check"></i> A loja irá confirmar seu pedido pelo WhatsApp.';
      noteEl.className = 'confirm-pay-note confirm-pay-note-ok';
    }
  }
}

/* ──────────────────────────────────────────
   13. WHATSAPP
────────────────────────────────────────── */
function sendWhatsApp() {
  const f         = state.form;
  const items     = state.cart.map(i => `• ${i.qty}x ${i.name} — R$ ${fmt(i.price * i.qty)}`).join('\n');
  const payLabels = {
    pix:  'PIX',
    card: 'Cartão na entrega/retirada',
    cash: 'Dinheiro na entrega/retirada',
  };
  const troco = state.payMethod === 'cash' ? (el('troco-input')?.value.trim() || '') : '';

  /* Tipo e localização */
  let tipoEntrega, locTxt;
  if (state.deliveryType === 'pickup') {
    tipoEntrega = 'Retirada no local';
    locTxt = '';
  } else {
    tipoEntrega = 'Entrega';
    if (state.geo.lat) {
      locTxt =
        `\n\n📍 *Localização do cliente:*\n${state.geo.link}` +
        `\n\n🧭 *Rota para entrega:*\n${state.geo.routeLink}`;
    } else {
      locTxt = '\n\n📍 Localização não informada';
    }
  }

  const message =
    `Olá, Day Lanches! Quero fazer um pedido.\n\n` +
    `👤 *Nome:* ${f.name}\n\n` +
    `📦 *Tipo do pedido:* ${tipoEntrega}\n\n` +
    `🛒 *Pedido:*\n${items}\n\n` +
    `💰 *Subtotal:* R$ ${fmt(getSubtotal())}\n` +
    `🚚 *Taxa de entrega:* ${getDeliveryFee() > 0 ? 'R$ ' + fmt(getDeliveryFee()) : 'Grátis'}\n` +
    `💰 *Total:* R$ ${fmt(getTotal())}\n\n` +
    `💳 *Forma de pagamento:* ${payLabels[state.payMethod] || state.payMethod}` +
    (troco ? `\n💵 *Troco para:* R$ ${troco}` : '') +
    (f.notes ? `\n\n📝 *Observações:*\n${f.notes}` : '') +
    locTxt;

  window.open(`https://wa.me/${STORE_WHATSAPP}?text=${encodeURIComponent(message)}`, '_blank');
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

/* ── Resultados — mesmo card do catálogo ── */
function buildSpResultCard(p) {
  const icon    = p.fallbackIcon || 'fa-utensils';
  const safeN   = p.name.replace(/'/g, "\\'");
  const imgHTML = p.img
    ? `<img src="${p.img}" alt="${p.name}" loading="lazy" onerror="handleCardImgError(this,'${icon}')">`
    : `<div class="card-img-placeholder"><i class="fas ${icon}"></i></div>`;
  return `
    <div class="product-card" onclick="spSelectProduct(${p.id})">
      <div class="card-img-wrap">${imgHTML}</div>
      <div class="card-body">
        <h3 class="card-name">${p.name}</h3>
        <p class="card-desc">${p.desc}</p>
        <div class="card-footer">
          <span class="card-price">R$ ${fmt(p.price)}</span>
          <button class="btn-add" onclick="event.stopPropagation();addToCart(${p.id});showToast('${safeN} adicionado!')" aria-label="Adicionar">
            <i class="fas fa-cart-plus"></i> Adicionar
          </button>
        </div>
      </div>
    </div>`;
}

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
  list.innerHTML = filtered.map(p => buildSpResultCard(p)).join('');
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
function handleCardImgError(img, icon) {
  const wrap = img.parentNode;
  if (!wrap) return;
  const ph = document.createElement('div');
  ph.className = 'card-img-placeholder';
  ph.innerHTML = `<i class="fas ${icon}"></i><span>Foto em breve</span>`;
  wrap.replaceChild(ph, img);
}

/* ──────────────────────────────────────────
   16. INICIALIZAÇÃO
────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadCart();
  refreshCartCount();
  updateCartBar();
  renderProducts();
  initCarousel();

  /* Pre-fill: apenas nome para demonstração */
  setTimeout(() => {
    const fn = el('f-name'); if (fn && !fn.value) fn.value = 'Maria da Silva';
  }, 200);

  /* Keyboard: ESC fecha telas abertas em ordem de prioridade */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (el('troco-modal')?.style.display === 'flex') closeTrocoModal();
      else if (el('pix-page')?.classList.contains('open')) closePixPage();
      else if (ppProductId)         closeProductPage();
      else if (spOpen)              closeSearchPage();
      else if (state.cartOpen)      closeCart();
    }
  });

  console.log('%c🍔 Day Lanches — Cardápio Digital', 'color:#FF6B00;font-size:16px;font-weight:bold;');
  console.log('%cProtótipo demonstrativo • Desenvolvido para apresentação comercial', 'color:#888');
});

/* Expõe funções usadas em onclick do HTML no escopo global */
window.handlePixPayment        = handlePixPayment;
window.handleCardPayment       = handleCardPayment;
window.handleCashPayment       = handleCashPayment;
window.openPixPage             = openPixPage;
window.closePixPage            = closePixPage;
window.copyPixKey              = copyPixKey;
window.sendWhatsAppPixContact  = sendWhatsAppPixContact;
window.openTrocoModal          = openTrocoModal;
window.closeTrocoModal         = closeTrocoModal;
window.closeTrocoModalOutside  = closeTrocoModalOutside;
window.confirmCashPayment      = confirmCashPayment;
