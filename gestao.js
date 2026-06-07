'use strict';
/* ─────────────────────────────────────────
   Day Lanches — Gestão da loja
   Requer: Supabase JS v2, supabase-config.js
───────────────────────────────────────── */

/* Retorna o cliente Supabase inicializado em supabase-config.js */
function getSb() {
  const c = window.supabaseClient;
  if (!c) throw new Error('Supabase não carregado. Verifique a ordem dos scripts e supabase-config.js');
  return c;
}

/* ── App State ── */
const gs = {
  section: 'produtos',
  currentUser: null,
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
async function handleLogin(e) {
  e.preventDefault();
  const email = v('login-email'), pwd = v('login-password');
  hide('login-error');
  setLoading('login-btn', true, 'Entrando...');

  try {
    console.log('[Gestão] Tentando login:', email);
    console.log('[Gestão] Supabase client:', window.supabaseClient);

    const sb = getSb();

    const loginPromise = sb.auth.signInWithPassword({ email, password: pwd });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Tempo limite ao entrar. Verifique sua conexão.')), 12000)
    );

    const { data, error } = await Promise.race([loginPromise, timeoutPromise]);

    if (error) throw error;
    if (!data?.session) throw new Error('Login feito, mas sessão não foi criada.');

  } catch (err) {
    console.error('[Gestão] Erro no login:', err);
    show('login-error', authMsg(err));
  } finally {
    setLoading('login-btn', false, 'Entrar');
  }
}

async function handleCreateAccount(e) {
  e.preventDefault();
  const name  = v('create-name');
  const email = v('create-email');
  const pwd   = v('create-pwd');
  const pwd2  = v('create-pwd2');
  const code  = v('create-code').toUpperCase().trim();

  hide('create-error');
  if (pwd !== pwd2)             return show('create-error', 'As senhas não coincidem.');
  if (pwd.length < 6)           return show('create-error', 'Senha precisa ter ao menos 6 caracteres.');
  if (code !== ACTIVATION_CODE) return show('create-error', 'Código de ativação inválido.');

  setLoading('create-btn', true, 'Criando...');

  try {
    const { data, error } = await getSb().auth.signUp({
      email, password: pwd,
      options: { data: { name, role: 'owner' } },
    });
    if (error) throw error;
    if (data.user) {
      await getSb().from('profiles').insert({
        id: data.user.id, name, email, role: 'owner',
      }).catch(() => {});
    }
    toast('Acesso criado! Verifique seu e-mail se necessário.');
    setTimeout(() => showView('login'), 1500);
  } catch (err) {
    show('create-error', authMsg(err));
  } finally {
    setLoading('create-btn', false, 'Criar acesso');
  }
}

function handleLogout() {
  getSb().auth.signOut().catch(() => {}).finally(() => showView('login'));
}

function authMsg(error) {
  if (!error) return 'Erro desconhecido.';
  const msg = (error.message || error.toString()).toLowerCase();
  if (msg.includes('invalid login credentials'))   return 'E-mail ou senha incorretos.';
  if (msg.includes('email not confirmed'))         return 'Confirme o e-mail do usuário no Supabase (ou crie o usuário como confirmado).';
  if (msg.includes('already registered'))          return 'Este e-mail já está em uso.';
  if (msg.includes('password should'))             return 'Senha deve ter ao menos 6 caracteres.';
  if (msg.includes('user already registered'))     return 'Este e-mail já está em uso.';
  if (msg.includes('tempo limite'))                return error.message;
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('failed'))
    return 'Erro de rede. Verifique sua conexão e o SUPABASE_URL em supabase-config.js.';
  return `Erro: ${error.message || 'tente novamente.'}`;
}

/* ══════════════════════════════════════
   VIEWS / NAVIGATION
══════════════════════════════════════ */
function showView(name) {
  ['login','create-account','dashboard'].forEach(n => {
    const el_ = document.getElementById(`view-${n}`);
    if (el_) el_.style.display = n === name ? 'flex' : 'none';
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
  if (name === 'vendas')  renderSales();
  if (name === 'config')  loadConfig();
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
  gs.usingLocalProducts = false;
  try {
    const { data, error } = await getSb().from('products').select('*').order('name');
    if (error) throw error;
    if (data && data.length > 0) {
      gs.products = data;
    } else {
      /* Supabase vazio — usa produtos locais */
      gs.products = (window.PRODUCTS_LOCAL || []).filter(p => !p.isAddon);
      gs.usingLocalProducts = true;
    }
  } catch (e) {
    console.warn('Erro ao carregar produtos do Supabase, usando locais:', e);
    gs.products = (window.PRODUCTS_LOCAL || []).filter(p => !p.isAddon);
    gs.usingLocalProducts = true;
  }
  renderProductList();
}

async function importLocalProductsToSupabase() {
  const btn = elid('btn-import');
  if (btn) { btn.disabled = true; btn.textContent = 'Importando...'; }

  const local = (window.PRODUCTS_LOCAL || []).filter(p => !p.isAddon);
  if (!local.length) { toast('Nenhum produto local encontrado.', true); return; }

  const SITE = 'https://www.daylanches.com.br';
  let imported = 0, skipped = 0, errors = 0;

  for (const p of local) {
    try {
      const { data: existing } = await getSb()
        .from('products').select('id')
        .eq('name', p.name).eq('category', p.cat)
        .maybeSingle();
      if (existing) { skipped++; continue; }

      let img = p.img || '';
      if (img && !img.startsWith('http')) img = `${SITE}/${img.replace(/^\/+/, '')}`;

      const { error } = await getSb().from('products').insert({
        name:              p.name,
        description:       p.desc || '',
        price:             Number(p.price || 0),
        category:          p.cat,
        image_url:         img,
        active:            true,
        badges:            p.badges || [],
        allow_acai_addons: !!p.allowAcaiAddons,
        free_addon_limit:  p.freeAddonLimit || 0,
      });
      if (error) { console.error('Erro ao importar', p.name, error); errors++; }
      else imported++;
    } catch (e) { errors++; }
  }

  toast(`Importação concluída: ${imported} importados, ${skipped} já existiam${errors ? ', ' + errors + ' com erro' : ''}.`);
  await loadProducts();
}

function renderProductList() {
  const wrap = elid('products-list');
  const q    = gs.productFilter.toLowerCase();

  /* Normaliza campos: produtos do Supabase usam 'category'/'description'/'image_url'
     produtos locais usam 'cat'/'desc'/'img' */
  const normalized = gs.products.map(p => ({
    ...p,
    _name:     p.name || '',
    _cat:      p.category || p.cat || '—',
    _desc:     p.description || p.desc || '',
    _img:      p.image_url || p.img || '',
    _price:    p.price || 0,
    _active:   p.active !== false,
    _badges:   p.badges || [],
    _isLocal:  !p.image_url && (p.cat !== undefined),
  }));

  const list = q
    ? normalized.filter(p => p._name.toLowerCase().includes(q) || p._cat.toLowerCase().includes(q))
    : normalized;

  let banner = '';
  if (gs.usingLocalProducts) {
    banner = `
      <div class="local-products-banner">
        <div class="local-banner-text">
          <i class="fas fa-info-circle"></i>
          <span>Produtos locais carregados. Importe para a base da loja para poder editar e gerenciar.</span>
        </div>
        <button class="btn-primary btn-import" id="btn-import" onclick="importLocalProductsToSupabase()">
          <i class="fas fa-cloud-upload-alt"></i> Importar produtos atuais
        </button>
      </div>`;
  }

  if (!list.length) {
    wrap.innerHTML = banner + '<p class="empty-msg">Nenhum produto encontrado.</p>';
    return;
  }
  wrap.innerHTML = banner + `
    <table class="data-table">
      <thead><tr>
        <th>Img</th><th>Nome</th><th>Categoria</th>
        <th>Preço</th><th>Status</th><th>Ações</th>
      </tr></thead>
      <tbody>${list.map(p => `
        <tr class="${!p._active?'row-inactive':''}">
          <td><div class="tbl-img-wrap"><img src="${esc(p._img)}" alt="" loading="lazy" onerror="this.style.display='none'"></div></td>
          <td><strong>${esc(p._name)}</strong>${p._badges?.length?`<span class="tbl-badge">${p._badges[0]}</span>`:''}</td>
          <td>${esc(p._cat)}</td>
          <td>R$ ${fmt(p._price)}</td>
          <td><span class="status-pill ${p._active?'status-active':'status-inactive'}">${p._active?'Ativo':'Inativo'}</span></td>
          <td>
            ${!gs.usingLocalProducts
              ? `<button class="btn-icon-sm btn-edit" onclick="openProductForm('${p.id}')"><i class="fas fa-pen"></i></button>
                 <button class="btn-icon-sm btn-del"  onclick="confirmDeleteProduct('${p.id}','${esc(p._name)}')"><i class="fas fa-trash"></i></button>`
              : `<span style="font-size:.75rem;color:var(--text-muted)">Importe para editar</span>`
            }
          </td>
        </tr>`).join('')}
      </tbody>
    </table>`;
}

function filterProductList(q) { gs.productFilter = q; renderProductList(); }

function openProductForm(id) {
  gs.editId = id || null;
  gs.uploadedUrl = '';

  elid('form-product').reset();
  elid('p-id').value = '';
  elid('p-img').value = '';
  elid('p-img-url').value = '';
  elid('img-preview').style.display = 'none';
  elid('img-placeholder').style.display = 'flex';
  elid('img-status').style.display = 'none';
  elid('product-error').style.display = 'none';
  elid('modal-title').textContent = id ? 'Editar produto' : 'Novo produto';

  if (id) {
    const p = gs.products.find(x => x.id === id);
    if (p) {
      elid('p-id').value    = p.id;
      elid('p-name').value  = p.name || '';
      elid('p-price').value = p.price || '';
      elid('p-desc').value  = p.description || '';
      elid('p-cat').value   = p.category || '';
      elid('p-badge').value = p.badges?.[0] || '';
      elid('p-active').checked = p.active !== false;
      elid('p-acai').checked   = !!p.allow_acai_addons;
      elid('p-img').value      = p.image_url || '';
      elid('p-img-url').value  = p.image_url || '';
      if (p.image_url) {
        elid('img-preview').src = p.image_url;
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
  if (!name)        return show('product-error', 'Informe o nome do produto.');
  if (isNaN(price)) return show('product-error', 'Informe um preço válido.');
  if (!cat)         return show('product-error', 'Selecione uma categoria.');

  const badge = elid('p-badge').value;
  const now   = new Date().toISOString();
  const data  = {
    name, price, category: cat,
    description:      elid('p-desc').value.trim(),
    image_url:        imgUrl,
    active:           elid('p-active').checked,
    allow_acai_addons: elid('p-acai').checked,
    badges:           badge ? [badge] : [],
    updated_at:       now,
  };

  const btn = elid('save-btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

  try {
    const existingId = elid('p-id').value;
    let err;
    if (existingId) {
      ({ error: err } = await getSb().from('products').update(data).eq('id', existingId));
      if (!err) toast('Produto atualizado!');
    } else {
      data.created_at = now;
      ({ error: err } = await getSb().from('products').insert(data));
      if (!err) toast('Produto cadastrado!');
    }
    if (err) throw err;
    closeProductForm();
    loadProducts();
  } catch (err) {
    show('product-error', 'Erro ao salvar: ' + (err.message || 'tente novamente.'));
    console.error(err);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Salvar produto';
  }
}

async function confirmDeleteProduct(id, name) {
  if (!confirm(`Excluir "${name}"? Esta ação não pode ser desfeita.`)) return;
  const { error } = await getSb().from('products').delete().eq('id', id);
  if (error) { toast('Erro ao excluir.', true); return; }
  toast('Produto excluído.');
  loadProducts();
}

/* ══════════════════════════════════════
   IMAGE UPLOAD (Supabase Storage)
══════════════════════════════════════ */
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
  status.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando imagem...';

  try {
    const url = await uploadProductImage(file);
    gs.uploadedUrl = url;
    elid('p-img').value     = url;
    elid('p-img-url').value = url;
    status.className = 'img-status success';
    status.innerHTML = '<i class="fas fa-check-circle"></i> Imagem enviada com sucesso!';
  } catch (err) {
    status.className = 'img-status error';
    status.innerHTML = '<i class="fas fa-exclamation-circle"></i> Erro ao enviar: ' + (err.message || 'verifique o bucket no Supabase.');
    console.error(err);
  }
}

async function uploadProductImage(file) {
  const ext      = file.name.split('.').pop().toLowerCase();
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const filePath = `produtos/${fileName}`;

  const { error } = await getSb().storage.from('products').upload(filePath, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;

  const { data } = getSb().storage.from('products').getPublicUrl(filePath);
  return data.publicUrl;
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
    const { data, error } = await getSb()
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw error;
    gs.orders = data || [];
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
  const date = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '—';
  const num  = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
  const items = Array.isArray(o.items) ? o.items : (typeof o.items === 'string' ? JSON.parse(o.items||'[]') : []);

  return `
    <div class="order-card ${stClass[o.status]||''}">
      <div class="order-hd">
        <div>
          <span class="order-num">#${esc(num)}</span>
          <span class="order-customer">${esc(o.customer_name||'Cliente')}</span>
        </div>
        <span class="order-status ${stClass[o.status]||''}">${statusLabels[o.status]||o.status}</span>
      </div>
      <div class="order-meta">
        <span><i class="fas fa-clock"></i> ${date}</span>
        <span><i class="fas fa-${o.delivery_type==='pickup'?'store':'motorcycle'}"></i> ${o.delivery_type==='pickup'?'Retirada':'Entrega'}</span>
        <span><i class="fas fa-tag"></i> R$ ${fmt(o.total)}</span>
        <span><i class="fas fa-credit-card"></i> ${esc(o.payment_method||'—')}</span>
      </div>
      <div class="order-items">${items.map(i=>`<span class="order-item-tag">${i.qty}x ${esc(i.name)}</span>`).join('')}</div>
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
  const { error } = await getSb().from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { toast('Erro ao atualizar status.', true); return; }
  toast('Status atualizado!');
  loadOrders();
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
  const today = new Date().toISOString().split('T')[0];
  const todayOrders  = gs.orders.filter(o => o.created_at?.startsWith(today));
  const openOrders   = gs.orders.filter(o => !['finalizado','cancelado'].includes(o.status));
  const todayRevenue = todayOrders.reduce((s, o) => s + Number(o.total||0), 0);

  elid('sv-hoje').textContent    = todayOrders.length;
  elid('sv-receita').textContent = 'R$ ' + fmt(todayRevenue);
  elid('sv-abertos').textContent = openOrders.length;
  elid('sv-total').textContent   = gs.orders.length;

  const salesList = elid('sales-list');
  salesList.innerHTML = gs.orders.length
    ? '<h3 style="margin-bottom:12px;font-size:.9rem;font-weight:700">Pedidos recentes</h3>' + gs.orders.slice(0,20).map(orderCard).join('')
    : '<p class="empty-msg">Nenhum pedido registrado ainda.</p>';
}

/* ══════════════════════════════════════
   CONFIG
══════════════════════════════════════ */
async function loadConfig() {
  try {
    const { data, error } = await getSb().from('store_settings').select('*').eq('id','store').single();
    if (error || !data) return;
    setv('cfg-wa',     data.whatsapp||'');
    setv('cfg-pix',    data.pix_key||'');
    setv('cfg-insta',  data.instagram||'');
    setv('cfg-hours',  typeof data.schedule === 'string' ? data.schedule : (data.schedule?.text||''));
    setv('cfg-km',     data.delivery_price_per_km||'');
    setv('cfg-factor', data.route_factor||'');
    setv('cfg-lat',    data.store_lat||'');
    setv('cfg-lon',    data.store_lon||'');
  } catch (e) { console.warn('Erro config:', e); }
}

async function handleSaveConfig(e) {
  e.preventDefault();
  const data = {
    id:                    'store',
    whatsapp:              getv('cfg-wa'),
    pix_key:               getv('cfg-pix'),
    instagram:             getv('cfg-insta'),
    schedule:              { text: getv('cfg-hours') },
    delivery_price_per_km: parseFloat(getv('cfg-km'))     || 2.5,
    route_factor:          parseFloat(getv('cfg-factor'))  || 1.4,
    store_lat:             parseFloat(getv('cfg-lat'))     || -26.74403627881803,
    store_lon:             parseFloat(getv('cfg-lon'))     || -48.83443849068592,
    updated_at:            new Date().toISOString(),
  };
  const { error } = await getSb().from('store_settings').upsert(data);
  if (error) { toast('Erro ao salvar: ' + error.message, true); return; }
  toast('Configurações salvas!');
}

/* ══════════════════════════════════════
   USER INFO
══════════════════════════════════════ */
function renderUserInfo() {
  const user = gs.currentUser;
  if (!user) return;
  const meta = user.user_metadata || {};
  elid('user-info-block').innerHTML = `
    <div class="user-info-row"><span>Nome</span><strong>${esc(meta.name||'—')}</strong></div>
    <div class="user-info-row"><span>E-mail</span><strong>${esc(user.email)}</strong></div>
    <div class="user-info-row"><span>ID</span><code>${user.id}</code></div>
    <div class="user-info-row"><span>Último acesso</span><strong>${new Date(user.last_sign_in_at||0).toLocaleString('pt-BR')}</strong></div>
    <div style="margin-top:16px">
      <button class="btn-secondary" onclick="sendPwdReset()"><i class="fas fa-key"></i> Redefinir senha</button>
    </div>`;
}

async function sendPwdReset() {
  const user = gs.currentUser;
  if (!user) return;
  const { error } = await getSb().auth.resetPasswordForEmail(user.email);
  if (error) { toast('Erro ao enviar e-mail.', true); return; }
  toast('E-mail de redefinição enviado!');
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
  btn.innerHTML = loading ? `<i class="fas fa-spinner fa-spin"></i> ${label}` : label;
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
  console.log('[Gestão] supabase-config.js carregado:', !!window.supabaseClient);

  /* Verifica se Supabase está inicializado */
  if (!window.supabaseClient) {
    show('login-error', '⚠️ Supabase não carregado. Verifique a ordem dos scripts e supabase-config.js');
    const btn = elid('login-btn');
    if (btn) btn.disabled = true;
    showView('login');
    return;
  }

  getSb().auth.onAuthStateChange((_event, session) => {
    if (session?.user) {
      gs.currentUser = session.user;
      showView('dashboard');
      elid('user-display').textContent = session.user.user_metadata?.name || session.user.email.split('@')[0];
      loadProducts();
      loadOrders();
    } else {
      gs.currentUser = null;
      showView('login');
    }
  });

  /* Verifica sessão existente */
  getSb().auth.getSession().then(({ data: { session } }) => {
    if (!session) showView('login');
  });
});

/* Expose for HTML onclick */
window.handleLogin             = handleLogin;
window.handleCreateAccount     = handleCreateAccount;
window.handleLogout            = handleLogout;
window.showView                = showView;
window.showSection             = showSection;
window.openSidebar             = openSidebar;
window.closeSidebar            = closeSidebar;
window.openProductForm         = openProductForm;
window.closeProductForm        = closeProductForm;
window.closeProductFormOutside = closeProductFormOutside;
window.handleSaveProduct       = handleSaveProduct;
window.handleImageSelect       = handleImageSelect;
window.syncImgUrl              = syncImgUrl;
window.filterProductList       = filterProductList;
window.confirmDeleteProduct    = confirmDeleteProduct;
window.filterOrders            = filterOrders;
window.updateOrderStatus       = updateOrderStatus;
window.handleSaveConfig               = handleSaveConfig;
window.togglePwd                      = togglePwd;
window.sendPwdReset                   = sendPwdReset;
window.importLocalProductsToSupabase  = importLocalProductsToSupabase;
