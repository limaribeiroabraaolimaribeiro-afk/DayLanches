'use strict';
/* ─────────────────────────────────────────
   Day Lanches — Gestão da loja
   Requer: Supabase JS v2, supabase-config.js
───────────────────────────────────────── */

function slugify(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

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
      try {
        await getSb().from('profiles').insert({ id: data.user.id, name, email, role: 'owner' });
      } catch(_) { /* perfil é opcional */ }
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
        local_id:          String(p.id || ''),
        display_order:     local.indexOf(p),
        slug:              p.slug || slugify(p.name || ''),
        featured:          !!p.featured,
        hero:              !!p.hero,
      });
      if (error) { console.error('Erro ao importar', p.name, error); errors++; }
      else imported++;
    } catch (e) { errors++; }
  }

  toast(`Importação concluída: ${imported} importados, ${skipped} já existiam${errors ? ', ' + errors + ' com erro' : ''}.`);
  await loadProducts();
}

async function syncLocalProductMetadata() {
  const btn = elid('btn-sync-meta');
  if (btn) { btn.disabled = true; btn.textContent = 'Sincronizando...'; }

  const local = (window.PRODUCTS_LOCAL || []).filter(p => !p.isAddon);
  if (!local.length) { toast('Nenhum produto local encontrado.', true); return; }

  let updated = 0, errors = 0;

  for (let index = 0; index < local.length; index++) {
    const p = local[index];
    try {
      const { error } = await getSb()
        .from('products')
        .update({
          local_id:      String(p.id || ''),
          display_order: index,
          slug:          p.slug || slugify(p.name || ''),
          badges:        p.badges || [],
          featured:      !!p.featured,
          hero:          !!p.hero,
        })
        .eq('name', p.name)
        .eq('category', p.cat);
      if (error) {
        console.error('Erro ao sincronizar', p.name, error);
        errors++;
      } else {
        updated++;
      }
    } catch (e) { errors++; }
  }

  if (btn) { btn.disabled = false; btn.textContent = 'Sincronizar ordem e destaques'; }

  if (errors > 0 && updated === 0) {
    toast('Erro ao sincronizar. Execute o SQL abaixo no Supabase primeiro:\nalter table products add column if not exists local_id text;\nalter table products add column if not exists display_order integer default 0;\nalter table products add column if not exists slug text;\nalter table products add column if not exists featured boolean default false;\nalter table products add column if not exists hero boolean default false;', true);
    return;
  }

  toast(`Sincronizado: ${updated} produtos${errors ? ', ' + errors + ' com erro' : ''}.`);
  await loadProducts();
}

/* ══════════════════════════════════════
   OPTION GROUPS — estado local do editor
══════════════════════════════════════ */
let _editGroups    = [];  /* grupos sendo editados */
let _delGroupIds   = [];  /* IDs de grupos marcados para deletar */

async function loadOptionGroupsForEdit(productId) {
  _editGroups  = [];
  _delGroupIds = [];
  if (!productId) { renderOptionGroupsUI(); return; }
  try {
    const { data, error } = await getSb()
      .from('product_option_groups')
      .select('*, product_option_items(*)')
      .eq('product_id', productId)
      .order('display_order');
    if (error) throw error;
    _editGroups = (data || []).map(g => ({
      id:          g.id,
      title:       g.title || '',
      type:        g.type || 'checkbox',
      required:    !!g.required,
      min_select:  g.min_select || 0,
      max_select:  g.max_select || 0,
      free_limit:  g.free_limit || 0,
      active:      g.active !== false,
      _deleted:    false,
      items:       (g.product_option_items || [])
        .sort((a,b) => a.display_order - b.display_order)
        .map(i => ({ id:i.id, name:i.name||'', price_delta:Number(i.price_delta||0), active:i.active!==false, _deleted:false })),
    }));
  } catch(e) {
    console.warn('Erro ao carregar grupos de opções:', e);
    _editGroups = [];
  }
  renderOptionGroupsUI();
}

function setGroupField(ri, field, value) {
  if (!_editGroups[ri]) return;
  _editGroups[ri][field] = value;
  renderOptionGroupsUI();
}

function renderOptionGroupsUI() {
  const container = elid('option-groups-list');
  if (!container) return;
  const active = _editGroups.filter(g => !g._deleted);
  if (!active.length) { container.innerHTML = ''; updateProductPreview(); return; }

  container.innerHTML = active.map(group => {
    const ri          = _editGroups.indexOf(group);
    const activeItems = group.items.filter(i => !i._deleted);
    const isCheck     = group.type === 'checkbox';
    const hasMax      = group.max_select > 0;
    const hasFree     = group.free_limit > 0;

    return `
      <div class="opt-choice-card">
        <!-- Título + Remover -->
        <div class="opt-choice-header">
          <div class="form-group" style="flex:1;margin:0">
            <label class="form-label">Título da escolha</label>
            <input class="form-input" placeholder="Ex: Adicionais, Deseja batata palha?" value="${esc(group.title)}"
              oninput="_editGroups[${ri}].title=this.value;updateProductPreview()">
          </div>
          <button type="button" class="opt-choice-remove" onclick="removeOptGroup(${ri})">
            <i class="fas fa-trash"></i> Remover
          </button>
        </div>

        <!-- Perguntas -->
        <div class="opt-choice-questions">

          <!-- Como o cliente escolhe? -->
          <div class="opt-q-row">
            <span class="opt-q-label">Como o cliente escolhe?</span>
            <div class="opt-q-options">
              <button type="button" class="opt-radio-pill${!isCheck ? ' selected' : ''}"
                onclick="setGroupField(${ri},'type','radio')">
                <i class="fas fa-dot-circle"></i> Apenas uma opção
              </button>
              <button type="button" class="opt-radio-pill${isCheck ? ' selected' : ''}"
                onclick="setGroupField(${ri},'type','checkbox')">
                <i class="fas fa-check-square"></i> Várias opções
              </button>
            </div>
          </div>

          <!-- Obrigatória? -->
          <div class="opt-q-row">
            <span class="opt-q-label">Essa escolha é obrigatória?</span>
            <div class="opt-q-options">
              <button type="button" class="opt-radio-pill${!group.required ? ' selected' : ''}"
                onclick="setGroupField(${ri},'required',false)">Não</button>
              <button type="button" class="opt-radio-pill${group.required ? ' selected' : ''}"
                onclick="setGroupField(${ri},'required',true)">Sim</button>
            </div>
          </div>

          ${isCheck ? `
          <!-- Tem limite? -->
          <div class="opt-q-row">
            <span class="opt-q-label">Tem limite de escolhas?</span>
            <div class="opt-q-options">
              <button type="button" class="opt-radio-pill${!hasMax ? ' selected' : ''}"
                onclick="setGroupField(${ri},'max_select',0)">Não</button>
              ${hasMax
                ? `<div class="opt-inline-row selected">
                    Sim, no máximo
                    <input type="number" class="opt-inline-num" min="1" max="99" value="${group.max_select}"
                      oninput="_editGroups[${ri}].max_select=Number(this.value)||1"
                      onclick="event.stopPropagation()">
                    opções
                  </div>`
                : `<button type="button" class="opt-radio-pill"
                    onclick="setGroupField(${ri},'max_select',2)">Sim, com limite</button>`}
            </div>
          </div>

          <!-- Opções grátis? -->
          <div class="opt-q-row">
            <span class="opt-q-label">Algumas opções são grátis?</span>
            <div class="opt-q-options">
              <button type="button" class="opt-radio-pill${!hasFree ? ' selected' : ''}"
                onclick="setGroupField(${ri},'free_limit',0)">Não</button>
              ${hasFree
                ? `<div class="opt-inline-row selected">
                    As primeiras
                    <input type="number" class="opt-inline-num" min="1" max="99" value="${group.free_limit}"
                      oninput="_editGroups[${ri}].free_limit=Number(this.value)||1"
                      onclick="event.stopPropagation()">
                    são grátis
                  </div>`
                : `<button type="button" class="opt-radio-pill"
                    onclick="setGroupField(${ri},'free_limit',3)">Sim, algumas são grátis</button>`}
            </div>
          </div>
          ` : ''}

        </div><!-- /opt-choice-questions -->

        <!-- Opções disponíveis -->
        <div class="opt-choice-items-section">
          <div class="opt-choice-items-hd">
            <span>Opções disponíveis</span>
            <small>nome &nbsp;|&nbsp; valor adicional</small>
          </div>
          <div class="opt-items-list">
            ${activeItems.map(item => {
              const ii = group.items.indexOf(item);
              const pv = item.price_delta > 0 ? String(item.price_delta.toFixed(2)).replace('.', ',') : '';
              return `<div class="opt-item-row">
                <input class="form-input" placeholder="Ex: Nutella, Bacon extra, Gelada…" value="${esc(item.name)}"
                  oninput="_editGroups[${ri}].items[${ii}].name=this.value;updateProductPreview()" style="flex:1;min-width:0">
                <div class="opt-item-price-wrap">
                  <span class="opt-price-prefix">+R$</span>
                  <input type="text" inputmode="decimal" class="form-input opt-price-input" placeholder="0,00" value="${pv}"
                    oninput="_editGroups[${ri}].items[${ii}].price_delta=parsePriceInput(this.value)">
                </div>
                <button type="button" class="opt-item-remove" onclick="removeOptItem(${ri},${ii})">
                  <i class="fas fa-times"></i>
                </button>
              </div>`;
            }).join('')}
          </div>
          <button type="button" class="btn-add-opt" onclick="addOptItem(${ri})">
            <i class="fas fa-plus"></i> Adicionar opção
          </button>
        </div>
      </div>`;
  }).join('');
  updateProductPreview();
}

function addOptGroup() {
  _editGroups.push({ id:null, title:'', type:'checkbox', required:false, min_select:0, max_select:0, free_limit:0, active:true, _deleted:false, items:[] });
  renderOptionGroupsUI();
}
function removeOptGroup(ri) {
  const g = _editGroups[ri];
  if (!g) return;
  if (g.id) { g._deleted=true; _delGroupIds.push(g.id); }
  else _editGroups.splice(ri, 1);
  renderOptionGroupsUI();
}
function addOptItem(ri) {
  _editGroups[ri]?.items.push({ id:null, name:'', price_delta:0, active:true, _deleted:false });
  renderOptionGroupsUI();
}
function removeOptItem(ri, ii) {
  const item = _editGroups[ri]?.items[ii];
  if (!item) return;
  if (item.id) item._deleted = true;
  else _editGroups[ri].items.splice(ii, 1);
  renderOptionGroupsUI();
}

function parsePriceInput(value) {
  if (typeof value === 'number') return value;
  return Number(String(value || '0').replace('R$','').replace(/\./g,'').replace(',','.').trim()) || 0;
}

async function saveOptionGroups(productId) {
  if (!productId) throw new Error('ID do produto ausente ao salvar escolhas.');
  const db  = getSb();
  const now = new Date().toISOString();

  /* Apaga todos os grupos existentes — CASCADE remove os itens automaticamente */
  const { error: delErr } = await db
    .from('product_option_groups')
    .delete()
    .eq('product_id', productId);
  if (delErr) throw delErr;

  /* Re-insere grupos e itens ativos */
  const activeGroups = _editGroups.filter(g => !g._deleted && (g.title || '').trim());
  for (let gi = 0; gi < activeGroups.length; gi++) {
    const g = activeGroups[gi];
    const activeItems = g.items.filter(i => !i._deleted && (i.name || '').trim());

    const { data: newGroup, error: gErr } = await db
      .from('product_option_groups')
      .insert({
        product_id:    productId,
        title:         g.title.trim(),
        type:          g.type || 'checkbox',
        required:      !!g.required,
        min_select:    Number(g.min_select || 0),
        max_select:    Number(g.max_select || 0),
        free_limit:    Number(g.free_limit || 0),
        active:        g.active !== false,
        display_order: gi,
        created_at:    now,
        updated_at:    now,
      })
      .select('id')
      .single();
    if (gErr) throw gErr;

    if (!activeItems.length) continue;

    const itemsPayload = activeItems.map((it, ii) => ({
      group_id:      newGroup.id,
      name:          it.name.trim(),
      price_delta:   parsePriceInput(it.price_delta),
      active:        it.active !== false,
      display_order: ii,
      created_at:    now,
      updated_at:    now,
    }));

    const { error: iErr } = await db.from('product_option_items').insert(itemsPayload);
    if (iErr) throw iErr;
  }
}

async function createAcaiDefaultOptions() {
  const db = getSb();
  const btn = elid('btn-acai-defaults');
  if (btn) { btn.disabled=true; btn.textContent='Criando...'; }

  const ADDONS = [
    {name:'Chocolate branco',price_delta:5},{name:'Chocolate preto',price_delta:5},
    {name:'Chocolate branco com OREO',price_delta:5},{name:'Morango',price_delta:5},
    {name:'Nutella',price_delta:5},{name:'M&Ms',price_delta:5},
    {name:'Granola',price_delta:5},{name:'Paçoca',price_delta:5},
  ];

  const defs = [
    { name:'Açaí 300ml',    title:'Adicionais', free_limit:0 },
    { name:'Açaí 500ml',    title:'Adicionais', free_limit:0 },
    { name:'Combo Açaí 500ml', title:'Escolha até 3 adicionais grátis', free_limit:3 },
  ];

  let created=0, skipped=0;
  const now = new Date().toISOString();

  for (const def of defs) {
    const { data:prods } = await db.from('products').select('id').eq('name', def.name).limit(1);
    if (!prods?.length) { skipped++; continue; }
    const pid = prods[0].id;
    const { data:existing } = await db.from('product_option_groups').select('id').eq('product_id', pid).eq('title', def.title).maybeSingle();
    if (existing) { skipped++; continue; }
    const { data:newG, error:gErr } = await db.from('product_option_groups').insert({
      product_id:pid, title:def.title, type:'checkbox', required:false,
      min_select:0, max_select:0, free_limit:def.free_limit, active:true, display_order:0, created_at:now, updated_at:now,
    }).select('id').single();
    if (gErr || !newG) { skipped++; continue; }
    for (let i=0; i<ADDONS.length; i++) {
      await db.from('product_option_items').insert({ group_id:newG.id, name:ADDONS[i].name, price_delta:ADDONS[i].price_delta, active:true, display_order:i, created_at:now, updated_at:now });
    }
    created++;
  }

  if (btn) { btn.disabled=false; btn.textContent='Criar escolhas padrão do Açaí'; }
  toast(`Açaí: ${created} grupos criados, ${skipped} já existiam ou não encontrados.`);
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

async function openProductForm(id) {
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

  /* Update save button label */
  const saveLabel = elid('save-btn-label');
  if (saveLabel) saveLabel.textContent = id ? 'Salvar alterações' : 'Salvar produto';

  /* Price with comma for text input */
  if (id) {
    const p2 = gs.products.find(x => x.id === id);
    if (p2 && p2.price != null) {
      const pe = elid('p-price');
      if (pe) pe.value = String(Number(p2.price).toFixed(2)).replace('.', ',');
    }
  }

  elid('product-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  updateProductPreview();
  await loadOptionGroupsForEdit(id || null);
}

function closeProductForm() {
  elid('product-overlay').style.display = 'none';
  document.body.style.overflow = '';
  _editGroups  = [];
  _delGroupIds = [];
}

function closeProductFormOutside(e) {
  if (e.target === elid('product-overlay')) closeProductForm();
}

async function handleSaveProduct(e) {
  e.preventDefault();
  const imgUrl = gs.uploadedUrl || elid('p-img').value || elid('p-img-url').value || '';
  const name   = elid('p-name').value.trim();
  const price  = parsePriceInput(elid('p-price').value);
  const cat    = elid('p-cat').value;

  hide('product-error');
  if (!name)        return show('product-error', 'Informe o nome do produto.');
  if (!price || price <= 0) return show('product-error', 'Informe um preço válido.');
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
    let savedProductId = existingId;
    if (existingId) {
      ({ error: err } = await getSb().from('products').update(data).eq('id', existingId));
      if (!err) toast('Produto atualizado!');
    } else {
      data.created_at = now;
      const { data: inserted, error: insertErr } = await getSb().from('products').insert(data).select('id').single();
      err = insertErr;
      if (!err) { savedProductId = inserted?.id; toast('Produto cadastrado!'); }
    }
    if (err) throw err;
    if (savedProductId) await saveOptionGroups(savedProductId);
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
    elid('ppc-img') && (elid('ppc-img').src = ev.target.result) && (elid('ppc-img').style.display = 'block');
    elid('ppc-ph')  && (elid('ppc-ph').style.display = 'none');
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
  updateProductPreview();
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
  let list = gs.orderFilter === 'all'
    ? gs.orders
    : gs.orders.filter(o => o.status === gs.orderFilter);

  const q = (elid('orders-search')?.value || '').trim().toLowerCase();
  if (q) {
    list = list.filter(o =>
      (o.order_number||'').toLowerCase().includes(q) ||
      (o.customer_name||'').toLowerCase().includes(q) ||
      (o.customer_phone||'').toLowerCase().includes(q)
    );
  }

  updateOrderFilterCounts();

  if (!list.length) {
    wrap.innerHTML = '<p class="empty-msg">Nenhum pedido encontrado.</p>';
    return;
  }
  wrap.innerHTML = list.map(orderCard).join('');
}

function updateOrderFilterCounts() {
  const keys = ['all','novo','em_preparo','saiu_para_entrega','finalizado','cancelado'];
  keys.forEach(k => {
    const el = elid(`filter-count-${k}`);
    if (!el) return;
    const n = k === 'all' ? gs.orders.length : gs.orders.filter(o => o.status === k).length;
    el.textContent = n > 0 ? `(${n})` : '';
  });
}

function toggleOrderDetails(orderId) {
  const det = elid(`ocdet-${orderId}`);
  const btn = elid(`ocdet-btn-${orderId}`);
  if (!det) return;
  const open = det.style.display !== 'none';
  det.style.display = open ? 'none' : 'block';
  if (btn) btn.innerHTML = open
    ? '<i class="fas fa-chevron-down"></i> Ver detalhes'
    : '<i class="fas fa-chevron-up"></i> Ocultar detalhes';
}

function confirmCancelOrder(id) {
  if (confirm('Cancelar este pedido?')) updateOrderStatus(id, 'cancelado');
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
  const payLabels = { pix:'PIX', pix_online:'PIX', card:'Cartão', card_online:'Cartão', cash:'Dinheiro', online:'Online' };

  /* Após webhook: resolve label a partir do capture_method da InfinitePay */
  function resolvePayLabel(order) {
    if (order.payment_status === 'pago' && order.capture_method) {
      const cm = String(order.capture_method).toLowerCase();
      if (cm.includes('pix'))            return 'PIX';
      if (cm.includes('credit') || cm.includes('debit') || cm.includes('card') || cm.includes('cartao') || cm.includes('credito') || cm.includes('debito')) return 'Cartão';
      return 'Online confirmado';
    }
    return payLabels[order.payment_method] || esc(order.payment_method || '—');
  }
  const payStatusLabel = {
    aguardando_pagamento: { text:'Aguardando pag.', cls:'ps-waiting' },
    aguardando_comprovante: { text:'Aguardando comprovante', cls:'ps-waiting' },
    checkout_criado:      { text:'Checkout criado', cls:'ps-created' },
    pago:                 { text:'Pago ✓', cls:'ps-paid' },
    pagamento_na_entrega: { text:'Na entrega', cls:'ps-delivery' },
    cancelado:            { text:'Cancelado', cls:'ps-cancelled' },
  };
  const psInfo = payStatusLabel[o.payment_status] || null;
  const date  = o.created_at ? new Date(o.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) + ' — ' + new Date(o.created_at).toLocaleDateString('pt-BR') : '—';
  const num   = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
  const items = Array.isArray(o.items) ? o.items : (typeof o.items === 'string' ? JSON.parse(o.items||'[]') : []);
  const loc   = o.location && typeof o.location === 'object' ? o.location : null;
  const phone = (o.customer_phone || '').replace(/\D/g, '');
  const waLink = phone ? `https://wa.me/55${phone}` : '';
  const hasOpts = items.some(i => (i.options||[]).length > 0);

  return `
    <div class="oc ${stClass[o.status]||''}">

      <!-- CABEÇALHO -->
      <div class="oc-head">
        <div class="oc-head-left">
          <span class="oc-num">#${esc(num)}</span>
          <span class="oc-date">${date}</span>
        </div>
        <span class="oc-badge ${stClass[o.status]||''}">${statusLabels[o.status]||o.status}</span>
      </div>

      <!-- GRID DE INFORMAÇÕES -->
      <div class="oc-grid">
        <div class="oc-field">
          <span class="oc-field-label">Cliente</span>
          <span class="oc-field-value">${esc(o.customer_name||'—')}</span>
        </div>
        <div class="oc-field">
          <span class="oc-field-label">Telefone</span>
          <span class="oc-field-value">${o.customer_phone ? esc(o.customer_phone) : '<span class="oc-no-info">Não informado</span>'}</span>
        </div>
        <div class="oc-field">
          <span class="oc-field-label">Entrega</span>
          <span class="oc-field-value"><i class="fas fa-${o.delivery_type==='pickup'?'store':'motorcycle'}" style="color:var(--primary)"></i> ${o.delivery_type==='pickup'?'Retirada':'Entrega'}</span>
        </div>
        <div class="oc-field">
          <span class="oc-field-label">Pagamento</span>
          <span class="oc-field-value">${resolvePayLabel(o)}${o.troco?` <small class="oc-troco">troco p/ R$ ${esc(String(o.troco))}</small>`:''}</span>
        </div>
        <div class="oc-field">
          <span class="oc-field-label">Status pagamento</span>
          <span class="oc-field-value">${psInfo?`<span class="oc-ps-badge ${psInfo.cls}">${psInfo.text}</span>`:'<span class="oc-no-info">—</span>'}</span>
        </div>
        <div class="oc-field">
          <span class="oc-field-label">Total</span>
          <span class="oc-field-value oc-total-val">R$ ${fmt(o.total||0)}</span>
        </div>
        <div class="oc-field">
          <span class="oc-field-label">Localização</span>
          <span class="oc-field-value">${loc ? '<span class="oc-loc-yes"><i class="fas fa-location-dot"></i> Enviada</span>' : '<span class="oc-no-info">Não enviada</span>'}</span>
        </div>
      </div>

      <!-- RESUMO DOS ITENS -->
      <div class="oc-items-summary">
        <span class="oc-items-label">${items.length} ${items.length===1?'produto':'produtos'}${hasOpts?' · contém adicionais':''}</span>
        <div class="oc-items-list">
          ${items.map(i=>`<span class="oc-item-line">${i.qty}x ${esc(i.name)}</span>`).join('')}
        </div>
      </div>

      <!-- DETALHES EXPANSÍVEIS -->
      <div class="oc-details" id="ocdet-${o.id}" style="display:none">

        <div class="oc-det-section">
          <h4 class="oc-det-title"><i class="fas fa-list-ul"></i> Produtos</h4>
          ${items.map(i => {
            const opts = (i.options||[]);
            const total = i.total || (i.finalUnitPrice||i.unitPrice||0)*i.qty || 0;
            return `<div class="oc-det-item">
              <div class="oc-det-item-main">
                <span class="oc-det-item-name">${i.qty}x ${esc(i.name)}</span>
                <span class="oc-det-item-price">R$ ${fmt(total)}</span>
              </div>
              ${opts.map(og=>`<div class="oc-det-opt"><span class="oc-det-opt-group">${esc(og.groupTitle)}:</span> ${(og.items||[]).map(oi=>esc(oi.name)).join(', ')}</div>`).join('')}
            </div>`;
          }).join('')}
        </div>

        <div class="oc-det-section">
          <h4 class="oc-det-title"><i class="fas fa-receipt"></i> Resumo financeiro</h4>
          <div class="oc-finance">
            <span>Subtotal</span><span>R$ ${fmt(o.subtotal||0)}</span>
            <span>Frete</span><span>${(o.delivery_fee||0)>0?`R$ ${fmt(o.delivery_fee)}`:'Grátis'}</span>
            ${o.troco?`<span>Troco para</span><span>R$ ${esc(String(o.troco))}</span>`:''}
            <span class="oc-finance-bold">Total</span><span class="oc-finance-bold">R$ ${fmt(o.total||0)}</span>
          </div>
        </div>

        ${o.notes?`<div class="oc-det-section"><h4 class="oc-det-title"><i class="fas fa-comment-dots"></i> Observação</h4><p class="oc-obs">${esc(o.notes)}</p></div>`:''}

        ${loc?`<div class="oc-det-section">
          <h4 class="oc-det-title"><i class="fas fa-map-location-dot"></i> Localização</h4>
          <div class="oc-loc-btns">
            ${loc.mapsLink  ?`<a class="btn-oc-map"   href="${esc(loc.mapsLink)}"  target="_blank" rel="noopener"><i class="fas fa-map-location-dot"></i> Ver localização</a>`:''}
            ${loc.routeLink ?`<a class="btn-oc-route" href="${esc(loc.routeLink)}" target="_blank" rel="noopener"><i class="fas fa-route"></i> Abrir rota</a>`:''}
          </div>
        </div>`:''}

        <!-- Ações dos detalhes -->
        <div class="oc-det-actions">
          ${waLink?`<a class="btn-oc-wapp" href="${waLink}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> Chamar cliente</a>`:''}
          <button class="btn-oc-copy" onclick="copyOrderText('${o.id}')"><i class="fas fa-copy"></i> Copiar pedido</button>
          ${o.receipt_url?`<a class="btn-oc-receipt" href="${esc(o.receipt_url)}" target="_blank" rel="noopener"><i class="fas fa-file-invoice"></i> Ver comprovante</a>`:''}
          ${!['finalizado','cancelado'].includes(o.status)?`<button class="btn-oc-cancel" onclick="confirmCancelOrder('${o.id}')"><i class="fas fa-times"></i> Cancelar pedido</button>`:''}
        </div>
      </div>

      <!-- RODAPÉ: ver detalhes + avançar status -->
      <div class="oc-footer">
        <button class="btn-oc-toggle" id="ocdet-btn-${o.id}" onclick="toggleOrderDetails('${o.id}')">
          <i class="fas fa-chevron-down"></i> Ver detalhes
        </button>
        <div class="oc-status-btns">${statusBtns(o)}</div>
      </div>

    </div>`;
}

function copyOrderText(orderId) {
  const o = gs.orders.find(x => x.id === orderId);
  if (!o) return;
  const items = Array.isArray(o.items) ? o.items : [];
  const payLabels = { pix:'PIX', pix_online:'PIX', card:'Cartão', card_online:'Cartão', cash:'Dinheiro', online:'Online' };
  /* Após webhook usa capture_method */
  const payDisplay = (() => {
    if (o.payment_status === 'pago' && o.capture_method) {
      const cm = String(o.capture_method).toLowerCase();
      if (cm.includes('pix')) return 'PIX';
      if (cm.includes('credit') || cm.includes('debit') || cm.includes('card') || cm.includes('cartao') || cm.includes('credito') || cm.includes('debito')) return 'Cartão';
      return 'Online confirmado';
    }
    return payLabels[o.payment_method] || o.payment_method || '—';
  })();
  const loc = o.location && typeof o.location === 'object' ? o.location : null;
  const num = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
  const lines = [
    `Pedido: ${num}`,
    `Nome: ${o.customer_name||'—'}`,
    `Telefone: ${o.customer_phone||'—'}`,
    `Tipo: ${o.delivery_type==='pickup'?'Retirada':'Entrega'}`,
    `Pagamento: ${payDisplay}`,
    o.troco ? `Troco para: R$ ${o.troco}` : null,
    `Subtotal: R$ ${fmt(o.subtotal||0)}`,
    `Frete: R$ ${fmt(o.delivery_fee||0)}`,
    `Total: R$ ${fmt(o.total||0)}`,
    '',
    ...items.map(i => {
      const opts = (i.options||[]).map(og=>`  ${og.groupTitle}: ${(og.items||[]).map(oi=>oi.name).join(', ')}`).join('\n');
      return `• ${i.qty}x ${i.name} — R$ ${fmt(i.total||0)}${opts?'\n'+opts:''}`;
    }),
    o.notes ? `\nObs: ${o.notes}` : null,
    loc?.mapsLink ? `\nLocalização: ${loc.mapsLink}` : null,
  ].filter(v => v !== null).join('\n');

  navigator.clipboard.writeText(lines).then(() => toast('Pedido copiado!')).catch(() => toast('Erro ao copiar.', true));
}

function statusBtns(o) {
  const forward = { novo:'em_preparo', em_preparo:'saiu_para_entrega', saiu_para_entrega:'finalizado' };
  const label   = { em_preparo:'Em preparo', saiu_para_entrega:'Saiu p/ entrega', finalizado:'Finalizado' };
  const next = forward[o.status];
  if (!next) return '';
  return `<button class="btn-oc-status btn-oc-status-${next}" onclick="updateOrderStatus('${o.id}','${next}')">
    <i class="fas fa-arrow-right"></i> ${label[next]}
  </button>`;
}

/* mantido para compatibilidade interna */
function nextStatusBtns(o) { return statusBtns(o); }

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
  const inp = elid('orders-search');
  if (inp) inp.value = '';
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

/* ══════════════════════════════════════
   PREVIEW + TEMPLATE
══════════════════════════════════════ */
function productFormHasOptions() {
  return _editGroups.some(g => {
    if (g._deleted) return false;
    const hasTitle = g.title && g.title.trim();
    const hasItems = Array.isArray(g.items) && g.items.some(i => !i._deleted && i.name && i.name.trim());
    return hasTitle && hasItems;
  });
}

function updateProductPreview() {
  const name  = (elid('p-name')?.value || '').trim();
  const desc  = (elid('p-desc')?.value || '').trim();
  const price = parsePriceInput(elid('p-price')?.value || '0');
  const badge = elid('p-badge')?.value || '';
  const img   = elid('p-img')?.value || '';

  const badgeLabels = { mais:'Mais pedido', novo:'Novo', dest:'Destaque', combo:'Combo', promo:'Promoção' };

  const setTxt = (id, v) => { const e = elid(id); if (e) e.textContent = v; };
  setTxt('ppc-name',  name  || 'Nome do produto');
  setTxt('ppc-desc',  desc  || 'Descrição aparece aqui');
  setTxt('ppc-price', price > 0 ? `R$ ${fmt(price)}` : 'R$ —');

  const ppcBadge = elid('ppc-badge');
  if (ppcBadge) {
    if (badge && badgeLabels[badge]) {
      ppcBadge.textContent    = badgeLabels[badge];
      ppcBadge.style.display  = 'block';
      ppcBadge.className      = `ppc-badge`;
    } else {
      ppcBadge.style.display  = 'none';
    }
  }

  const ppcImg = elid('ppc-img');
  const ppcPh  = elid('ppc-ph');
  if (ppcImg && ppcPh) {
    if (img) { ppcImg.src = img; ppcImg.style.display = 'block'; ppcPh.style.display = 'none'; }
    else     { ppcImg.style.display = 'none'; ppcPh.style.display = 'flex'; }
  }

  const pricePreview = elid('pf-price-preview');
  const priceVal     = elid('pf-price-val');
  if (pricePreview) {
    if (price > 0) {
      if (priceVal) priceVal.textContent = `R$ ${fmt(price)}`;
      pricePreview.style.display = 'block';
    } else {
      pricePreview.style.display = 'none';
    }
  }

  const ppcBtn = elid('ppc-add-btn');
  if (ppcBtn) {
    ppcBtn.innerHTML = productFormHasOptions()
      ? '<i class="fa-solid fa-sliders"></i> Escolher'
      : '<i class="fa-solid fa-cart-shopping"></i> Adicionar';
  }
}

function applyProductTemplate(type) {
  if (!type) return;
  const sel = elid('p-template');
  if (sel) setTimeout(() => { sel.value = ''; }, 300);

  const makeItem = (name, price) => ({ id:null, name, price_delta:price, active:true, _deleted:false });
  const ACAI = [
    'Chocolate branco','Chocolate preto','Chocolate branco com OREO',
    'Morango','Nutella','M&Ms','Granola','Paçoca',
  ].map(n => makeItem(n, 5));

  if (type === 'acai-paid') {
    _editGroups.push({ id:null, title:'Adicionais', type:'checkbox', required:false, min_select:0, max_select:0, free_limit:0, active:true, _deleted:false, items:[...ACAI] });
  } else if (type === 'acai-combo') {
    _editGroups.push({ id:null, title:'Escolha até 3 adicionais grátis', type:'checkbox', required:false, min_select:0, max_select:0, free_limit:3, active:true, _deleted:false, items:[...ACAI] });
  } else if (type === 'burger-extras') {
    _editGroups.push({ id:null, title:'Deseja batata palha?', type:'radio', required:false, min_select:0, max_select:1, free_limit:0, active:true, _deleted:false, items:[makeItem('Com batata palha',0), makeItem('Sem batata palha',0)] });
    _editGroups.push({ id:null, title:'Extras', type:'checkbox', required:false, min_select:0, max_select:0, free_limit:0, active:true, _deleted:false, items:[makeItem('Bacon extra',5), makeItem('Cheddar extra',4), makeItem('Ovo',3)] });
  } else if (type === 'drink-temp') {
    _editGroups.push({ id:null, title:'Como prefere a bebida?', type:'radio', required:false, min_select:0, max_select:1, free_limit:0, active:true, _deleted:false, items:[makeItem('Gelada',0), makeItem('Natural',0)] });
  }

  renderOptionGroupsUI();
  toast('Modelo aplicado! Você pode editar ou adicionar mais opções.');
}

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
window.syncLocalProductMetadata       = syncLocalProductMetadata;
window.setGroupField                  = setGroupField;
window.addOptGroup                    = addOptGroup;
window.removeOptGroup                 = removeOptGroup;
window.addOptItem                     = addOptItem;
window.removeOptItem                  = removeOptItem;
window.createAcaiDefaultOptions       = createAcaiDefaultOptions;
window.updateProductPreview           = updateProductPreview;
window.applyProductTemplate           = applyProductTemplate;
window.copyOrderText                  = copyOrderText;
window.toggleOrderDetails             = toggleOrderDetails;
window.confirmCancelOrder             = confirmCancelOrder;
window.renderOrders                   = renderOrders;
