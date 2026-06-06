'use strict';
/* ─────────────────────────────────────────
   Day Lanches — Gestão da loja
   Requer: Firebase 9 compat, firebase-config.js
───────────────────────────────────────── */

let auth, db;

/* ── Firebase Init ── */
function initFirebase() {
  try {
    if (!firebase.apps.length) firebase.initializeApp(FIREBASE_CONFIG);
    auth = firebase.auth();
    db   = firebase.firestore();
    return true;
  } catch (e) {
    console.error('Firebase não inicializado. Preencha firebase-config.js', e);
    return false;
  }
}

/* ── App State ── */
const gs = {
  section: 'produtos',
  products: [],
  orders: [],
  orderFilter: 'all',
  productFilter: '',
  editId: null,
  uploadedUrl: '',
};

/* ══════════════════════════════════════
   AUTH
══════════════════════════════════════ */
function handleLogin(e) {
  e.preventDefault();
  const email = v('login-email'), pwd = v('login-password');
  hide('login-error');
  setLoading('login-btn', true, 'Entrando...');
  auth.signInWithEmailAndPassword(email, pwd)
    .catch(err => {
      show('login-error', authMsg(err.code));
      setLoading('login-btn', false, 'Entrar');
    });
}

function handleCreateAccount(e) {
  e.preventDefault();
  const name  = v('create-name');
  const email = v('create-email');
  const pwd   = v('create-pwd');
  const pwd2  = v('create-pwd2');
  const code  = v('create-code').toUpperCase().trim();

  hide('create-error');

  if (pwd !== pwd2)           return show('create-error', 'As senhas não coincidem.');
  if (pwd.length < 6)         return show('create-error', 'Senha precisa ter ao menos 6 caracteres.');
  if (code !== ACTIVATION_CODE) return show('create-error', 'Código de ativação inválido.');

  setLoading('create-btn', true, 'Criando...');
  auth.createUserWithEmailAndPassword(email, pwd)
    .then(cred => Promise.all([
      cred.user.updateProfile({ displayName: name }),
      db.collection('users').doc(cred.user.uid).set({
        name, email, role: 'owner',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      }),
    ]))
    .then(() => toast('Acesso criado! Entrando...'))
    .catch(err => {
      show('create-error', authMsg(err.code));
      setLoading('create-btn', false, 'Criar acesso');
    });
}

function handleLogout() {
  auth.signOut().then(() => showView('login'));
}

function authMsg(code) {
  return ({
    'auth/invalid-email':        'E-mail inválido.',
    'auth/user-not-found':       'E-mail não encontrado.',
    'auth/wrong-password':       'Senha incorreta.',
    'auth/invalid-credential':   'E-mail ou senha incorretos.',
    'auth/email-already-in-use': 'Este e-mail já está em uso.',
    'auth/weak-password':        'Senha muito fraca.',
    'auth/too-many-requests':    'Muitas tentativas. Tente em breve.',
  })[code] || 'Erro ao entrar. Tente novamente.';
}

/* ══════════════════════════════════════
   VIEWS / NAVIGATION
══════════════════════════════════════ */
function showView(name) {
  ['login','create-account','dashboard'].forEach(v => {
    const el_ = document.getElementById(`view-${v}`);
    if (el_) el_.style.display = v === name ? 'flex' : 'none';
  });
}

function showSection(name) {
  document.querySelectorAll('.dash-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  const sec = elid(`section-${name}`);
  if (sec) sec.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b => {
    if (b.getAttribute('onclick')?.includes(`'${name}'`)) b.classList.add('active');
  });
  const titles = { produtos:'Produtos', pedidos:'Pedidos', vendas:'Vendas', config:'Configurações', acessos:'Acessos' };
  elid('dash-title').textContent = titles[name] || name;
  gs.section = name;
  if (name === 'vendas') renderSales();
  if (name === 'config') loadConfig();
  if (name === 'acessos') renderUserInfo();
  if (name === 'pedidos') loadOrders();
  closeSidebar();
}

function openSidebar()  {
  elid('sidebar').classList.add('open');
  elid('sidebar-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeSidebar() {
  elid('sidebar').classList.remove('open');
  elid('sidebar-overlay').classList.remove('open');
  document.body.style.overflow = '';
}

/* ══════════════════════════════════════
   PRODUCTS
══════════════════════════════════════ */
async function loadProducts() {
  try {
    const snap = await db.collection('products').orderBy('name').get();
    gs.products = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
  } catch (e) {
    console.warn('Erro ao carregar produtos:', e);
    gs.products = [];
  }
  renderProductList();
}

function renderProductList() {
  const wrap = elid('products-list');
  const q    = gs.productFilter.toLowerCase();
  const list = q
    ? gs.products.filter(p => (p.name||'').toLowerCase().includes(q) || (p.cat||'').toLowerCase().includes(q))
    : gs.products;

  if (!list.length) {
    wrap.innerHTML = '<p class="empty-msg">Nenhum produto. Clique em "Novo produto" para começar.</p>';
    return;
  }

  wrap.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Img</th><th>Nome</th><th>Categoria</th>
        <th>Preço</th><th>Status</th><th>Ações</th>
      </tr></thead>
      <tbody>${list.map(p => `
        <tr class="${p.active===false?'row-inactive':''}">
          <td><div class="tbl-img-wrap"><img src="${esc(p.img||'')}" alt="" loading="lazy" onerror="this.style.display='none'"></div></td>
          <td><strong>${esc(p.name)}</strong>${p.badges?.length?`<span class="tbl-badge">${p.badges[0]}</span>`:''}</td>
          <td>${esc(p.cat||'—')}</td>
          <td>R$ ${fmt(p.price)}</td>
          <td><span class="status-pill ${p.active!==false?'status-active':'status-inactive'}">${p.active!==false?'Ativo':'Inativo'}</span></td>
          <td>
            <button class="btn-icon-sm btn-edit" onclick="openProductForm('${p.firestoreId}')"><i class="fas fa-pen"></i></button>
            <button class="btn-icon-sm btn-del"  onclick="confirmDeleteProduct('${p.firestoreId}','${esc(p.name)}')"><i class="fas fa-trash"></i></button>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function filterProductList(q) { gs.productFilter = q; renderProductList(); }

function openProductForm(firestoreId) {
  gs.editId = firestoreId || null;
  gs.uploadedUrl = '';

  elid('form-product').reset();
  elid('p-id').value = '';
  elid('p-img').value = '';
  elid('p-img-url').value = '';
  elid('img-preview').style.display = 'none';
  elid('img-placeholder').style.display = 'flex';
  elid('img-status').style.display = 'none';
  elid('product-error').style.display = 'none';
  elid('modal-title').textContent = firestoreId ? 'Editar produto' : 'Novo produto';

  if (firestoreId) {
    const p = gs.products.find(x => x.firestoreId === firestoreId);
    if (p) {
      elid('p-id').value    = p.firestoreId;
      elid('p-name').value  = p.name || '';
      elid('p-price').value = p.price || '';
      elid('p-desc').value  = p.desc || '';
      elid('p-cat').value   = p.cat || '';
      elid('p-badge').value = p.badges?.[0] || '';
      elid('p-active').checked = p.active !== false;
      elid('p-acai').checked   = !!p.allowAcaiAddons;
      elid('p-img').value      = p.img || '';
      elid('p-img-url').value  = p.img || '';
      if (p.img) {
        elid('img-preview').src = p.img;
        elid('img-preview').style.display = 'block';
        elid('img-placeholder').style.display = 'none';
      }
    }
  }

  elid('product-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeProductForm() {
  elid('product-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

function closeProductFormOutside(e) {
  if (e.target === elid('product-overlay')) closeProductForm();
}

async function handleSaveProduct(e) {
  e.preventDefault();
  const imgUrl = gs.uploadedUrl || elid('p-img').value || elid('p-img-url').value || '';
  const name   = elid('p-name').value.trim();
  const price  = parseFloat(elid('p-price').value);
  const cat    = elid('p-cat').value;

  hide('product-error');
  if (!name)       return show('product-error', 'Informe o nome do produto.');
  if (isNaN(price)) return show('product-error', 'Informe um preço válido.');
  if (!cat)        return show('product-error', 'Selecione uma categoria.');

  const badge = elid('p-badge').value;
  const data  = {
    name, price, cat,
    desc:           elid('p-desc').value.trim(),
    img:            imgUrl,
    active:         elid('p-active').checked,
    allowAcaiAddons: elid('p-acai').checked,
    badges:         badge ? [badge] : [],
    updatedAt:      firebase.firestore.FieldValue.serverTimestamp(),
  };

  const btn = elid('save-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

  try {
    const existingId = elid('p-id').value;
    if (existingId) {
      await db.collection('products').doc(existingId).update(data);
      toast('Produto atualizado!');
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection('products').doc().set(data);
      toast('Produto cadastrado!');
    }
    closeProductForm();
    loadProducts();
  } catch (err) {
    show('product-error', 'Erro ao salvar. Verifique o Firestore.');
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Salvar produto';
  }
}

async function confirmDeleteProduct(id, name) {
  if (!confirm(`Excluir "${name}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await db.collection('products').doc(id).delete();
    toast('Produto excluído.');
    loadProducts();
  } catch { toast('Erro ao excluir.', true); }
}

/* ══════════════════════════════════════
   IMAGE UPLOAD (Cloudinary)
══════════════════════════════════════ */
function triggerImageUpload() {
  elid('img-file').click();
}

async function handleImageSelect(input) {
  const file = input.files[0];
  if (!file) return;

  if (file.size > 5 * 1024 * 1024) {
    show('product-error', 'Imagem muito grande. Máximo 5MB.');
    return;
  }

  /* Preview local imediato */
  const reader = new FileReader();
  reader.onload = ev => {
    elid('img-preview').src = ev.target.result;
    elid('img-preview').style.display = 'block';
    elid('img-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);

  const status = elid('img-status');
  status.style.display = 'flex';
  status.className = 'img-status uploading';
  status.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando imagem para Cloudinary...';

  try {
    const url = await uploadToCloudinary(file);
    gs.uploadedUrl = url;
    elid('p-img').value     = url;
    elid('p-img-url').value = url;
    status.className = 'img-status success';
    status.innerHTML = '<i class="fas fa-check-circle"></i> Imagem enviada com sucesso!';
  } catch (err) {
    status.className = 'img-status error';
    status.innerHTML = '<i class="fas fa-exclamation-circle"></i> Erro ao enviar. Verifique a configuração do Cloudinary.';
    console.error(err);
  }
}

async function uploadToCloudinary(file) {
  if (!CLOUDINARY_CLOUD_NAME || CLOUDINARY_CLOUD_NAME === 'COLOCAR_CLOUD_NAME') {
    throw new Error('Cloudinary não configurado. Preencha firebase-config.js');
  }
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', 'day-lanches/produtos');

  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
    method: 'POST', body: formData,
  });
  if (!res.ok) throw new Error('Cloudinary retornou erro ' + res.status);
  const data = await res.json();
  return data.secure_url;
}

function syncImgUrl(url) {
  if (!url) return;
  elid('p-img').value = url;
  gs.uploadedUrl = url;
  elid('img-preview').src = url;
  elid('img-preview').style.display = 'block';
  elid('img-placeholder').style.display = 'none';
}

/* ══════════════════════════════════════
   ORDERS
══════════════════════════════════════ */
async function loadOrders() {
  try {
    const snap = await db.collection('orders').orderBy('createdAt', 'desc').limit(100).get();
    gs.orders = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    gs.orders = [];
    console.warn('Erro ao carregar pedidos:', e);
  }
  renderOrders();
}

function renderOrders() {
  const wrap = elid('orders-list');
  const list = gs.orderFilter === 'all'
    ? gs.orders
    : gs.orders.filter(o => o.status === gs.orderFilter);

  if (!list.length) {
    wrap.innerHTML = '<p class="empty-msg">Nenhum pedido encontrado.</p>';
    return;
  }
  wrap.innerHTML = list.map(orderCard).join('');
}

function orderCard(o) {
  const statusLabels = {
    novo:'Novo', em_preparo:'Em preparo',
    saiu_para_entrega:'Saiu p/ entrega',
    finalizado:'Finalizado', cancelado:'Cancelado',
  };
  const stClass = {
    novo:'st-novo', em_preparo:'st-preparo',
    saiu_para_entrega:'st-entrega',
    finalizado:'st-finalizado', cancelado:'st-cancelado',
  };
  const date = o.createdAt?.toDate
    ? o.createdAt.toDate().toLocaleString('pt-BR')
    : '—';
  const num  = o.orderNumber || o.id.slice(-6).toUpperCase();

  return `
    <div class="order-card ${stClass[o.status]||''}">
      <div class="order-hd">
        <div>
          <span class="order-num">#${num}</span>
          <span class="order-customer">${esc(o.customerName||'Cliente')}</span>
        </div>
        <span class="order-status ${stClass[o.status]||''}">${statusLabels[o.status]||o.status}</span>
      </div>
      <div class="order-meta">
        <span><i class="fas fa-clock"></i> ${date}</span>
        <span><i class="fas fa-${o.deliveryType==='pickup'?'store':'motorcycle'}"></i> ${o.deliveryType==='pickup'?'Retirada':'Entrega'}</span>
        <span><i class="fas fa-tag"></i> R$ ${fmt(o.total)}</span>
        <span><i class="fas fa-credit-card"></i> ${o.paymentMethod||'—'}</span>
      </div>
      <div class="order-items">${(o.items||[]).map(i=>`<span class="order-item-tag">${i.qty}x ${esc(i.name)}</span>`).join('')}</div>
      ${o.notes?`<div class="order-meta"><span><i class="fas fa-comment"></i> ${esc(o.notes)}</span></div>`:''}
      <div class="order-actions">${nextStatusBtns(o)}</div>
    </div>`;
}

function nextStatusBtns(o) {
  const next  = { novo:['em_preparo','cancelado'], em_preparo:['saiu_para_entrega','cancelado'], saiu_para_entrega:['finalizado'], finalizado:[], cancelado:[] };
  const label = { em_preparo:'Em preparo', saiu_para_entrega:'Saiu p/ entrega', finalizado:'Finalizado', cancelado:'Cancelar' };
  return (next[o.status]||[]).map(s =>
    `<button class="btn-status btn-status-${s}" onclick="updateOrderStatus('${o.id}','${s}')">${label[s]}</button>`
  ).join('');
}

async function updateOrderStatus(id, status) {
  try {
    await db.collection('orders').doc(id).update({
      status, updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    toast('Status atualizado!');
    loadOrders();
  } catch { toast('Erro ao atualizar status.', true); }
}

function filterOrders(filter, btn) {
  gs.orderFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderOrders();
}

/* ══════════════════════════════════════
   SALES
══════════════════════════════════════ */
function renderSales() {
  const today = new Date(); today.setHours(0,0,0,0);
  const todayOrders  = gs.orders.filter(o => o.createdAt?.toDate?.() >= today);
  const openOrders   = gs.orders.filter(o => !['finalizado','cancelado'].includes(o.status));
  const todayRevenue = todayOrders.reduce((s, o) => s + (o.total||0), 0);

  elid('sv-hoje').textContent    = todayOrders.length;
  elid('sv-receita').textContent = 'R$ ' + fmt(todayRevenue);
  elid('sv-abertos').textContent = openOrders.length;
  elid('sv-total').textContent   = gs.orders.length;

  const salesList = elid('sales-list');
  if (gs.orders.length) {
    salesList.innerHTML = '<h3 style="margin-bottom:12px;font-size:.9rem;font-weight:700">Pedidos recentes</h3>'
      + gs.orders.slice(0,20).map(orderCard).join('');
  } else {
    salesList.innerHTML = '<p class="empty-msg">Nenhum pedido registrado ainda.</p>';
  }
}

/* ══════════════════════════════════════
   CONFIG
══════════════════════════════════════ */
async function loadConfig() {
  try {
    const snap = await db.collection('settings').doc('store').get();
    if (!snap.exists) return;
    const cfg = snap.data();
    setv('cfg-wa',     cfg.whatsapp||'');
    setv('cfg-pix',    cfg.pix||'');
    setv('cfg-insta',  cfg.instagram||'');
    setv('cfg-hours',  cfg.hours||'');
    setv('cfg-km',     cfg.deliveryPriceKm||'');
    setv('cfg-factor', cfg.routeFactor||'');
    setv('cfg-lat',    cfg.storeLat||'');
    setv('cfg-lon',    cfg.storeLon||'');
  } catch (e) { console.warn('Erro config:', e); }
}

async function handleSaveConfig(e) {
  e.preventDefault();
  const data = {
    whatsapp:         getv('cfg-wa'),
    pix:              getv('cfg-pix'),
    instagram:        getv('cfg-insta'),
    hours:            getv('cfg-hours'),
    deliveryPriceKm:  parseFloat(getv('cfg-km'))     || 2.5,
    routeFactor:      parseFloat(getv('cfg-factor'))  || 1.4,
    storeLat:         parseFloat(getv('cfg-lat'))     || -26.74403627881803,
    storeLon:         parseFloat(getv('cfg-lon'))     || -48.83443849068592,
    updatedAt:        firebase.firestore.FieldValue.serverTimestamp(),
  };
  try {
    await db.collection('settings').doc('store').set(data, { merge: true });
    toast('Configurações salvas!');
  } catch { toast('Erro ao salvar configurações.', true); }
}

/* ══════════════════════════════════════
   USER INFO
══════════════════════════════════════ */
function renderUserInfo() {
  const user = auth.currentUser;
  if (!user) return;
  elid('user-info-block').innerHTML = `
    <div class="user-info-row"><span>Nome</span><strong>${esc(user.displayName||'—')}</strong></div>
    <div class="user-info-row"><span>E-mail</span><strong>${esc(user.email)}</strong></div>
    <div class="user-info-row"><span>UID</span><code>${user.uid}</code></div>
    <div class="user-info-row"><span>Último acesso</span><strong>${new Date(user.metadata.lastSignInTime||0).toLocaleString('pt-BR')}</strong></div>
    <div style="margin-top:16px">
      <button class="btn-secondary" onclick="sendPwdReset()"><i class="fas fa-key"></i> Redefinir senha</button>
    </div>`;
}

function sendPwdReset() {
  auth.sendPasswordResetEmail(auth.currentUser.email)
    .then(()  => toast('E-mail de redefinição enviado!'))
    .catch(()  => toast('Erro ao enviar e-mail.', true));
}

/* ══════════════════════════════════════
   HELPERS
══════════════════════════════════════ */
function elid(id) { return document.getElementById(id); }
function v(id)    { return elid(id)?.value?.trim() || ''; }
function getv(id) { return elid(id)?.value || ''; }
function setv(id, val) { if (elid(id)) elid(id).value = val; }
function fmt(n)   { return Number(n||0).toFixed(2).replace('.', ','); }
function esc(s)   { return String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function toast(msg, isErr) {
  const t = elid('g-toast');
  t.textContent = msg;
  t.className = 'g-toast show' + (isErr ? ' error' : '');
  setTimeout(() => t.className = 'g-toast', 3000);
}

function show(id, msg) {
  const el_ = elid(id);
  if (el_) { el_.textContent = msg; el_.style.display = 'flex'; }
}

function hide(id) {
  const el_ = elid(id);
  if (el_) el_.style.display = 'none';
}

function setLoading(id, loading, label) {
  const btn = elid(id);
  if (!btn) return;
  btn.disabled = loading;
  if (loading) {
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${label||'Aguarde...'}`;
  } else {
    btn.innerHTML = label || btn.dataset.orig || btn.textContent;
  }
}

function togglePwd(inputId, btn) {
  const inp = elid(inputId);
  if (!inp) return;
  const isText = inp.type === 'text';
  inp.type = isText ? 'password' : 'text';
  if (btn) btn.querySelector('i').className = `fas fa-${isText ? 'eye' : 'eye-slash'}`;
}

/* ══════════════════════════════════════
   BOOTSTRAP
══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  if (!initFirebase()) {
    show('login-error', '⚠️ Firebase não configurado. Preencha firebase-config.js');
    const btn = elid('login-btn');
    if (btn) btn.disabled = true;
    showView('login');
    return;
  }

  auth.onAuthStateChanged(user => {
    if (user) {
      showView('dashboard');
      elid('user-display').textContent = user.displayName || user.email.split('@')[0];
      loadProducts();
      loadOrders();
    } else {
      showView('login');
    }
  });
});

/* Expose for HTML onclick */
window.handleLogin            = handleLogin;
window.handleCreateAccount    = handleCreateAccount;
window.handleLogout           = handleLogout;
window.showView               = showView;
window.showSection            = showSection;
window.openSidebar            = openSidebar;
window.closeSidebar           = closeSidebar;
window.openProductForm        = openProductForm;
window.closeProductForm       = closeProductForm;
window.closeProductFormOutside = closeProductFormOutside;
window.handleSaveProduct      = handleSaveProduct;
window.handleImageSelect      = handleImageSelect;
window.syncImgUrl             = syncImgUrl;
window.filterProductList      = filterProductList;
window.confirmDeleteProduct   = confirmDeleteProduct;
window.filterOrders           = filterOrders;
window.updateOrderStatus      = updateOrderStatus;
window.handleSaveConfig       = handleSaveConfig;
window.togglePwd              = togglePwd;
window.sendPwdReset           = sendPwdReset;
