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
  storeConfig: null,
  soundEnabled: false,
  audioCtx: null,
  seenOrderIds: new Set(),
  newOrderIds: new Set(),
  seenOrdersInitialized: false,
  pollingStarted: false,
  printedOrderIds: new Set(),
  autoPrintEnabled: false,
  salesFilter: { type: 'today', month: '', year: '', start: '', end: '' },
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
  const code  = v('create-code').trim();

  hide('create-error');
  if (!code)          return show('create-error', 'Digite o código de segurança da loja.');
  if (pwd !== pwd2)   return show('create-error', 'As senhas não coincidem.');
  if (pwd.length < 6) return show('create-error', 'Senha precisa ter ao menos 6 caracteres.');

  setLoading('create-btn', true, 'Criando...');

  try {
    const { data: codeOk, error: codeError } = await getSb().rpc('validate_admin_activation_code', {
      input_code: code.trim()
    });
    if (codeError) {
      console.error('[Gestão] Erro ao validar código:', codeError);
      show('create-error', 'Não foi possível validar o código.');
      return;
    }
    if (codeOk !== true) {
      show('create-error', 'Código de segurança inválido.');
      return;
    }

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

    try {
      await getSb().rpc('consume_admin_activation_code', { input_code: code, input_email: email });
    } catch(_) { /* não bloqueia a criação se a marcação falhar */ }

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
  const titles = { produtos:'Produtos', pedidos:'Pedidos', vendas:'Vendas', balcao:'Balcão', relatorios:'Relatórios', config:'Configurações', acessos:'Acessos' };
  elid('dash-title').textContent = titles[name] || name;
  document.body.classList.toggle('is-balcao', name === 'balcao');
  gs.section = name;
  if (name === 'vendas')      renderSales();
  if (name === 'config')      loadConfig();
  if (name === 'acessos')     renderUserInfo();
  if (name === 'pedidos')     loadOrders();
  if (name === 'balcao')      pdvInit();
  if (name === 'relatorios')  initReports();
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
  pdvLoadProductOptions();
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
    <table class="data-table products-table">
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
              ? `<button class="btn-icon-sm btn-edit" onclick="openProductForm('${p.id}')"><i class="fas fa-pen"></i><span class="btn-label"> Editar</span></button>
                 <button class="btn-icon-sm btn-del"  onclick="confirmDeleteProduct('${p.id}','${esc(p._name)}')"><i class="fas fa-trash"></i><span class="btn-label"> Excluir</span></button>`
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
      if (!err) {
        showToast('Produto salvo com sucesso.', 'success');
        logAuditAction('edit_product', 'product', existingId, name, null, { price, category: cat });
      }
    } else {
      data.created_at = now;
      const { data: inserted, error: insertErr } = await getSb().from('products').insert(data).select('id').single();
      err = insertErr;
      if (!err) {
        savedProductId = inserted?.id;
        showToast('Produto salvo com sucesso.', 'success');
        logAuditAction('create_product', 'product', savedProductId, name, null, { price, category: cat });
      }
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
  const confirmed = await showConfirmModal({
    title: 'Excluir produto?',
    message: `Tem certeza que deseja excluir <strong>"${esc(name)}"</strong>?<br>Essa ação é permanente e não poderá ser desfeita.`,
    confirmText: 'Excluir produto',
    cancelText: 'Cancelar',
    danger: true,
  });

  console.log('[Gestão] confirmação exclusão:', confirmed);
  if (!confirmed) return;

  console.log('[Gestão] excluindo produto:', id, name);
  const { error } = await getSb().from('products').delete().eq('id', id);
  if (error) { showToast('Não foi possível excluir o produto. Tente novamente.', 'error'); return; }
  showToast('Produto excluído com sucesso.', 'success');
  logAuditAction('delete_product', 'product', id, name);
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
      .limit(500);
    if (error) throw error;
    gs.orders = data || [];
    gs.orders.forEach(o => { if (o.printed_at) gs.printedOrderIds.add(o.id); });
  } catch (e) {
    gs.orders = [];
    console.warn('[Gestão] Erro ao carregar pedidos:', { message: e?.message, details: e?.details, hint: e?.hint, code: e?.code, full: e });
  }
  renderOrders();
}

function setOrdersLoading(isLoading) {
  const btn   = elid('refresh-orders-btn');
  const label = elid('refresh-orders-label');
  if (!btn) return;
  btn.disabled = isLoading;
  if (label) label.textContent = isLoading ? 'Atualizando...' : 'Atualizar';
  btn.classList.toggle('is-loading', isLoading);
}

async function refreshOrders() {
  console.log('[Gestão] Atualizando pedidos...');
  try {
    setOrdersLoading(true);
    await loadOrders();
    toast('Pedidos atualizados com sucesso.');
  } catch (error) {
    console.error('[Gestão] Erro ao atualizar pedidos:', error);
    toast('Não foi possível atualizar os pedidos.', true);
  } finally {
    setOrdersLoading(false);
  }
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
  /* Footer toggle: visível quando colapsado, escondido quando expandido */
  if (btn) {
    btn.style.display = open ? '' : 'none';
    if (open) btn.innerHTML = '<i class="fas fa-chevron-down"></i> Ver detalhes';
  }
}

async function confirmCancelOrder(id) {
  const reason = await openCancelReasonModal(id);
  if (!reason) return;

  const actor = getCurrentActor();
  const now = new Date().toISOString();
  const o = gs.orders.find(x => x.id === id);
  const num = o?.order_number || id?.slice(-8).toUpperCase() || '';

  const { error } = await getSb().from('orders').update({
    status: 'cancelado',
    cancelled_at: now,
    cancelled_by_user_id: actor.id,
    cancelled_by_email: actor.email,
    cancel_reason: reason,
    updated_at: now,
  }).eq('id', id);

  if (error) { toast('Erro ao cancelar pedido.', true); return; }
  toast('Pedido cancelado.');
  logAuditAction('cancel_order', 'order', id, `#${num}`, reason);
  await loadOrders();
  if (pdv.initialized) pdvRenderMesas();
}

function buildCallCustomerMessage(o) {
  const num = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
  const lines = [
    'Olá, tudo certo? Aqui é da Day Lanches.',
    `Recebemos seu pedido #${num}.`,
  ];
  if (o.tracking_token) {
    lines.push('', 'Se quiser acompanhar seu pedido, acesse:', `https://www.daylanches.com.br/acompanhar.html?token=${o.tracking_token}`);
  }
  return lines.join('\n');
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
  const payLabels = { pix:'PIX', pix_online:'PIX', card:'Cartão', card_online:'Cartão', cash:'Dinheiro', online:'Online', dinheiro:'Dinheiro', pix_loja:'Pix na loja', cartao_maquininha:'Cartão maquininha', a_definir:'A definir' };

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
  const phone   = (o.customer_phone || '').replace(/\D/g, '');
  const waPhone = (phone.startsWith('55') && phone.length >= 12) ? phone : '55' + phone;
  const waLink  = phone ? `https://wa.me/${waPhone}?text=${encodeURIComponent(buildCallCustomerMessage(o))}` : '';
  const hasOpts = items.some(i => (i.options||[]).length > 0);
  const isBalcao = o.order_source === 'balcao' || o.delivery_type === 'balcao';

  return `
    <div class="oc ${stClass[o.status]||''}${gs.newOrderIds.has(o.id)?' oc-new':''}">

      <!-- CABEÇALHO -->
      <div class="oc-head">
        <div class="oc-head-left">
          <span class="oc-num">#${esc(num)}</span>
          ${isBalcao ? `<span class="oc-source-badge"><i class="fas fa-cash-register"></i> Balcão</span>${o.table_number ? `<span class="oc-mesa-badge"><i class="fas fa-chair"></i> Mesa ${o.table_number}</span>` : ''}` : ''}
          <span class="oc-date">${date}</span>
          ${(o.printed_at || gs.printedOrderIds.has(o.id)) ? '<span class="oc-printed-badge"><i class="fas fa-check"></i> Comanda impressa</span>' : ''}
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
          <span class="oc-field-value"><i class="fas fa-${isBalcao?'cash-register':o.delivery_type==='pickup'?'store':'motorcycle'}" style="color:var(--primary)"></i> ${isBalcao?(o.table_number?`Mesa ${o.table_number}`:'Balcão / Presencial'):o.delivery_type==='pickup'?'Retirada':'Entrega'}</span>
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
      </div>

      <!-- DETALHES EXPANSÍVEIS -->
      <div class="oc-details" id="ocdet-${o.id}" style="display:none">
        <div class="order-expanded-body">
          <div class="order-details-compact-grid">

            <div class="order-detail-box">
              <div class="order-detail-box-title"><i class="fas fa-list-ul"></i> Produtos</div>
              <div class="order-products-list">
                ${items.map(i => {
                  const opts = (i.options||[]);
                  const total = i.total || (i.finalUnitPrice||i.unitPrice||0)*i.qty || 0;
                  return `<div class="order-product-row">
                    <span class="order-product-name">${i.qty}x ${esc(i.name)}${opts.length?`<div class="order-product-opts">${opts.map(og=>`<span class="oc-det-opt"><span class="oc-det-opt-group">${esc(og.groupTitle)}:</span> ${(og.items||[]).map(oi=>esc(oi.name)).join(', ')}</span>`).join('')}</div>`:''}</span>
                    <span class="order-product-price">R$ ${fmt(total)}</span>
                  </div>`;
                }).join('')}
              </div>
              ${o.notes?`<p class="oc-obs order-obs-inline">${esc(o.notes)}</p>`:''}
            </div>

            <div class="order-detail-box">
              <div class="order-detail-box-title"><i class="fas fa-receipt"></i> Resumo financeiro</div>
              <div class="order-financial-list">
                <div class="order-financial-row">
                  <span class="order-financial-label">Subtotal</span>
                  <span class="order-financial-value">R$ ${fmt(o.subtotal||0)}</span>
                </div>
                <div class="order-financial-row">
                  <span class="order-financial-label">Frete</span>
                  <span class="order-financial-value">${(o.delivery_fee||0)>0?`R$ ${fmt(o.delivery_fee)}`:'Grátis'}</span>
                </div>
                ${o.troco?`<div class="order-financial-row">
                  <span class="order-financial-label">Troco para</span>
                  <span class="order-financial-value">R$ ${esc(String(o.troco))}</span>
                </div>`:''}
                <div class="order-financial-row order-financial-row--total">
                  <span class="order-financial-label">Total</span>
                  <span class="order-financial-value">R$ ${fmt(o.total||0)}</span>
                </div>
              </div>
            </div>

            ${(loc && !isBalcao)?(()=>{
              const addrTxt = o.customer_address_text || loc.address || '';
              return `<div class="order-detail-box">
              <div class="order-detail-box-title"><i class="fas fa-map-location-dot"></i> Localização</div>
              ${addrTxt?`<p class="order-address-text">${esc(addrTxt).replace(/\n/g,'<br>')}</p>`:''}
              <div class="order-actions-grid">
                ${loc.mapsLink  ?`<a class="btn-oc-map"   href="${esc(loc.mapsLink)}"  target="_blank" rel="noopener"><i class="fas fa-map-location-dot"></i> Ver localização</a>`:''}
                ${loc.routeLink ?`<a class="btn-oc-route" href="${esc(loc.routeLink)}" target="_blank" rel="noopener"><i class="fas fa-route"></i> Abrir rota</a>`:''}
              </div>
            </div>`;})():''}

            <div class="order-detail-box${(!loc||isBalcao)?' order-detail-box--full':''}">
              <div class="order-detail-box-title"><i class="fas fa-bolt"></i> Ações</div>
              <div class="order-actions-grid">
                ${(waLink && !isBalcao)?`<a class="btn-oc-wapp" href="${waLink}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> Chamar cliente</a>`:''}
                <button class="btn-oc-copy" onclick="copyOrderText('${o.id}')"><i class="fas fa-copy"></i> Copiar pedido</button>
                ${o.receipt_url?`<a class="btn-oc-receipt" href="${esc(o.receipt_url)}" target="_blank" rel="noopener"><i class="fas fa-file-invoice"></i> Ver comprovante</a>`:''}
                ${!['finalizado','cancelado'].includes(o.status)?`<button class="btn-oc-cancel order-action-full" onclick="confirmCancelOrder('${o.id}')"><i class="fas fa-times"></i> Cancelar pedido</button>`:''}
              </div>
            </div>

          </div>
          <div class="order-details-footer">
            <button class="btn-oc-toggle" onclick="toggleOrderDetails('${o.id}')">
              <i class="fas fa-chevron-up"></i> Ocultar detalhes
            </button>
          </div>
        </div>
      </div>

      <!-- RODAPÉ: ver detalhes + avançar status -->
      <div class="oc-footer">
        <button class="btn-oc-toggle" id="ocdet-btn-${o.id}" onclick="toggleOrderDetails('${o.id}')">
          <i class="fas fa-chevron-down"></i> Ver detalhes
        </button>
        <div class="oc-footer-actions">
          ${o.status!=='cancelado'?`<button class="btn-oc-print" onclick="printOrderReceipt('${o.id}')">
            <i class="fas fa-receipt"></i> ${(o.printed_at || gs.printedOrderIds.has(o.id))?'Reimprimir comanda':'Imprimir comanda'}
          </button>`:''}
          ${(!isPaidOrder(o) && !['cancelado'].includes(o.status))?`<button class="btn-oc-paid" onclick="confirmMarkAsPaid('${o.id}')"><i class="fas fa-hand-holding-dollar"></i> Marcar como pago</button>`:''}
          <div class="oc-status-btns">${statusBtns(o)}</div>
        </div>
      </div>

    </div>`;
}

function copyOrderText(orderId) {
  const o = gs.orders.find(x => x.id === orderId);
  if (!o) return;
  const items = Array.isArray(o.items) ? o.items : [];
  const payLabels = { pix:'PIX', pix_online:'PIX', card:'Cartão', card_online:'Cartão', cash:'Dinheiro', online:'Online', dinheiro:'Dinheiro', pix_loja:'Pix na loja', cartao_maquininha:'Cartão maquininha', a_definir:'A definir' };
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
  const o = gs.orders.find(x => x.id === id);
  const num = o?.order_number || id?.slice(-8).toUpperCase() || '';
  logAuditAction('change_status', 'order', id, `#${num}`, null, { new_status: status });
  await loadOrders();
  if (pdv.initialized) pdvRenderMesas();
}

let _payModalResolve = null;
let _payModalMethod  = '';

function openPayMethodModal() {
  return new Promise(resolve => {
    _payModalResolve = resolve;
    _payModalMethod  = '';
    const ov = elid('pay-method-overlay');
    ov.style.display = 'flex';
    document.querySelectorAll('.pay-modal-btn').forEach(b => b.classList.remove('active'));
    const confirmBtn = elid('pay-modal-confirm');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.classList.add('disabled'); }
  });
}

function selectPayModalMethod(method) {
  _payModalMethod = method;
  document.querySelectorAll('.pay-modal-btn').forEach(b => b.classList.toggle('active', b.dataset.pay === method));
  const confirmBtn = elid('pay-modal-confirm');
  if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.classList.remove('disabled'); }
}

function confirmPayModal() {
  if (!_payModalMethod) return;
  elid('pay-method-overlay').style.display = 'none';
  if (_payModalResolve) _payModalResolve(_payModalMethod);
  _payModalResolve = null;
}

function cancelPayModal() {
  elid('pay-method-overlay').style.display = 'none';
  if (_payModalResolve) _payModalResolve(null);
  _payModalResolve = null;
}

async function confirmMarkAsPaid(id) {
  const method = await openPayMethodModal();
  if (!method) return;

  const actor = getCurrentActor();
  const now = new Date().toISOString();
  const { error } = await getSb().from('orders').update({
    payment_status: 'pago',
    payment_method: method,
    paid_at: now,
    paid_by_user_id: actor.id,
    paid_by_email: actor.email,
    updated_at: now,
  }).eq('id', id);

  if (error) {
    console.error('[Gestão] Erro ao marcar como pago:', error);
    toast('Erro ao confirmar pagamento.', true);
    return;
  }

  const o = gs.orders.find(x => x.id === id);
  const num = o?.order_number || id?.slice(-8).toUpperCase() || '';
  toast('Pagamento confirmado.');
  logAuditAction('mark_paid', 'order', id, `#${num}`, null, { payment_method: method });
  await loadOrders();
  if (pdv.initialized) pdvRenderMesas();
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
   ALERTA SONORO DE NOVOS PEDIDOS
══════════════════════════════════════ */
const SEEN_ORDERS_KEY   = 'dl_seen_order_ids';
const SOUND_ENABLED_KEY = 'dl_order_sound_enabled';
const AUTO_PRINT_KEY    = 'dl_auto_print_receipt';

function loadSeenOrderIds() {
  try {
    const stored = JSON.parse(localStorage.getItem(SEEN_ORDERS_KEY) || '[]');
    gs.seenOrderIds = new Set(stored);
  } catch { gs.seenOrderIds = new Set(); }
}

function saveSeenOrderIds() {
  try {
    localStorage.setItem(SEEN_ORDERS_KEY, JSON.stringify([...gs.seenOrderIds].slice(-300)));
  } catch { /* ignora erro de storage */ }
}

function updateSoundBtn() {
  const btn = elid('btn-sound');
  if (!btn) return;
  btn.classList.toggle('active', gs.soundEnabled);
  btn.innerHTML = gs.soundEnabled
    ? '<i class="fas fa-bell"></i><span class="btn-sound-label">Som ativado</span>'
    : '<i class="fas fa-bell-slash"></i><span class="btn-sound-label">Ativar som de pedidos</span>';
  btn.title = gs.soundEnabled ? 'Som de novos pedidos ativado' : 'Ativar som de pedidos';
}

function enableOrderSound() {
  try {
    gs.audioCtx = gs.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    if (gs.audioCtx.state === 'suspended') gs.audioCtx.resume();
  } catch (e) {
    console.warn('Áudio não suportado:', e);
  }
  gs.soundEnabled = true;
  try { localStorage.setItem(SOUND_ENABLED_KEY, '1'); } catch {}
  updateSoundBtn();
  toast('Som de pedidos ativado!');
}

function disableOrderSound() {
  gs.soundEnabled = false;
  try { localStorage.setItem(SOUND_ENABLED_KEY, '0'); } catch {}
  updateSoundBtn();
  toast('Som de pedidos desativado.');
}

function toggleOrderSound() {
  if (gs.soundEnabled) disableOrderSound();
  else enableOrderSound();
}

function toggleAutoPrintReceipt(checked) {
  gs.autoPrintEnabled = checked;
  try { localStorage.setItem(AUTO_PRINT_KEY, checked ? '1' : '0'); } catch {}
  if (checked && !gs.soundEnabled) {
    toast('Ative o som de pedidos para a impressão automática funcionar.', true);
  }
}

/* Apito de sistema de lanchonete via Web Audio API (sem arquivo externo), 3 toques */
function playOrderSoundBeep() {
  try {
    const ctx = gs.audioCtx || (gs.audioCtx = new (window.AudioContext || window.webkitAudioContext)());
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    [0, 0.35, 0.7].forEach(delay => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(880, now + delay);
      osc.frequency.setValueAtTime(1100, now + delay + 0.08);
      gain.gain.setValueAtTime(0.0001, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.85, now + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + 0.25);
    });
  } catch (e) {
    console.warn('Erro ao tocar som de novo pedido:', e);
  }
}

function playNewOrderSound() {
  if (!gs.soundEnabled) return;
  playOrderSoundBeep();
}

function testOrderSound() {
  if (!gs.soundEnabled) {
    toast('Ative o som de pedidos antes de testar.', true);
    return;
  }
  playOrderSoundBeep();
  toast('Tocando som de teste...');
}

function startOrdersPolling() {
  if (gs.pollingStarted) return;
  gs.pollingStarted = true;
  setInterval(checkForNewOrders, 15000);
}

async function checkForNewOrders() {
  try {
    const { data, error } = await getSb()
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) throw error;
    const orders = data || [];
    const newOnes = gs.seenOrdersInitialized
      ? orders.filter(o => !gs.seenOrderIds.has(o.id))
      : [];

    if (newOnes.length) {
      newOnes.forEach(o => {
        const idx = gs.orders.findIndex(x => x.id === o.id);
        if (idx === -1) gs.orders.unshift(o); else gs.orders[idx] = o;
        gs.newOrderIds.add(o.id);
      });
      updateOrderFilterCounts();
      if (gs.section === 'pedidos') renderOrders();

      if (gs.soundEnabled) {
        playNewOrderSound();
        toast(newOnes.length > 1
          ? `${newOnes.length} novos pedidos recebidos! Imprima a comanda.`
          : 'Novo pedido recebido! Imprima a comanda.');

        if (gs.autoPrintEnabled) {
          newOnes.forEach(o => {
            if (o.status === 'cancelado') return;
            const ok = printOrderReceipt(o.id);
            if (!ok) toast('Clique em "Imprimir comanda" para imprimir este pedido.', true);
          });
        }
      } else {
        toast('Novo pedido recebido! Clique em "Ativar som de pedidos" para receber alertas.');
      }

      setTimeout(() => {
        newOnes.forEach(o => gs.newOrderIds.delete(o.id));
        if (gs.section === 'pedidos') renderOrders();
      }, 10000);
    }

    orders.forEach(o => gs.seenOrderIds.add(o.id));
    saveSeenOrderIds();
    gs.seenOrdersInitialized = true;
  } catch (e) {
    console.warn('Erro ao verificar novos pedidos:', e);
  }
}

/* ══════════════════════════════════════
   COMANDA INDIVIDUAL DO PEDIDO
══════════════════════════════════════ */
function printOrderReceipt(orderId) {
  const o = gs.orders.find(x => x.id === orderId);
  if (!o) return false;
  if (!openReceiptWindow([o])) return false;
  const wasPrinted = o.printed_at || gs.printedOrderIds.has(o.id);
  const num = o.order_number || o.id?.slice(-8).toUpperCase() || '';
  logAuditAction(wasPrinted ? 'reprint_receipt' : 'print_receipt', 'order', o.id, `#${num}`);
  markOrderPrinted(o);
  return true;
}

function openReceiptWindow(orders) {
  const html = buildReceiptHtml(orders);
  const win = window.open('', '_blank');
  if (!win) {
    toast('Não foi possível abrir a comanda. Clique em "Imprimir comanda" para imprimir este pedido.', true);
    return false;
  }
  win.document.write(html);
  win.document.close();
  return true;
}

async function markOrderPrinted(o) {
  const already = gs.printedOrderIds.has(o.id);
  gs.printedOrderIds.add(o.id);
  if (!already && gs.section === 'pedidos') renderOrders();
  try {
    const nowIso = new Date().toISOString();
    o.printed_at = nowIso;
    await getSb().from('orders').update({ printed_at: nowIso }).eq('id', o.id);
  } catch (e) {
    console.warn('Erro ao marcar comanda como impressa:', e);
  }
}

function buildReceiptHtml(orders) {
  const logoUrl = new URL('assets/icons/day-lanches-gestao-192.png', window.location.href).href;
  const blocks = orders.map(o => buildReceiptBlock(o, logoUrl)).join('');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Day Lanches — Comanda do pedido</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #1a1a1a; background: #fff; margin: 0; padding: 6mm; }

  .receipt {
    width: 80mm; max-width: 100%; margin: 0 auto 16px;
    font-size: 15px;
    border: 1px solid #ddd; border-radius: 10px;
    overflow: hidden;
  }
  .receipt-body { padding: 0 6mm 6mm; }

  .receipt-header {
    text-align: center; padding: 10px 6mm 12px;
    background: #1a1a1a; color: #fff;
    border-bottom: 4px solid #FF6B00;
  }
  .receipt-logo { width: 60px; height: 60px; object-fit: contain; margin-bottom: 6px; border-radius: 10px; background: #fff; padding: 4px; }
  .receipt-brand { font-size: 1.5rem; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; margin: 0; color: #fff; }
  .receipt-subtitle { font-size: .72rem; font-weight: 700; letter-spacing: .22em; text-transform: uppercase; color: #FF6B00; margin: 3px 0 0; }

  .receipt-section { border-top: 1px dashed #ddd; padding-top: 10px; margin-top: 10px; }
  .receipt-section:first-of-type { border-top: none; padding-top: 12px; margin-top: 0; }
  .receipt-section p { margin: 3px 0; }

  .receipt-row { display: flex; justify-content: space-between; gap: 8px; }
  .receipt-row > div { flex: 1; }

  .receipt-label { font-size: .65rem; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #999; }
  .receipt-value { font-size: .95rem; font-weight: 700; color: #1a1a1a; }

  .receipt-tag {
    text-align: center; font-size: 1.05rem; font-weight: 900;
    letter-spacing: .15em; text-transform: uppercase;
    background: #FF6B00; color: #fff;
    border-radius: 6px; padding: 8px; margin: 0;
  }

  .receipt-seal {
    text-align: center; font-size: .9rem; font-weight: 900;
    letter-spacing: .1em; text-transform: uppercase;
    border-radius: 6px; padding: 6px; margin: 8px 0 0;
  }
  .receipt-seal.is-paid    { background: #16a34a; color: #fff; }
  .receipt-seal.is-pending { background: #DC2626; color: #fff; }

  .receipt-total-box {
    text-align: center; background: #1a1a1a; color: #fff;
    border-radius: 8px; padding: 10px; margin-top: 4px;
  }
  .receipt-total-label { font-size: .7rem; font-weight: 700; text-transform: uppercase; letter-spacing: .15em; color: #FF6B00; }
  .receipt-total-value { font-size: 1.7rem; font-weight: 900; color: #fff; margin-top: 2px; }

  .receipt-items { font-size: .92rem; line-height: 1.45; }
  .receipt-item-row { font-weight: 700; margin-top: 6px; padding-top: 6px; border-top: 1px solid #f0f0f0; }
  .receipt-item-row:first-child { margin-top: 0; padding-top: 0; border-top: none; }
  .receipt-opt { margin-left: 12px; font-size: .85em; color: #555; }

  .receipt-footer { text-align: center; }
  .receipt-tagline { font-size: .72rem; font-weight: 800; color: #FF6B00; letter-spacing: .04em; text-transform: uppercase; margin: 0; }

  .print-btn { display: block; margin: 16px auto; padding: 10px 24px; font-size: 1rem; border-radius: 8px; border: none; background: #FF6B00; color: #fff; cursor: pointer; font-weight: 700; }

  .receipt-page { page-break-after: always; }
  .receipt-page:last-child { page-break-after: auto; }

  @media print {
    body { background: #fff; padding: 0; }
    .receipt { border: 1px solid #ccc; }
    .receipt-header { background: #1a1a1a !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .receipt-tag { background: #FF6B00 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .receipt-seal.is-paid { background: #16a34a !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .receipt-seal.is-pending { background: #DC2626 !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .receipt-total-box { background: #1a1a1a !important; color: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>
  ${blocks}
  <button class="print-btn no-print" onclick="window.print()"><i></i>Imprimir</button>
</body>
</html>`;
}

function buildReceiptBlock(o, logoUrl) {
  const num   = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
  const items = Array.isArray(o.items) ? o.items : (typeof o.items === 'string' ? JSON.parse(o.items || '[]') : []);
  const loc   = o.location && typeof o.location === 'object' ? o.location : null;
  const psInfo = getPaymentStatusLabel(o);
  const dateTime = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '—';
  const isPaid = isPaidOrder(o);
  const isBalcaoReceipt = o.order_source === 'balcao' || o.delivery_type === 'balcao';
  const hasMesa = isBalcaoReceipt && o.table_number;
  const deliveryTag = isBalcaoReceipt ? 'PEDIDO PRESENCIAL' : (o.delivery_type === 'pickup' ? 'RETIRADA' : 'ENTREGA');

  const itemsHtml = items.length
    ? items.map(i => {
        const opts = (i.options||[]).map(og => `<div class="receipt-opt">${esc(og.groupTitle)}: ${(og.items||[]).map(oi=>esc(oi.name)).join(', ')}</div>`).join('');
        const itemNote = i.notes ? `<div class="receipt-opt">Obs: ${esc(i.notes)}</div>` : '';
        return `<div class="receipt-item-row">${i.qty}x ${esc(i.name)}</div>${opts}${itemNote}`;
      }).join('')
    : '<div>—</div>';

  const addressText = o.customer_address_text || loc?.address || '';
  const locHtml = addressText
    ? `<p class="receipt-value">${esc(addressText).replace(/\n/g, '<br>')}</p>`
    : `<p class="receipt-value">Localização aproximada enviada pelo cliente.<br>Consultar mapa na Gestão.</p>`;

  return `
  <div class="receipt receipt-page">
    <div class="receipt-header">
      <img class="receipt-logo" src="${esc(logoUrl)}" alt="Day Lanches">
      <p class="receipt-brand">Day Lanches</p>
      <p class="receipt-subtitle">Comanda do pedido</p>
    </div>
    <div class="receipt-body">
    <div class="receipt-section">
      <div class="receipt-row">
        <div><span class="receipt-label">Pedido</span><br><span class="receipt-value">#${esc(num)}</span></div>
        <div><span class="receipt-label">Data/Hora</span><br><span class="receipt-value">${dateTime}</span></div>
      </div>
    </div>
    <div class="receipt-section">
      <p><span class="receipt-label">Cliente</span><br><span class="receipt-value">${esc(o.customer_name || '—')}</span></p>
      ${!isBalcaoReceipt ? `<p><span class="receipt-label">Telefone/WhatsApp</span><br><span class="receipt-value">${esc(o.customer_phone || '—')}</span></p>` : ''}
    </div>
    <div class="receipt-section">
      <p class="receipt-tag">${deliveryTag}</p>
      ${hasMesa ? `<p class="receipt-tag" style="margin-top:8px;background:#1D4ED8;font-size:1.3rem">MESA ${o.table_number}</p>` : ''}
    </div>
    <div class="receipt-section">
      <div class="receipt-row">
        <div><span class="receipt-label">Pagamento</span><br><span class="receipt-value">${esc(getPaymentLabel(o))}</span></div>
        <div><span class="receipt-label">Status</span><br><span class="receipt-value">${psInfo ? esc(psInfo.text) : '—'}</span></div>
      </div>
      <p class="receipt-seal ${isPaid ? 'is-paid' : 'is-pending'}">${isPaid ? 'Pago' : 'Pagamento pendente'}</p>
    </div>
    <div class="receipt-section">
      <div class="receipt-total-box">
        <p class="receipt-total-label">Total do pedido</p>
        <p class="receipt-total-value">R$ ${fmt(o.total || 0)}</p>
      </div>
    </div>
    <div class="receipt-section receipt-items">
      <p class="receipt-label">Itens</p>
      ${itemsHtml}
    </div>
    ${o.notes ? `<div class="receipt-section"><p class="receipt-label">Observação do cliente</p><p class="receipt-value">${esc(o.notes)}</p></div>` : ''}
    ${(o.delivery_type !== 'pickup' && !isBalcaoReceipt) ? `<div class="receipt-section">
      <p class="receipt-label">Localização/Entrega</p>
      ${locHtml}
    </div>` : ''}
    <div class="receipt-section receipt-footer">
      <p class="receipt-tagline">Day Lanches — sabor que marca</p>
    </div>
    </div>
  </div>`;
}

/* ══════════════════════════════════════
   SALES
══════════════════════════════════════ */
function isPaidOrder(order) {
  const status = String(order.payment_status || "").toLowerCase();

  return (
    ["pago", "paid", "confirmado", "confirmed", "pagamento_confirmado"].includes(status) ||
    !!order.paid_at
  );
}

/* Rótulo de forma de pagamento (compartilhado entre pedidos, entregas e vendas) */
const PAY_METHOD_LABELS = { pix:'PIX', pix_online:'PIX', card:'Cartão', card_online:'Cartão', cash:'Dinheiro', online:'Online', dinheiro:'Dinheiro', pix_loja:'Pix na loja', cartao_maquininha:'Cartão maquininha', a_definir:'A definir' };
function getPaymentLabel(o) {
  if (o.payment_status === 'pago' && o.capture_method) {
    const cm = String(o.capture_method).toLowerCase();
    if (cm.includes('pix')) return 'PIX';
    if (cm.includes('credit') || cm.includes('debit') || cm.includes('card') || cm.includes('cartao') || cm.includes('credito') || cm.includes('debito')) return 'Cartão';
    return 'Online confirmado';
  }
  return PAY_METHOD_LABELS[o.payment_method] || o.payment_method || '—';
}

/* Rótulo de status de pagamento (compartilhado entre pedidos, entregas e vendas) */
const PAY_STATUS_LABELS = {
  aguardando_pagamento: { text:'Aguardando pag.', cls:'ps-waiting' },
  aguardando_comprovante: { text:'Aguardando comprovante', cls:'ps-waiting' },
  checkout_criado:      { text:'Checkout criado', cls:'ps-created' },
  pago:                 { text:'Pago ✓', cls:'ps-paid' },
  pendente:             { text:'Pendente', cls:'ps-waiting' },
  pagamento_na_entrega: { text:'Na entrega', cls:'ps-delivery' },
  cancelado:            { text:'Cancelado', cls:'ps-cancelled' },
};
function getPaymentStatusLabel(o) {
  return PAY_STATUS_LABELS[o.payment_status] || null;
}

/* Se o pedido é online (dinheiro entra na conta digital) ou dinheiro físico */
function isOnlinePayment(o) {
  if (o.payment_provider === 'infinitepay') return true;
  if (o.capture_method) return true;
  const m = String(o.payment_method || '').toLowerCase();
  return m.includes('pix') || m.includes('card') || m.includes('online');
}

const ORDER_STATUS_LABELS = {
  novo:'Novo', em_preparo:'Em preparo', saiu_para_entrega:'Saiu p/ entrega',
  finalizado:'Finalizado', cancelado:'Cancelado',
};
const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0); }
function endOfDay(d)   { return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999); }

/* Intervalo [início, fim] de acordo com o filtro selecionado em Vendas */
function getSalesDateRange() {
  const f = gs.salesFilter;
  const now = new Date();
  switch (f.type) {
    case 'today':     return [startOfDay(now), endOfDay(now)];
    case 'yesterday': { const y = new Date(now); y.setDate(y.getDate() - 1); return [startOfDay(y), endOfDay(y)]; }
    case 'week':      { const d = new Date(now); const dow = (d.getDay() + 6) % 7; const monday = new Date(d); monday.setDate(d.getDate() - dow); return [startOfDay(monday), endOfDay(now)]; }
    case 'month':     return [new Date(now.getFullYear(), now.getMonth(), 1), endOfDay(now)];
    case 'year':      return [new Date(now.getFullYear(), 0, 1), endOfDay(now)];
    case 'pickMonth': {
      if (!f.month) return [null, null];
      const [y, m] = f.month.split('-').map(Number);
      return [new Date(y, m - 1, 1), endOfDay(new Date(y, m, 0))];
    }
    case 'pickYear': {
      if (!f.year) return [null, null];
      const y = Number(f.year);
      return [new Date(y, 0, 1), new Date(y, 11, 31, 23, 59, 59, 999)];
    }
    case 'range': {
      if (!f.start || !f.end) return [null, null];
      return [startOfDay(new Date(f.start + 'T00:00:00')), endOfDay(new Date(f.end + 'T00:00:00'))];
    }
    default: return [startOfDay(now), endOfDay(now)];
  }
}

/* Texto descritivo do período selecionado (usado no relatório/impressão) */
function getSalesPeriodLabel() {
  const f = gs.salesFilter;
  const labels = { today:'Hoje', yesterday:'Ontem', week:'Esta semana', month:'Este mês', year:'Este ano' };
  if (labels[f.type]) return labels[f.type];
  if (f.type === 'pickMonth' && f.month) {
    const [y, m] = f.month.split('-');
    return `${MONTH_NAMES[Number(m) - 1]} de ${y}`;
  }
  if (f.type === 'pickYear' && f.year) return `Ano ${f.year}`;
  if (f.type === 'range' && f.start && f.end) return `${formatDateBR(f.start)} a ${formatDateBR(f.end)}`;
  return 'Período selecionado';
}

function formatDateBR(isoDate) {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

/* Pedidos pagos/confirmados e não cancelados, dentro do período selecionado */
function getFilteredSalesOrders() {
  const [start, end] = getSalesDateRange();
  return gs.orders
    .filter(o => isPaidOrder(o) && o.status !== 'cancelado' && o.created_at)
    .filter(o => {
      if (!start || !end) return true;
      const d = new Date(o.created_at);
      return d >= start && d <= end;
    })
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function setSalesFilter(type, value) {
  gs.salesFilter.type = type;
  if (type === 'pickMonth') {
    const m = elid('sales-pick-month-select')?.value || '';
    const y = elid('sales-pick-year-select')?.value || '';
    gs.salesFilter.month = (m && y) ? `${y}-${m}` : '';
  }
  if (type === 'pickYear')  gs.salesFilter.year  = value ?? elid('sales-pick-year')?.value  ?? '';
  if (type === 'range') {
    gs.salesFilter.start = elid('sales-range-start')?.value || '';
    gs.salesFilter.end   = elid('sales-range-end')?.value   || '';
  }
  renderSales();
}

/* Preenche os selects de mês e ano do filtro "Escolher mês" */
function populateSalesMonthYearSelects() {
  const monthSel = elid('sales-pick-month-select');
  const yearSel  = elid('sales-pick-year-select');
  if (!monthSel || !yearSel) return;

  MONTH_NAMES.forEach((name, i) => {
    const opt = document.createElement('option');
    opt.value = String(i + 1).padStart(2, '0');
    opt.textContent = name;
    monthSel.appendChild(opt);
  });

  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 5; y--) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    yearSel.appendChild(opt);
  }
}

function renderSalesFilterUI() {
  const f = gs.salesFilter;
  document.querySelectorAll('#sales-filter-buttons .filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.type === f.type);
  });
}

function renderSales() {
  renderSalesFilterUI();

  const orders  = getFilteredSalesOrders();
  const revenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const count   = orders.length;
  const avg     = count ? revenue / count : 0;
  const cash     = orders.filter(o => !isOnlinePayment(o) && o.payment_method !== 'pix_loja' && o.payment_method !== 'cartao_maquininha').reduce((s, o) => s + Number(o.total || 0), 0);
  const online   = orders.filter(o => isOnlinePayment(o) && o.payment_method !== 'pix_loja' && o.payment_method !== 'cartao_maquininha').reduce((s, o) => s + Number(o.total || 0), 0);
  const pixLoja  = orders.filter(o => o.payment_method === 'pix_loja').reduce((s, o) => s + Number(o.total || 0), 0);
  const cartMaq  = orders.filter(o => o.payment_method === 'cartao_maquininha').reduce((s, o) => s + Number(o.total || 0), 0);

  elid('sv-revenue').textContent = 'R$ ' + fmt(revenue);
  elid('sv-count').textContent   = count;
  elid('sv-avg').textContent     = 'R$ ' + fmt(avg);
  elid('sv-cash').textContent    = 'R$ ' + fmt(cash);
  elid('sv-online').textContent  = 'R$ ' + fmt(online);
  const svPixLoja = elid('sv-pix-loja');
  const svCartMaq = elid('sv-cartao-maq');
  if (svPixLoja) svPixLoja.textContent = 'R$ ' + fmt(pixLoja);
  if (svCartMaq) svCartMaq.textContent = 'R$ ' + fmt(cartMaq);

  const tbody = elid('sales-table-body');
  const empty = elid('sales-empty-msg');
  if (!orders.length) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = '';
    return;
  }
  if (empty) empty.style.display = 'none';
  tbody.innerHTML = orders.map(salesRow).join('');
}

function salesRow(o) {
  const date  = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
  const num   = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
  const psInfo = getPaymentStatusLabel(o);
  return `<tr>
    <td data-label="Data">${date}</td>
    <td data-label="Pedido">#${esc(num)}</td>
    <td data-label="Cliente">${esc(o.customer_name || '—')}</td>
    <td data-label="Telefone">${esc(o.customer_phone || '—')}</td>
    <td data-label="Pagamento">${esc(getPaymentLabel(o))}</td>
    <td data-label="Status pagamento">${psInfo ? esc(psInfo.text) : '—'}</td>
    <td data-label="Total">R$ ${fmt(o.total || 0)}</td>
    <td data-label="Status pedido">${ORDER_STATUS_LABELS[o.status] || o.status}</td>
  </tr>`;
}

function csvEscape(val) {
  const s = String(val ?? '');
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportSalesCSV() {
  const orders = getFilteredSalesOrders();
  if (!orders.length) { toast('Nenhuma venda para exportar.', true); return; }

  const header = ['data','pedido','cliente','telefone','pagamento','status_pagamento','total','status_pedido'];
  const rows = orders.map(o => {
    const date  = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '';
    const num   = o.order_number || o.id?.slice(-8).toUpperCase() || '';
    const psInfo = getPaymentStatusLabel(o);
    return [
      date, num, o.customer_name || '', o.customer_phone || '',
      getPaymentLabel(o), psInfo ? psInfo.text : '', fmt(o.total || 0),
      ORDER_STATUS_LABELS[o.status] || o.status,
    ].map(csvEscape).join(',');
  });

  const csv  = [header.join(','), ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = `vendas-day-lanches-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function printSalesReport() {
  const orders = getFilteredSalesOrders();
  if (!orders.length) { toast('Nenhuma venda no período selecionado.', true); return; }

  const revenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const rows = orders.map(o => {
    const date = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
    const num  = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
    const psInfo = getPaymentStatusLabel(o);
    return `<tr>
      <td>${date}</td>
      <td>#${esc(num)}</td>
      <td>${esc(o.customer_name || '—')}</td>
      <td>${esc(o.customer_phone || '—')}</td>
      <td>${esc(getPaymentLabel(o))}</td>
      <td>${psInfo ? esc(psInfo.text) : '—'}</td>
      <td>R$ ${fmt(o.total || 0)}</td>
      <td>${ORDER_STATUS_LABELS[o.status] || o.status}</td>
    </tr>`;
  }).join('');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Day Lanches — Relatório de Vendas</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; padding: 24px; margin: 0; }
  h1 { font-size: 1.4rem; margin-bottom: 4px; }
  .print-period { color: #555; margin-bottom: 20px; font-size: .9rem; }
  table { width: 100%; border-collapse: collapse; font-size: .82rem; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; }
  th { background: #f5f5f5; }
  .print-total { margin-top: 16px; font-size: 1rem; font-weight: 700; text-align: right; }
  .print-btn { margin-top: 20px; padding: 10px 24px; font-size: 1rem; border-radius: 8px; border: none; background: #FF6B00; color: #fff; cursor: pointer; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <h1>Day Lanches — Relatório de Vendas</h1>
  <p class="print-period">Período: ${esc(getSalesPeriodLabel())}</p>
  <table>
    <thead><tr><th>Data</th><th>Pedido</th><th>Cliente</th><th>Telefone</th><th>Pagamento</th><th>Status pagamento</th><th>Total</th><th>Status pedido</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="print-total">Total geral: R$ ${fmt(revenue)} (${orders.length} vendas)</p>
  <button class="print-btn no-print" onclick="window.print()">Imprimir</button>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) { toast('Não foi possível abrir a tela de impressão. Verifique o bloqueador de pop-ups.', true); return; }
  win.document.write(html);
  win.document.close();
}

/* ══════════════════════════════════════
   CONFIG
══════════════════════════════════════ */
const WEEKDAY_NAMES = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const MONDAY_FIRST_ORDER = [1, 2, 3, 4, 5, 6, 0];

const DAY_TOKEN_MAP = {
  dom: 0, domingo: 0,
  seg: 1, segunda: 1,
  ter: 2, terca: 2,
  qua: 3, quarta: 3,
  qui: 4, quinta: 4,
  sex: 5, sexta: 5,
  sab: 6, sabado: 6,
};

const FALLBACK_SCHEDULE_TEXT = 'Quinta a domingo 17:30 às 23:00';

function stripAccents(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function formatMinutes(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* Converte um trecho como "terça", "segunda a sexta", "sábado e domingo" ou
   "todos os dias" em uma lista de índices de dia (0=domingo ... 6=sábado). */
function parseDayTokens(daysPart) {
  const part = daysPart.trim();
  if (!part) return null;
  if (/\btodos?\b/.test(part)) return [0, 1, 2, 3, 4, 5, 6];

  const firstWord = s => s.trim().split(/\s+/)[0];

  if (/\ba\b/.test(part)) {
    const pieces = part.split(/\ba\b/).map(s => s.trim()).filter(Boolean);
    if (pieces.length === 2) {
      const start = DAY_TOKEN_MAP[firstWord(pieces[0])];
      const end   = DAY_TOKEN_MAP[firstWord(pieces[1])];
      if (start != null && end != null) {
        const days = [];
        let d = start;
        for (let i = 0; i < 7; i++) {
          days.push(d);
          if (d === end) break;
          d = (d + 1) % 7;
        }
        return days;
      }
    }
  }

  if (/\be\b/.test(part)) {
    const pieces = part.split(/\be\b/).map(s => s.trim()).filter(Boolean);
    const days = pieces.map(p => DAY_TOKEN_MAP[firstWord(p)]).filter(d => d != null);
    if (days.length) return days;
  }

  /* Compatibilidade com formatos abreviados como "qui-dom" ou "qua-dom" */
  if (/-/.test(part)) {
    const pieces = part.split('-').map(s => s.trim()).filter(Boolean);
    if (pieces.length === 2) {
      const start = DAY_TOKEN_MAP[firstWord(pieces[0])];
      const end   = DAY_TOKEN_MAP[firstWord(pieces[1])];
      if (start != null && end != null) {
        const days = [];
        let d = start;
        for (let i = 0; i < 7; i++) {
          days.push(d);
          if (d === end) break;
          d = (d + 1) % 7;
        }
        return days;
      }
    }
  }

  const single = DAY_TOKEN_MAP[firstWord(part)];
  return single != null ? [single] : null;
}

/* Interpreta o texto de horário (mesmo formato aceito pelo site público) e
   monta um mapa de 7 posições (0=domingo ... 6=sábado) com { open, from, to }. */
function buildWeekMap(raw) {
  const str = stripAccents(String(raw || '')).toLowerCase().trim();
  if (!str) return null;

  const weekMap = Array.from({ length: 7 }, () => ({ open: false, from: null, to: null }));
  const segments = str.split(/[;\n]+/).map(s => s.trim()).filter(Boolean);
  let applied = false;

  for (const seg of segments) {
    const isClosed = /\bfechad[ao]\b/.test(seg);
    const times = seg.match(/\d{1,2}:\d{2}/g) || [];

    let daysPart = seg.replace(/\d{1,2}:\d{2}/g, '');
    daysPart = daysPart.replace(/-feira/g, '');
    daysPart = daysPart.replace(/\b(as|ate|das|de|h|horas|fechad[ao]|aberto)\b/g, ' ');
    const days = parseDayTokens(daysPart);
    if (!days) continue;

    applied = true;
    for (const d of days) {
      if (isClosed || times.length < 2) {
        weekMap[d] = { open: false, from: null, to: null };
      } else {
        weekMap[d] = { open: true, from: toMinutes(times[0]), to: toMinutes(times[1]) };
      }
    }
  }

  return applied ? weekMap : null;
}

function formatDayGroup(days) {
  if (days.length === 1) return WEEKDAY_NAMES[days[0]];
  if (days.length === 2) return `${WEEKDAY_NAMES[days[0]]} e ${WEEKDAY_NAMES[days[1]].toLowerCase()}`;
  return `${WEEKDAY_NAMES[days[0]]} a ${WEEKDAY_NAMES[days[days.length - 1]].toLowerCase()}`;
}

/* Agrupa dias consecutivos (começando na segunda-feira) que tenham o mesmo
   status/horário, na mesma lógica usada pelo site público. */
function groupScheduleRows(weekMap) {
  const rows = [];
  let i = 0;
  while (i < 7) {
    const dayIdx = MONDAY_FIRST_ORDER[i];
    const cur    = weekMap[dayIdx];
    const days   = [dayIdx];
    let j = i + 1;
    while (j < 7) {
      const nextIdx = MONDAY_FIRST_ORDER[j];
      const next    = weekMap[nextIdx];
      if (next.open !== cur.open || next.from !== cur.from || next.to !== cur.to) break;
      days.push(nextIdx);
      j++;
    }
    rows.push({
      label:     formatDayGroup(days),
      open:      cur.open,
      timeLabel: cur.open ? `${formatMinutes(cur.from)} – ${formatMinutes(cur.to)}` : 'Fechado',
    });
    i = j;
  }
  return rows;
}

/* Normaliza o texto de horário para o formato canônico salvo/exibido,
   usando o mesmo parser do site público (garante consistência). */
function normalizeScheduleText(raw) {
  const weekMap = buildWeekMap(raw) || buildWeekMap(FALLBACK_SCHEDULE_TEXT);
  const openRows = groupScheduleRows(weekMap).filter(r => r.open);
  if (!openRows.length) return FALLBACK_SCHEDULE_TEXT;
  return openRows.map(r => `${r.label} ${r.timeLabel.replace(' – ', ' às ')}`).join('; ');
}

async function loadConfig() {
  try {
    const { data, error } = await getSb().from('store_settings').select('*').eq('id','store').single();
    if (error || !data) { renderStoreLocationStatus(); return; }
    setv('cfg-wa',     data.whatsapp||'');
    setv('cfg-insta',  data.instagram||'');
    setv('cfg-hours',  normalizeScheduleText(typeof data.schedule === 'string' ? data.schedule : (data.schedule?.text||'')));
    setv('cfg-km',     data.delivery_price_per_km||'');
    gs.storeConfig = data;
    renderStoreLocationStatus();
  } catch (e) { console.warn('Erro config:', e); }
}

function normalizeWhatsApp(raw) {
  const digits = String(raw||'').replace(/\D/g, '');
  if (!digits) return '';
  return digits.startsWith('55') ? digits : '55' + digits;
}

async function handleSaveConfig(e) {
  e.preventDefault();
  const cfg = gs.storeConfig || {};
  const data = {
    id:                    'store',
    whatsapp:              normalizeWhatsApp(getv('cfg-wa')),
    pix_key:               cfg.pix_key,
    instagram:             getv('cfg-insta'),
    schedule:              { text: normalizeScheduleText(getv('cfg-hours')) },
    delivery_price_per_km: parseFloat(getv('cfg-km'))     || 2.5,
    route_factor:          cfg.route_factor || 1.4,
    store_lat:             cfg.store_lat,
    store_lon:             cfg.store_lon,
    updated_at:            new Date().toISOString(),
  };
  const { error } = await getSb().from('store_settings').upsert(data);
  if (error) { toast('Erro ao salvar: ' + error.message, true); return; }
  toast('Configurações salvas!');
  logAuditAction('save_config', 'config', 'store', 'Configurações da loja');
  await loadConfig();
}

/* ── Localização da loja ── */
function renderStoreLocationStatus(message, type) {
  const el = elid('store-location-status');
  if (!el) return;
  const cfg = gs.storeConfig || {};
  if (message) {
    el.textContent = message;
    el.className = 'cfg-loc-status' + (type ? ' ' + type : '');
    return;
  }
  if (cfg.store_lat != null && cfg.store_lon != null) {
    el.textContent = '✅ Localização da loja configurada';
    el.className = 'cfg-loc-status success';
  } else {
    el.textContent = '⚠️ Localização ainda não configurada';
    el.className = 'cfg-loc-status warning';
  }
}

function useStoreLocation() {
  const btn = elid('btn-store-location');
  const setBtn = (html, disabled) => {
    if (!btn) return;
    btn.innerHTML = html;
    btn.disabled = !!disabled;
  };

  if (!navigator.geolocation) {
    toast('Seu navegador não permite obter localização automaticamente.', true);
    return;
  }

  setBtn('<i class="fas fa-spinner fa-spin"></i> Obtendo localização...', true);

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude, accuracy } = position.coords;

      if (accuracy > 100) {
        toast('A localização foi encontrada, mas com baixa precisão. Tente novamente estando na loja.', true);
      }

      const cfg = gs.storeConfig || {};
      const data = {
        id:         'store',
        ...cfg,
        store_lat:  latitude,
        store_lon:  longitude,
        route_factor: cfg.route_factor || 1.4,
        updated_at: new Date().toISOString(),
      };

      const { error } = await getSb().from('store_settings').upsert(data);
      if (error) {
        toast('Erro ao salvar localização: ' + error.message, true);
        setBtn('<i class="fas fa-location-dot"></i> Usar minha localização atual', false);
        return;
      }

      gs.storeConfig = data;
      toast('Localização da loja salva com sucesso.');
      renderStoreLocationStatus('✅ Localização atualizada com sucesso', 'success');
      setBtn('<i class="fas fa-check"></i> Localização salva', false);
      logAuditAction('save_location', 'config', 'store', 'Localização da loja');
    },
    (err) => {
      if (err.code === err.PERMISSION_DENIED) {
        toast('Permita o acesso à localização para salvar o ponto da loja.', true);
      } else {
        toast('Não foi possível obter a localização. Tente novamente.', true);
      }
      setBtn('<i class="fas fa-location-dot"></i> Usar minha localização atual', false);
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

/* ══════════════════════════════════════
   USER INFO
══════════════════════════════════════ */
function renderUserInfo() {
  const user = gs.currentUser;
  if (!user) return;
  const meta = user.user_metadata || {};
  const lastAccess = user.last_sign_in_at
    ? new Date(user.last_sign_in_at).toLocaleString('pt-BR')
    : 'Nenhum acesso registrado ainda.';

  const rows = [];
  if (meta.name) {
    rows.push(`
    <div class="acc-info-row">
      <div class="acc-info-icon"><i class="fas fa-user"></i></div>
      <div class="acc-info-content"><span class="acc-info-label">Nome</span><span class="acc-info-value">${esc(meta.name)}</span></div>
    </div>`);
  }
  rows.push(`
    <div class="acc-info-row">
      <div class="acc-info-icon"><i class="fas fa-envelope"></i></div>
      <div class="acc-info-content"><span class="acc-info-label">E-mail de acesso</span><span class="acc-info-value">${esc(user.email)}</span></div>
    </div>
    <div class="acc-info-row">
      <div class="acc-info-icon"><i class="fas fa-user-shield"></i></div>
      <div class="acc-info-content"><span class="acc-info-label">Perfil</span><span class="acc-info-value">Administrador da loja</span></div>
    </div>
    <div class="acc-info-row">
      <div class="acc-info-icon"><i class="fas fa-clock"></i></div>
      <div class="acc-info-content"><span class="acc-info-label">Último acesso</span><span class="acc-info-value">${esc(lastAccess)}</span></div>
    </div>
    <div class="acc-info-row">
      <div class="acc-info-icon"><i class="fas fa-circle-check"></i></div>
      <div class="acc-info-content">
        <span class="acc-info-label">Status</span>
        <span class="acc-status-badge"><i class="fas fa-circle"></i> Ativo</span>
      </div>
    </div>`);

  elid('user-info-block').innerHTML = rows.join('');
}

/* ── Alterar senha ── */
function openChangePasswordModal() {
  setv('pwd-current', '');
  setv('pwd-new', '');
  setv('pwd-confirm', '');
  hidePwdError();
  elid('pwd-modal-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
  setTimeout(() => elid('pwd-current')?.focus(), 60);
}

function closeChangePasswordModal() {
  elid('pwd-modal-overlay').style.display = 'none';
  document.body.style.overflow = '';
}

function _pwdModalBgClick(e) {
  if (e.target === elid('pwd-modal-overlay')) closeChangePasswordModal();
}

function showPwdError(msg) {
  const el = elid('pwd-error');
  el.innerHTML = `<i class="fas fa-circle-exclamation"></i> ${esc(msg)}`;
  el.style.display = 'flex';
}

function hidePwdError() {
  elid('pwd-error').style.display = 'none';
}

async function submitChangePassword() {
  const currentPwd = getv('pwd-current');
  const newPwd     = getv('pwd-new');
  const confirmPwd = getv('pwd-confirm');
  hidePwdError();

  if (!currentPwd) {
    showPwdError('Digite sua senha atual.');
    return;
  }
  if (newPwd.length < 8) {
    showPwdError('A senha deve ter no mínimo 8 caracteres.');
    return;
  }
  if (newPwd !== confirmPwd) {
    showPwdError('As senhas não coincidem.');
    return;
  }

  const btn = elid('pwd-save-btn');
  const original = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

  const { error: authError } = await getSb().auth.signInWithPassword({
    email: gs.currentUser?.email,
    password: currentPwd
  });

  if (authError) {
    btn.disabled = false;
    btn.innerHTML = original;
    showPwdError('Senha atual incorreta.');
    return;
  }

  const { error } = await getSb().auth.updateUser({ password: newPwd });

  btn.disabled = false;
  btn.innerHTML = original;

  if (error) { showPwdError('Erro ao atualizar senha: ' + error.message); return; }

  setv('pwd-current', '');
  setv('pwd-new', '');
  setv('pwd-confirm', '');
  closeChangePasswordModal();
  toast('Senha atualizada com sucesso.');
  logAuditAction('change_password', 'user', gs.currentUser?.id, gs.currentUser?.email);
}

/* ── Copiar dados de acesso ── */
function copyAccessInfo() {
  const user = gs.currentUser;
  if (!user) return;
  const text = [
    'Acesso à Gestão Day Lanches',
    '',
    'URL:',
    'https://www.daylanches.com.br/gestao.html',
    '',
    'E-mail:',
    user.email,
    '',
    'Senha:',
    'A senha foi definida no momento da entrega.',
    '',
    'Observação:',
    'Guarde esses dados em segurança.',
  ].join('\n');

  navigator.clipboard.writeText(text)
    .then(() => toast('Dados de acesso copiados!'))
    .catch(() => toast('Erro ao copiar.', true));
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

function showToast(message, type = 'success') {
  const t = elid('g-toast');
  t.textContent = message;
  t.className = `g-toast show toast-${type}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'g-toast'; }, 3500);
}

function toast(msg, isErr) {
  showToast(msg, isErr ? 'error' : 'success');
}

/* ── Confirm Modal ── */
let _confirmResolve = null;

function showConfirmModal({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false } = {}) {
  return new Promise(resolve => {
    _confirmResolve = resolve;
    elid('gestao-modal-title').textContent       = title || 'Confirmar';
    elid('gestao-modal-message').innerHTML       = message || '';
    elid('gestao-modal-btn-confirm').textContent = confirmText;
    elid('gestao-modal-btn-cancel').textContent  = cancelText;
    elid('gestao-modal-btn-confirm').className   = 'gestao-modal-btn ' + (danger ? 'gestao-modal-btn-danger' : 'gestao-modal-btn-primary');
    elid('gestao-modal-overlay').style.display   = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => elid('gestao-modal-btn-confirm').focus(), 60);
  });
}

function _confirmModalConfirm() {
  const resolve = _confirmResolve;
  _closeConfirmModal();
  if (resolve) resolve(true);
}

function _confirmModalCancel() {
  const resolve = _confirmResolve;
  _closeConfirmModal();
  if (resolve) resolve(false);
}

function _confirmModalBgClick(e) {
  if (e.target === elid('gestao-modal-overlay')) _confirmModalCancel();
}

function _closeConfirmModal() {
  const ov = elid('gestao-modal-overlay');
  if (ov) ov.style.display = 'none';
  document.body.style.overflow = '';
  _confirmResolve = null;
}

document.addEventListener('keydown', e => {
  const ov = elid('gestao-modal-overlay');
  if (!ov || ov.style.display === 'none') return;
  if (e.key === 'Escape') { e.preventDefault(); _confirmModalCancel(); }
  if (e.key === 'Enter')  { e.preventDefault(); _confirmModalConfirm(); }
});

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
   AUDIT LOG
══════════════════════════════════════ */
async function logAuditAction(action, entityType, entityId, entityLabel, reason, metadata) {
  try {
    const sb = getSb();
    const { data: { user } } = await sb.auth.getUser();
    const row = {
      actor_user_id: user?.id || null,
      actor_email:   user?.email || null,
      actor_name:    user?.user_metadata?.name || user?.email?.split('@')[0] || null,
      action,
      entity_type:   entityType,
      entity_id:     entityId || null,
      entity_label:  entityLabel || null,
      reason:        reason || null,
      metadata:      metadata || {},
    };
    await sb.from('audit_logs').insert(row);
  } catch (e) {
    console.warn('[Audit] Falha ao registrar ação:', e);
  }
}

function getCurrentActor() {
  const u = gs.currentUser;
  if (!u) return { id: null, email: null, name: null };
  return {
    id: u.id,
    email: u.email,
    name: u.user_metadata?.name || u.email?.split('@')[0] || null,
  };
}

/* ══════════════════════════════════════
   CANCEL REASON MODAL
══════════════════════════════════════ */
let _cancelReasonResolve = null;
let _cancelReasonOrderId = null;

function openCancelReasonModal(orderId) {
  return new Promise(resolve => {
    _cancelReasonResolve = resolve;
    _cancelReasonOrderId = orderId;
    elid('cancel-reason-input').value = '';
    hide('cancel-reason-error');
    elid('cancel-reason-overlay').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => elid('cancel-reason-input')?.focus(), 60);
  });
}

function cancelReasonModalClose() {
  elid('cancel-reason-overlay').style.display = 'none';
  document.body.style.overflow = '';
  if (_cancelReasonResolve) _cancelReasonResolve(null);
  _cancelReasonResolve = null;
}

function cancelReasonModalConfirm() {
  const reason = (elid('cancel-reason-input')?.value || '').trim();
  if (!reason) {
    show('cancel-reason-error', 'Informe o motivo do cancelamento.');
    return;
  }
  elid('cancel-reason-overlay').style.display = 'none';
  document.body.style.overflow = '';
  if (_cancelReasonResolve) _cancelReasonResolve(reason);
  _cancelReasonResolve = null;
}

function _cancelReasonBgClick(e) {
  if (e.target === elid('cancel-reason-overlay')) cancelReasonModalClose();
}

/* ══════════════════════════════════════
   REPORTS — State & Filters
══════════════════════════════════════ */
const rpt = {
  filter: { type: 'today', start: '', end: '' },
  tab: 'financeiro',
  auditLogs: [],
  initialized: false,
};

function setReportFilter(type) {
  rpt.filter.type = type;
  if (type === 'range') {
    rpt.filter.start = elid('rpt-date-start')?.value || '';
    rpt.filter.end   = elid('rpt-date-end')?.value || '';
  }
  document.querySelectorAll('[data-rpt]').forEach(b => b.classList.toggle('active', b.dataset.rpt === type));
  renderReports();
}

function getReportDateRange() {
  const f = rpt.filter;
  const now = new Date();
  switch (f.type) {
    case 'today':     return [startOfDay(now), endOfDay(now)];
    case 'yesterday': { const y = new Date(now); y.setDate(y.getDate() - 1); return [startOfDay(y), endOfDay(y)]; }
    case 'week':      { const d = new Date(now); const dow = (d.getDay() + 6) % 7; const mon = new Date(d); mon.setDate(d.getDate() - dow); return [startOfDay(mon), endOfDay(now)]; }
    case 'month':     return [new Date(now.getFullYear(), now.getMonth(), 1), endOfDay(now)];
    case 'year':      return [new Date(now.getFullYear(), 0, 1), endOfDay(now)];
    case 'range': {
      if (!f.start || !f.end) return [startOfDay(now), endOfDay(now)];
      return [startOfDay(new Date(f.start + 'T00:00:00')), endOfDay(new Date(f.end + 'T00:00:00'))];
    }
    default: return [startOfDay(now), endOfDay(now)];
  }
}

function getReportPeriodLabel() {
  const f = rpt.filter;
  const labels = { today:'Hoje', yesterday:'Ontem', week:'Esta semana', month:'Este mês', year:'Este ano' };
  if (labels[f.type]) return labels[f.type];
  if (f.type === 'range' && f.start && f.end) return `${formatDateBR(f.start)} a ${formatDateBR(f.end)}`;
  return 'Período selecionado';
}

function getFilteredReportOrders() {
  const [start, end] = getReportDateRange();
  const payFilter    = elid('rpt-payment')?.value || '';
  const statusFilter = elid('rpt-status')?.value || '';
  const originFilter = elid('rpt-origin')?.value || '';
  const empFilter    = elid('rpt-employee')?.value || '';

  return gs.orders.filter(o => {
    if (!o.created_at) return false;
    const d = new Date(o.created_at);
    if (d < start || d > end) return false;

    if (payFilter) {
      if (payFilter === 'online') {
        if (!isOnlinePayment(o)) return false;
      } else if (o.payment_method !== payFilter) return false;
    }
    if (statusFilter === 'pago' && !isPaidOrder(o)) return false;
    if (statusFilter === 'pendente' && isPaidOrder(o)) return false;
    if (originFilter === 'online' && (o.order_source === 'balcao' || o.delivery_type === 'balcao')) return false;
    if (originFilter === 'balcao' && o.order_source !== 'balcao' && o.delivery_type !== 'balcao') return false;
    if (empFilter && o.created_by_email !== empFilter && o.paid_by_email !== empFilter && o.handled_by_email !== empFilter) return false;
    return true;
  });
}

async function initReports() {
  if (!rpt.initialized) {
    rpt.initialized = true;
    populateEmployeeFilter();
  }
  await loadAuditLogs();
  renderReports();
}

function populateEmployeeFilter() {
  const sel = elid('rpt-employee');
  if (!sel) return;
  const emails = new Set();
  gs.orders.forEach(o => {
    if (o.created_by_email) emails.add(o.created_by_email);
    if (o.paid_by_email) emails.add(o.paid_by_email);
  });
  sel.innerHTML = '<option value="">Todos</option>';
  [...emails].sort().forEach(e => {
    sel.innerHTML += `<option value="${esc(e)}">${esc(e)}</option>`;
  });
}

async function loadAuditLogs() {
  try {
    const [start, end] = getReportDateRange();
    const { data, error } = await getSb()
      .from('audit_logs')
      .select('*')
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw error;
    rpt.auditLogs = data || [];
  } catch (e) {
    console.warn('[Relatórios] Erro ao carregar logs de auditoria:', e);
    rpt.auditLogs = [];
  }
}

function showReportTab(tab) {
  rpt.tab = tab;
  document.querySelectorAll('.rpt-tab').forEach(b => b.classList.toggle('active', b.textContent.toLowerCase().includes(tab.slice(0, 4))));
  document.querySelectorAll('.rpt-tab-content').forEach(el => el.style.display = 'none');
  const target = elid(`rpt-tab-${tab}`);
  if (target) target.style.display = '';
  renderReportTab(tab);
}

/* ══════════════════════════════════════
   REPORTS — Render
══════════════════════════════════════ */
function renderReports() {
  const orders = getFilteredReportOrders();
  const nonCancelled = orders.filter(o => o.status !== 'cancelado');
  const paid = nonCancelled.filter(o => isPaidOrder(o));
  const pending = nonCancelled.filter(o => !isPaidOrder(o));

  const totalSold    = paid.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalOrders  = nonCancelled.length;
  const paidCount    = paid.length;
  const pendCount    = pending.length;
  const ticketAvg    = paidCount ? totalSold / paidCount : 0;
  const totalFee     = paid.reduce((s, o) => s + Number(o.delivery_fee || 0), 0);
  const totalCash    = paid.filter(o => o.payment_method === 'dinheiro').reduce((s, o) => s + Number(o.total || 0), 0);
  const totalPix     = paid.filter(o => o.payment_method === 'pix_loja').reduce((s, o) => s + Number(o.total || 0), 0);
  const totalCard    = paid.filter(o => o.payment_method === 'cartao_maquininha').reduce((s, o) => s + Number(o.total || 0), 0);
  const totalOnline  = paid.filter(o => isOnlinePayment(o) && o.payment_method !== 'pix_loja' && o.payment_method !== 'cartao_maquininha').reduce((s, o) => s + Number(o.total || 0), 0);

  const productMap = {};
  paid.forEach(o => {
    const items = Array.isArray(o.items) ? o.items : [];
    items.forEach(i => {
      const name = i.name || i.product_name || i.title || 'Sem nome';
      if (!productMap[name]) productMap[name] = { qty: 0, revenue: 0, orders: 0 };
      productMap[name].qty += Number(i.qty || i.quantity || 1);
      productMap[name].revenue += Number(i.total || (i.price || 0) * (i.qty || 1));
      productMap[name].orders++;
    });
  });
  const topProduct = Object.entries(productMap).sort((a, b) => b[1].qty - a[1].qty)[0];

  const employeeMap = {};
  nonCancelled.forEach(o => {
    const email = o.created_by_email || o.handled_by_email || 'Sistema';
    if (!employeeMap[email]) employeeMap[email] = 0;
    employeeMap[email]++;
  });
  const topEmployee = Object.entries(employeeMap).sort((a, b) => b[1] - a[1])[0];

  const cards = [
    { icon: 'fa-hand-holding-dollar', val: `R$ ${fmt(totalSold)}`, label: 'Total vendido' },
    { icon: 'fa-receipt', val: totalOrders, label: 'Total de pedidos' },
    { icon: 'fa-circle-check', val: paidCount, label: 'Pedidos pagos' },
    { icon: 'fa-clock', val: pendCount, label: 'Pedidos pendentes' },
    { icon: 'fa-chart-line', val: `R$ ${fmt(ticketAvg)}`, label: 'Ticket médio' },
    { icon: 'fa-truck', val: `R$ ${fmt(totalFee)}`, label: 'Taxas de entrega' },
    { icon: 'fa-money-bill-wave', val: `R$ ${fmt(totalCash)}`, label: 'Total em dinheiro' },
    { icon: 'fa-qrcode', val: `R$ ${fmt(totalPix)}`, label: 'Total em Pix' },
    { icon: 'fa-credit-card', val: `R$ ${fmt(totalCard)}`, label: 'Total em cartão' },
    { icon: 'fa-globe', val: `R$ ${fmt(totalOnline)}`, label: 'Total online' },
    { icon: 'fa-star', val: topProduct ? topProduct[0] : '—', label: 'Mais vendido' },
    { icon: 'fa-user', val: topEmployee ? topEmployee[0].split('@')[0] : '—', label: 'Mais atendimentos' },
  ];

  elid('rpt-cards').innerHTML = cards.map(c => `
    <div class="rpt-card">
      <div class="rpt-card-icon"><i class="fas ${c.icon}"></i></div>
      <div class="rpt-card-val">${c.val}</div>
      <div class="rpt-card-label">${c.label}</div>
    </div>`).join('');

  renderReportTab(rpt.tab);
}

function renderReportTab(tab) {
  switch (tab) {
    case 'financeiro':    renderRptFinanceiro(); break;
    case 'entregas':      renderRptEntregas(); break;
    case 'produtos':      renderRptProdutos(); break;
    case 'funcionarios':  renderRptFuncionarios(); break;
    case 'cancelados':    renderRptCancelados(); break;
    case 'atividades':    renderRptAtividades(); break;
  }
}

/* ── Tab: Financeiro ── */
function renderRptFinanceiro() {
  const orders = getFilteredReportOrders().filter(o => o.status !== 'cancelado');
  const el = elid('rpt-tab-financeiro');
  if (!el) return;

  if (!orders.length) { el.innerHTML = '<p class="empty-msg">Nenhum pedido no período.</p>'; return; }

  const rows = orders.map(o => {
    const date = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
    const num = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
    const paid = isPaidOrder(o);
    return `<tr>
      <td>${date}</td>
      <td>#${esc(num)}</td>
      <td>${esc(o.customer_name || '—')}</td>
      <td>${esc(getPaymentLabel(o))}</td>
      <td><span class="rpt-pill ${paid ? 'rpt-pill-paid' : 'rpt-pill-pending'}">${paid ? 'Pago' : 'Pendente'}</span></td>
      <td>R$ ${fmt(o.total || 0)}</td>
      <td>${esc(o.created_by_email?.split('@')[0] || 'Sistema')}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="rpt-tab-export">
      <button class="btn-secondary" onclick="exportReportCSV('financeiro')"><i class="fas fa-file-csv"></i> CSV</button>
    </div>
    <table class="rpt-table">
      <thead><tr><th>Data</th><th>Pedido</th><th>Cliente</th><th>Pagamento</th><th>Status</th><th>Total</th><th>Feito por</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ── Tab: Entregas ── */
function renderRptEntregas() {
  const orders = getFilteredReportOrders().filter(o => o.status !== 'cancelado');
  const el = elid('rpt-tab-entregas');
  if (!el) return;

  const rows = orders.map(o => {
    const date = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
    const num = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
    const isBalcao = o.order_source === 'balcao' || o.delivery_type === 'balcao';
    const deliveryLabel = isBalcao ? 'Balcão' : (o.delivery_type === 'pickup' ? 'Retirada' : 'Entrega');
    const fee = Number(o.delivery_fee || 0);
    const paid = isPaidOrder(o);
    return `<tr>
      <td>${date}</td>
      <td>#${esc(num)}</td>
      <td>${esc(o.customer_name || '—')}</td>
      <td>${esc(o.customer_phone || '—')}</td>
      <td>${deliveryLabel}</td>
      <td>R$ ${fmt(fee)}</td>
      <td>R$ ${fmt(o.total || 0)}</td>
      <td><span class="rpt-pill ${paid ? 'rpt-pill-paid' : 'rpt-pill-pending'}">${paid ? 'Pago' : 'Pendente'}</span></td>
    </tr>`;
  }).join('');

  const totalFee = orders.reduce((s, o) => s + Number(o.delivery_fee || 0), 0);
  const avgFee = orders.length ? totalFee / orders.length : 0;
  const deliveries = orders.filter(o => o.delivery_type !== 'pickup' && o.order_source !== 'balcao' && o.delivery_type !== 'balcao').length;

  el.innerHTML = `
    <div class="rpt-tab-export">
      <button class="btn-secondary" onclick="exportReportCSV('entregas')"><i class="fas fa-file-csv"></i> CSV</button>
    </div>
    <h3>Taxas de entrega por cliente</h3>
    <table class="rpt-table">
      <thead><tr><th>Data</th><th>Pedido</th><th>Cliente</th><th>Telefone</th><th>Tipo</th><th>Taxa entrega</th><th>Total</th><th>Pagamento</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="rpt-summary-box">
      <div class="rpt-summary-item">Total em taxas: <strong>R$ ${fmt(totalFee)}</strong></div>
      <div class="rpt-summary-item">Média por pedido: <strong>R$ ${fmt(avgFee)}</strong></div>
      <div class="rpt-summary-item">Entregas: <strong>${deliveries}</strong></div>
    </div>`;
}

/* ── Tab: Produtos ── */
function renderRptProdutos() {
  const orders = getFilteredReportOrders().filter(o => o.status !== 'cancelado' && isPaidOrder(o));
  const el = elid('rpt-tab-produtos');
  if (!el) return;

  const productMap = {};
  orders.forEach(o => {
    const items = Array.isArray(o.items) ? o.items : [];
    items.forEach(i => {
      const name = i.name || i.product_name || i.title || 'Sem nome';
      if (!productMap[name]) productMap[name] = { qty: 0, revenue: 0, orders: 0 };
      productMap[name].qty += Number(i.qty || i.quantity || 1);
      productMap[name].revenue += Number(i.total || (i.price || 0) * (i.qty || 1));
      productMap[name].orders++;
    });
  });

  const sorted = Object.entries(productMap).sort((a, b) => b[1].qty - a[1].qty);
  const topProducts = sorted.slice(0, 20);
  const bottomProducts = sorted.slice(-10).reverse();

  const soldNames = new Set(Object.keys(productMap));
  const unsold = gs.products.filter(p => p.active !== false && !soldNames.has(p.name));

  let html = '<div class="rpt-tab-export"><button class="btn-secondary" onclick="exportReportCSV(\'produtos\')"><i class="fas fa-file-csv"></i> CSV</button></div>';

  html += '<div class="rpt-product-section"><h4><i class="fas fa-fire"></i> Produtos mais vendidos</h4>';
  if (topProducts.length) {
    html += '<table class="rpt-table"><thead><tr><th>Produto</th><th>Qtd vendida</th><th>Faturamento</th><th>Pedidos</th><th>Ticket médio</th></tr></thead><tbody>';
    topProducts.forEach(([name, d]) => {
      html += `<tr><td><strong>${esc(name)}</strong></td><td>${d.qty}</td><td>R$ ${fmt(d.revenue)}</td><td>${d.orders}</td><td>R$ ${fmt(d.orders ? d.revenue / d.orders : 0)}</td></tr>`;
    });
    html += '</tbody></table>';
  } else html += '<p class="empty-msg">Nenhum produto vendido no período.</p>';
  html += '</div>';

  html += '<div class="rpt-product-section"><h4><i class="fas fa-arrow-down"></i> Produtos menos vendidos</h4>';
  if (bottomProducts.length) {
    html += '<table class="rpt-table"><thead><tr><th>Produto</th><th>Qtd vendida</th><th>Faturamento</th></tr></thead><tbody>';
    bottomProducts.forEach(([name, d]) => {
      html += `<tr><td>${esc(name)}</td><td>${d.qty}</td><td>R$ ${fmt(d.revenue)}</td></tr>`;
    });
    html += '</tbody></table>';
  } else html += '<p class="empty-msg">Sem dados.</p>';
  html += '</div>';

  html += '<div class="rpt-product-section"><h4><i class="fas fa-ban"></i> Produtos que não venderam no período</h4>';
  if (unsold.length) {
    html += '<table class="rpt-table"><thead><tr><th>Produto</th><th>Categoria</th><th>Preço</th><th>Status</th></tr></thead><tbody>';
    unsold.forEach(p => {
      html += `<tr><td>${esc(p.name)}</td><td>${esc(p.category || p.cat || '—')}</td><td>R$ ${fmt(p.price || 0)}</td><td>${p.active !== false ? 'Ativo' : 'Inativo'}</td></tr>`;
    });
    html += '</tbody></table>';
  } else html += '<p class="empty-msg">Todos os produtos foram vendidos no período.</p>';
  html += '</div>';

  el.innerHTML = html;
}

/* ── Tab: Funcionários ── */
function renderRptFuncionarios() {
  const orders = getFilteredReportOrders();
  const el = elid('rpt-tab-funcionarios');
  if (!el) return;

  const empMap = {};
  orders.forEach(o => {
    const email = o.created_by_email || o.handled_by_email || null;
    const isOnline = o.order_source !== 'balcao' && o.delivery_type !== 'balcao' && !email;
    const key = isOnline ? 'Sistema / Cliente online' : (email || 'Sem registro');

    if (!empMap[key]) empMap[key] = {
      created: 0, clients: new Set(), paid: 0, pending: 0, cancelled: 0,
      printed: 0, totalSold: 0, cash: 0, pix: 0, card: 0, lastAction: null,
    };
    const e = empMap[key];
    e.created++;
    if (o.customer_name) e.clients.add(o.customer_name);
    if (o.status === 'cancelado') e.cancelled++;
    else if (isPaidOrder(o)) {
      e.paid++;
      e.totalSold += Number(o.total || 0);
      if (o.payment_method === 'dinheiro') e.cash += Number(o.total || 0);
      else if (o.payment_method === 'pix_loja') e.pix += Number(o.total || 0);
      else if (o.payment_method === 'cartao_maquininha') e.card += Number(o.total || 0);
    } else e.pending++;
    if (o.printed_at) e.printed++;
    const d = new Date(o.created_at);
    if (!e.lastAction || d > e.lastAction) e.lastAction = d;
  });

  const rows = Object.entries(empMap).sort((a, b) => b[1].totalSold - a[1].totalSold);

  if (!rows.length) { el.innerHTML = '<p class="empty-msg">Nenhum dado no período.</p>'; return; }

  el.innerHTML = `
    <div class="rpt-tab-export">
      <button class="btn-secondary" onclick="exportReportCSV('funcionarios')"><i class="fas fa-file-csv"></i> CSV</button>
    </div>
    <h3>Relatório por funcionário</h3>
    <table class="rpt-table">
      <thead><tr><th>Funcionário</th><th>Pedidos</th><th>Clientes</th><th>Pagos</th><th>Pendentes</th><th>Cancelados</th><th>Comandas</th><th>Total vendido</th><th>Dinheiro</th><th>Pix</th><th>Cartão</th><th>Última ação</th></tr></thead>
      <tbody>${rows.map(([name, d]) => `<tr>
        <td><strong>${esc(name.includes('@') ? name.split('@')[0] : name)}</strong></td>
        <td>${d.created}</td>
        <td>${d.clients.size}</td>
        <td>${d.paid}</td>
        <td>${d.pending}</td>
        <td>${d.cancelled}</td>
        <td>${d.printed}</td>
        <td>R$ ${fmt(d.totalSold)}</td>
        <td>R$ ${fmt(d.cash)}</td>
        <td>R$ ${fmt(d.pix)}</td>
        <td>R$ ${fmt(d.card)}</td>
        <td>${d.lastAction ? d.lastAction.toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'}</td>
      </tr>`).join('')}</tbody>
    </table>`;
}

/* ── Tab: Cancelados ── */
function renderRptCancelados() {
  const orders = getFilteredReportOrders().filter(o => o.status === 'cancelado');
  const el = elid('rpt-tab-cancelados');
  if (!el) return;

  if (!orders.length) { el.innerHTML = '<p class="empty-msg">Nenhum pedido cancelado no período.</p>'; return; }

  const rows = orders.map(o => {
    const date = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
    const num = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
    const cancelDate = o.cancelled_at ? new Date(o.cancelled_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
    return `<tr>
      <td>${date}</td>
      <td>#${esc(num)}</td>
      <td>${esc(o.customer_name || '—')}</td>
      <td>R$ ${fmt(o.total || 0)}</td>
      <td>${esc(o.cancelled_by_email?.split('@')[0] || 'Sem registro')}</td>
      <td>${esc(o.cancel_reason || 'Não informado')}</td>
      <td>${cancelDate}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="rpt-tab-export">
      <button class="btn-secondary" onclick="exportReportCSV('cancelados')"><i class="fas fa-file-csv"></i> CSV</button>
    </div>
    <h3>Pedidos cancelados / excluídos</h3>
    <table class="rpt-table">
      <thead><tr><th>Data pedido</th><th>Pedido</th><th>Cliente</th><th>Total</th><th>Quem cancelou</th><th>Motivo</th><th>Horário</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ── Tab: Atividades ── */
function renderRptAtividades() {
  const el = elid('rpt-tab-atividades');
  if (!el) return;

  if (!rpt.auditLogs.length) { el.innerHTML = '<p class="empty-msg">Nenhuma atividade registrada no período.</p>'; return; }

  const ACTION_LABELS = {
    create_order: 'criou o pedido',
    cancel_order: 'cancelou o pedido',
    mark_paid: 'marcou como pago o pedido',
    change_status: 'alterou o status do pedido',
    print_receipt: 'imprimiu a comanda do pedido',
    reprint_receipt: 'reimprimiu a comanda do pedido',
    auto_print_order: 'imprimiu automaticamente a comanda do pedido',
    create_product: 'criou o produto',
    edit_product: 'editou o produto',
    delete_product: 'excluiu o produto',
    toggle_product: 'alterou o status do produto',
    save_config: 'alterou as configurações',
    save_location: 'alterou a localização da loja',
    export_report: 'exportou relatório',
    print_report: 'imprimiu relatório',
    change_password: 'alterou a senha',
  };

  const rows = rpt.auditLogs.map(log => {
    const date = new Date(log.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const actor = log.actor_name || log.actor_email?.split('@')[0] || 'Sistema';
    const actionText = ACTION_LABELS[log.action] || log.action;
    const label = log.entity_label || log.entity_id || '';
    return `<tr>
      <td>${date}</td>
      <td><span class="rpt-activity-actor">${esc(actor)}</span></td>
      <td><span class="rpt-activity-action">${esc(actionText)}</span> ${label ? `<strong>${esc(label)}</strong>` : ''}</td>
      <td>${log.reason ? `<span class="rpt-activity-reason">${esc(log.reason)}</span>` : '—'}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="rpt-tab-export">
      <button class="btn-secondary" onclick="exportReportCSV('atividades')"><i class="fas fa-file-csv"></i> CSV</button>
    </div>
    <h3>Histórico de atividades</h3>
    <table class="rpt-table">
      <thead><tr><th>Data/hora</th><th>Conta</th><th>Ação</th><th>Motivo</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ══════════════════════════════════════
   REPORTS — Export
══════════════════════════════════════ */
function exportReportCSV(type) {
  let header, rows;
  const period = getReportPeriodLabel();

  if (type === 'financeiro') {
    const orders = getFilteredReportOrders().filter(o => o.status !== 'cancelado');
    if (!orders.length) { toast('Nenhum dado para exportar.', true); return; }
    header = ['Data','Pedido','Cliente','Pagamento','Status','Total','Feito por'];
    rows = orders.map(o => [
      o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '',
      o.order_number || '', o.customer_name || '', getPaymentLabel(o),
      isPaidOrder(o) ? 'Pago' : 'Pendente', fmt(o.total || 0),
      o.created_by_email?.split('@')[0] || 'Sistema',
    ]);
  } else if (type === 'entregas') {
    const orders = getFilteredReportOrders().filter(o => o.status !== 'cancelado');
    if (!orders.length) { toast('Nenhum dado para exportar.', true); return; }
    header = ['Data','Pedido','Cliente','Telefone','Tipo','Taxa entrega','Total','Pagamento'];
    rows = orders.map(o => {
      const isBalcao = o.order_source === 'balcao' || o.delivery_type === 'balcao';
      return [
        o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '',
        o.order_number || '', o.customer_name || '', o.customer_phone || '',
        isBalcao ? 'Balcão' : (o.delivery_type === 'pickup' ? 'Retirada' : 'Entrega'),
        fmt(o.delivery_fee || 0), fmt(o.total || 0), isPaidOrder(o) ? 'Pago' : 'Pendente',
      ];
    });
  } else if (type === 'produtos') {
    const orders = getFilteredReportOrders().filter(o => o.status !== 'cancelado' && isPaidOrder(o));
    const productMap = {};
    orders.forEach(o => {
      (Array.isArray(o.items) ? o.items : []).forEach(i => {
        const name = i.name || 'Sem nome';
        if (!productMap[name]) productMap[name] = { qty: 0, revenue: 0 };
        productMap[name].qty += Number(i.qty || 1);
        productMap[name].revenue += Number(i.total || 0);
      });
    });
    const sorted = Object.entries(productMap).sort((a, b) => b[1].qty - a[1].qty);
    if (!sorted.length) { toast('Nenhum dado para exportar.', true); return; }
    header = ['Produto','Qtd vendida','Faturamento'];
    rows = sorted.map(([name, d]) => [name, d.qty, fmt(d.revenue)]);
  } else if (type === 'funcionarios') {
    header = ['Funcionario','Pedidos','Pagos','Pendentes','Cancelados','Total vendido'];
    const orders = getFilteredReportOrders();
    const empMap = {};
    orders.forEach(o => {
      const key = o.created_by_email || o.handled_by_email || 'Sistema';
      if (!empMap[key]) empMap[key] = { created: 0, paid: 0, pending: 0, cancelled: 0, totalSold: 0 };
      const e = empMap[key];
      e.created++;
      if (o.status === 'cancelado') e.cancelled++;
      else if (isPaidOrder(o)) { e.paid++; e.totalSold += Number(o.total || 0); }
      else e.pending++;
    });
    rows = Object.entries(empMap).map(([k, d]) => [k.split('@')[0], d.created, d.paid, d.pending, d.cancelled, fmt(d.totalSold)]);
    if (!rows.length) { toast('Nenhum dado para exportar.', true); return; }
  } else if (type === 'cancelados') {
    const orders = getFilteredReportOrders().filter(o => o.status === 'cancelado');
    if (!orders.length) { toast('Nenhum dado para exportar.', true); return; }
    header = ['Data','Pedido','Cliente','Total','Quem cancelou','Motivo'];
    rows = orders.map(o => [
      o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '',
      o.order_number || '', o.customer_name || '', fmt(o.total || 0),
      o.cancelled_by_email?.split('@')[0] || 'Sem registro', o.cancel_reason || 'Não informado',
    ]);
  } else if (type === 'atividades') {
    if (!rpt.auditLogs.length) { toast('Nenhum dado para exportar.', true); return; }
    header = ['Data','Conta','Acao','Item','Motivo'];
    rows = rpt.auditLogs.map(l => [
      new Date(l.created_at).toLocaleString('pt-BR'),
      l.actor_name || l.actor_email || 'Sistema',
      l.action, l.entity_label || '', l.reason || '',
    ]);
  } else return;

  const csv = [header.join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `relatorio-${type}-day-lanches-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  logAuditAction('export_report', 'report', null, `${type} — ${period}`);
}

function printReport() {
  logAuditAction('print_report', 'report', null, getReportPeriodLabel());
  window.print();
}

/* ══════════════════════════════════════
   BOOTSTRAP
══════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Gestão] supabase-config.js carregado:', !!window.supabaseClient);

  populateSalesMonthYearSelects();

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
      const _uName = session.user.user_metadata?.name || session.user.email.split('@')[0];
      elid('user-display').textContent = _uName;
      var _pu = elid('pdv-user-display'); if (_pu) _pu.textContent = _uName;
      loadProducts();
      loadOrders().then(() => {
        gs.orders.forEach(o => gs.seenOrderIds.add(o.id));
        saveSeenOrderIds();
        gs.seenOrdersInitialized = true;
        startOrdersPolling();
      });
    } else {
      gs.currentUser = null;
      showView('login');
    }
  });

  /* Verifica sessão existente */
  getSb().auth.getSession().then(({ data: { session } }) => {
    if (!session) showView('login');
  });

  /* Alerta sonoro de novos pedidos */
  loadSeenOrderIds();
  gs.soundEnabled = localStorage.getItem(SOUND_ENABLED_KEY) === '1';
  if (gs.soundEnabled) {
    try { gs.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
  }
  updateSoundBtn();

  /* Impressão automática de comanda em novo pedido */
  gs.autoPrintEnabled = localStorage.getItem(AUTO_PRINT_KEY) === '1';
  const autoPrintChk = elid('chk-auto-print-receipt');
  if (autoPrintChk) autoPrintChk.checked = gs.autoPrintEnabled;

  const refreshOrdersBtn = elid('refresh-orders-btn');
  if (refreshOrdersBtn) {
    refreshOrdersBtn.addEventListener('click', async () => {
      await refreshOrders();
    });
  }
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

/* ══════════════════════════════════════
   PDV / BALCÃO — Pedido Presencial
══════════════════════════════════════ */
const pdv = {
  cart: [],
  tableNumber: null,
  catFilter: '',
  initialized: false,
  optProduct: null,
  optQty: 1,
  optSelections: {},
  optGroups: [],
};

function pdvInit() {
  if (!pdv.initialized) {
    pdv.initialized = true;
  }
  pdvRenderProducts();
  pdvRenderMesas();
  pdvRenderCart();
}

function pdvRenderProducts() {
  const grid = elid('pdv-grid');
  const catRow = elid('pdv-cat-row');
  if (!grid) return;

  const q = (elid('pdv-search')?.value || '').toLowerCase();
  let products = gs.products.filter(p => (p.active !== false));

  const cats = [...new Set(products.map(p => p.category || p.cat || '').filter(Boolean))];
  if (catRow) {
    catRow.innerHTML = `<button class="pdv-cat-btn${!pdv.catFilter?' active':''}" onclick="pdvFilterCat('')">Todos</button>` +
      cats.map(c => `<button class="pdv-cat-btn${pdv.catFilter===c?' active':''}" onclick="pdvFilterCat('${esc(c)}')">${esc(c)}</button>`).join('');
  }

  if (pdv.catFilter) {
    products = products.filter(p => (p.category || p.cat) === pdv.catFilter);
  }
  if (q) {
    products = products.filter(p => (p.name||'').toLowerCase().includes(q) || (p.category||p.cat||'').toLowerCase().includes(q));
  }

  if (!products.length) {
    grid.innerHTML = '<p class="empty-msg">Nenhum produto encontrado.</p>';
    return;
  }

  grid.innerHTML = products.map(p => {
    const img = p.image_url || p.img || '';
    const price = p.price || 0;
    const hasOptions = p._hasOptions;
    return `<div class="pdv-product-card" onclick="pdvAddProduct('${p.id}')">
      ${img ? `<img class="pdv-card-img" src="${esc(img)}" alt="${esc(p.name)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling&&(this.nextElementSibling.style.display='flex')"><div class="pdv-card-img pdv-card-img-ph" style="display:none;align-items:center;justify-content:center;color:var(--text-muted);font-size:2rem"><i class="fas fa-image"></i></div>` : '<div class="pdv-card-img" style="display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:2rem"><i class="fas fa-image"></i></div>'}
      <div class="pdv-card-body">
        <div class="pdv-card-name">${esc(p.name)}</div>
        <div class="pdv-card-price">R$ ${fmt(price)}</div>
        <button class="pdv-card-add" onclick="event.stopPropagation();pdvAddProduct('${p.id}')">
          <i class="fas fa-${hasOptions?'sliders':'plus'}"></i> ${hasOptions?'Escolher':'Adicionar'}
        </button>
      </div>
    </div>`;
  }).join('');
}

async function pdvLoadProductOptions() {
  const db = getSb();
  const productIds = gs.products.map(p => p.id).filter(Boolean);
  if (!productIds.length) return;
  try {
    const { data } = await db.from('product_option_groups').select('product_id').in('product_id', productIds).eq('active', true);
    const withOpts = new Set((data||[]).map(g => g.product_id));
    gs.products.forEach(p => { p._hasOptions = withOpts.has(p.id); });
  } catch(_) {}
}

function pdvFilterProducts() { pdvRenderProducts(); }
function pdvFilterCat(cat) { pdv.catFilter = cat; pdvRenderProducts(); }

async function pdvAddProduct(productId) {
  const p = gs.products.find(x => x.id === productId || String(x.id) === productId);
  if (!p) return;

  if (p._hasOptions) {
    await pdvOpenOptions(p);
    return;
  }

  const existing = pdv.cart.find(c => c.productId === productId && !c.options?.length);
  if (existing) {
    existing.qty++;
    existing.total = existing.qty * existing.unitPrice;
  } else {
    pdv.cart.push({
      productId,
      name: p.name,
      unitPrice: Number(p.price || 0),
      qty: 1,
      total: Number(p.price || 0),
      options: [],
    });
  }
  pdvRenderCart();
  toast(`${p.name} adicionado!`);
}

async function pdvOpenOptions(product) {
  pdv.optProduct = product;
  pdv.optQty = 1;
  pdv.optSelections = {};
  pdv.optGroups = [];

  elid('pdv-opt-title').textContent = product.name;
  elid('pdv-opt-subtitle').textContent = `R$ ${fmt(product.price || 0)}`;
  elid('pdv-opt-qty').textContent = '1';

  const db = getSb();
  try {
    const { data: groups } = await db.from('product_option_groups').select('*').eq('product_id', product.id).eq('active', true).order('display_order');
    if (!groups?.length) {
      pdvAddProduct_direct(product);
      return;
    }
    const groupIds = groups.map(g => g.id);
    const { data: items } = await db.from('product_option_items').select('*').in('group_id', groupIds).eq('active', true).order('display_order');
    const itemsByGroup = {};
    (items||[]).forEach(i => { (itemsByGroup[i.group_id] = itemsByGroup[i.group_id] || []).push(i); });

    pdv.optGroups = groups.map(g => ({
      ...g,
      items: itemsByGroup[g.id] || [],
    }));

    pdv.optGroups.forEach(g => { pdv.optSelections[g.id] = []; });
  } catch(e) {
    console.warn('Erro ao carregar opções:', e);
    pdvAddProduct_direct(product);
    return;
  }

  pdvRenderOptionsModal();
  elid('pdv-options-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function pdvAddProduct_direct(product) {
  const existing = pdv.cart.find(c => c.productId === product.id && !c.options?.length);
  if (existing) {
    existing.qty++;
    existing.total = existing.qty * existing.unitPrice;
  } else {
    pdv.cart.push({
      productId: product.id,
      name: product.name,
      unitPrice: Number(product.price || 0),
      qty: 1,
      total: Number(product.price || 0),
      options: [],
    });
  }
  pdvRenderCart();
  toast(`${product.name} adicionado!`);
}

function pdvRenderOptionsModal() {
  const body = elid('pdv-opt-body');
  if (!body) return;

  body.innerHTML = pdv.optGroups.map(g => {
    const sel = pdv.optSelections[g.id] || [];
    const isRadio = g.type === 'radio';
    const limitText = g.max_select > 0 ? `máx. ${g.max_select}` : '';
    const freeText = g.free_limit > 0 ? `${g.free_limit} grátis` : '';
    const infoText = [limitText, freeText].filter(Boolean).join(' · ');

    return `<div class="pdv-opt-group">
      <div class="pdv-opt-group-title">
        ${esc(g.title)}
        ${g.required ? '<span class="pdv-opt-req">Obrigatório</span>' : ''}
        ${infoText ? `<span class="pdv-opt-limit">(${infoText})</span>` : ''}
      </div>
      <div class="pdv-opt-items">
        ${g.items.map(item => {
          const isSelected = sel.includes(item.id);
          const priceLabel = item.price_delta > 0 ? `+R$ ${fmt(item.price_delta)}` : (item.price_delta === 0 ? '' : `R$ ${fmt(item.price_delta)}`);
          return `<div class="pdv-opt-item${isSelected?' selected':''}" data-type="${isRadio?'radio':'checkbox'}" onclick="pdvToggleOption('${g.id}','${item.id}','${g.type}',${g.max_select||0})">
            <span class="pdv-opt-item-check"><i class="fas fa-check"></i></span>
            <span class="pdv-opt-item-name">${esc(item.name)}</span>
            ${priceLabel ? `<span class="pdv-opt-item-price">${priceLabel}</span>` : ''}
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  pdvUpdateOptTotal();
}

function pdvToggleOption(groupId, itemId, type, maxSelect) {
  const sel = pdv.optSelections[groupId] || [];
  const idx = sel.indexOf(itemId);

  if (type === 'radio') {
    pdv.optSelections[groupId] = idx >= 0 ? [] : [itemId];
  } else {
    if (idx >= 0) {
      sel.splice(idx, 1);
    } else {
      if (maxSelect > 0 && sel.length >= maxSelect) {
        toast(`Máximo de ${maxSelect} opções neste grupo.`, true);
        return;
      }
      sel.push(itemId);
    }
    pdv.optSelections[groupId] = sel;
  }

  pdvRenderOptionsModal();
}

function pdvOptQty(delta) {
  pdv.optQty = Math.max(1, pdv.optQty + delta);
  elid('pdv-opt-qty').textContent = pdv.optQty;
  pdvUpdateOptTotal();
}

function pdvUpdateOptTotal() {
  const p = pdv.optProduct;
  if (!p) return;

  let optExtra = 0;
  pdv.optGroups.forEach(g => {
    const sel = pdv.optSelections[g.id] || [];
    const freeLimit = g.free_limit || 0;
    let freeUsed = 0;
    sel.forEach(itemId => {
      const item = g.items.find(i => i.id === itemId);
      if (!item) return;
      if (freeLimit > 0 && freeUsed < freeLimit) {
        freeUsed++;
      } else {
        optExtra += Number(item.price_delta || 0);
      }
    });
  });

  const unitTotal = Number(p.price || 0) + optExtra;
  const total = unitTotal * pdv.optQty;
  elid('pdv-opt-add-label').textContent = `Adicionar — R$ ${fmt(total)}`;
}

function pdvConfirmOptions() {
  const p = pdv.optProduct;
  if (!p) return;

  const requiredGroups = pdv.optGroups.filter(g => g.required);
  for (const g of requiredGroups) {
    const sel = pdv.optSelections[g.id] || [];
    if (!sel.length) {
      toast(`Escolha pelo menos uma opção em "${g.title}".`, true);
      return;
    }
  }

  const options = [];
  let optExtra = 0;

  pdv.optGroups.forEach(g => {
    const sel = pdv.optSelections[g.id] || [];
    if (!sel.length) return;
    const freeLimit = g.free_limit || 0;
    let freeUsed = 0;
    const selectedItems = sel.map(itemId => {
      const item = g.items.find(i => i.id === itemId);
      if (!item) return null;
      let charged = 0;
      if (freeLimit > 0 && freeUsed < freeLimit) {
        freeUsed++;
      } else {
        charged = Number(item.price_delta || 0);
        optExtra += charged;
      }
      return { name: item.name, price_delta: charged };
    }).filter(Boolean);

    options.push({ groupTitle: g.title, items: selectedItems });
  });

  const unitPrice = Number(p.price || 0) + optExtra;

  pdv.cart.push({
    productId: p.id,
    name: p.name,
    unitPrice,
    finalUnitPrice: unitPrice,
    qty: pdv.optQty,
    total: unitPrice * pdv.optQty,
    options,
  });

  pdvCloseOptions();
  pdvRenderCart();
  toast(`${p.name} adicionado com opções!`);
}

function pdvCloseOptions() {
  elid('pdv-options-overlay').style.display = 'none';
  document.body.style.overflow = '';
  pdv.optProduct = null;
  pdv.optGroups = [];
  pdv.optSelections = {};
}

function pdvCloseOptionsOutside(e) {
  if (e.target === elid('pdv-options-overlay')) pdvCloseOptions();
}

function pdvRenderCart() {
  const wrap = elid('pdv-cart-items');

  if (!pdv.cart.length) {
    wrap.innerHTML = '<p class="pdv-cart-empty"><i class="fas fa-basket-shopping"></i> Nenhum item adicionado</p>';
    elid('pdv-subtotal').textContent = 'R$ 0,00';
    elid('pdv-total').textContent = 'R$ 0,00';
    return;
  }

  wrap.innerHTML = pdv.cart.map((c, i) => {
    const optsHtml = (c.options||[]).map(og => `${og.groupTitle}: ${og.items.map(oi=>oi.name).join(', ')}`).join(' · ');
    return `<div class="pdv-item">
      <div class="pdv-item-info">
        <div class="pdv-item-name">${esc(c.name)}</div>
        ${optsHtml ? `<div class="pdv-item-opts">${esc(optsHtml)}</div>` : ''}
        <div class="pdv-item-price">R$ ${fmt(c.total)}</div>
      </div>
      <div class="pdv-item-actions">
        <button class="pdv-qty-btn" onclick="pdvChangeQty(${i},-1)"><i class="fas fa-minus"></i></button>
        <span class="pdv-item-qty">${c.qty}</span>
        <button class="pdv-qty-btn" onclick="pdvChangeQty(${i},1)"><i class="fas fa-plus"></i></button>
        <button class="pdv-item-remove" onclick="pdvRemoveItem(${i})"><i class="fas fa-trash"></i></button>
      </div>
    </div>`;
  }).join('');

  const subtotal = pdv.cart.reduce((s, c) => s + c.total, 0);
  elid('pdv-subtotal').textContent = `R$ ${fmt(subtotal)}`;
  elid('pdv-total').textContent = `R$ ${fmt(subtotal)}`;
}

function pdvChangeQty(index, delta) {
  const item = pdv.cart[index];
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  item.total = item.qty * item.unitPrice;
  pdvRenderCart();
}

function pdvRemoveItem(index) {
  pdv.cart.splice(index, 1);
  pdvRenderCart();
}

async function pdvClearCart() {
  if (pdv.cart.length) {
    const confirmed = await showConfirmModal({
      title: 'Limpar pedido?',
      message: 'Tem certeza que deseja limpar todos os itens do pedido presencial?',
      confirmText: 'Limpar',
      cancelText: 'Cancelar',
      danger: true,
    });
    if (!confirmed) return;
  }
  pdv.cart = [];
  pdv.tableNumber = null;
  elid('pdv-customer-name').value = '';
  elid('pdv-notes').value = '';
  pdvRenderMesas();
  pdvRenderCart();
}

async function pdvSave() {
  if (!pdv.cart.length) { toast('Adicione pelo menos um produto.', true); return; }
  if (!pdv.tableNumber) { toast('Selecione a mesa do cliente.', true); return; }

  const btn = elid('pdv-btn-save');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

  const customerName = (elid('pdv-customer-name')?.value || '').trim() || 'Cliente balcão';
  const notes = (elid('pdv-notes')?.value || '').trim();
  const subtotal = pdv.cart.reduce((s, c) => s + c.total, 0);
  const orderNumber = `DL-${Math.floor(Math.random() * 90000) + 10000}`;

  const orderItems = pdv.cart.map(c => ({
    name: c.name,
    qty: c.qty,
    unitPrice: c.unitPrice,
    finalUnitPrice: c.finalUnitPrice || c.unitPrice,
    total: c.total,
    options: c.options || [],
  }));

  const actor = getCurrentActor();
  const orderData = {
    order_number: orderNumber,
    customer_name: customerName,
    customer_phone: null,
    delivery_type: 'balcao',
    payment_method: 'a_definir',
    payment_status: 'pendente',
    paid_at: null,
    status: 'novo',
    total: subtotal,
    items: orderItems,
    notes: notes || null,
    order_source: 'balcao',
    table_number: pdv.tableNumber,
    created_by_user_id: actor.id,
    created_by_email: actor.email,
    handled_by_user_id: actor.id,
    handled_by_email: actor.email,
  };

  console.log('[PDV] Payload pedido presencial:', orderData);

  try {
    const { data, error } = await getSb().from('orders').insert(orderData).select('*').single();

    if (error) {
      console.error('[PDV] Erro ao criar pedido presencial:', {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        full: error,
      });

      const msg = error.message || '';
      if (msg.includes('order_source') || msg.includes('table_number')) {
        toast('Erro: execute as migrations SQL no Supabase antes de usar o Balcão.', true);
      } else {
        toast('Erro ao criar pedido: ' + (msg || 'tente novamente.'), true);
      }
      return;
    }

    gs.orders.unshift(data);
    gs.seenOrderIds.add(data.id);
    saveSeenOrderIds();
    updateOrderFilterCounts();

    logAuditAction('create_order', 'order', data.id, `#${orderNumber}`, null, { table: pdv.tableNumber, total: subtotal });

    pdv.cart = [];
    pdv.tableNumber = null;
    elid('pdv-customer-name').value = '';
    elid('pdv-notes').value = '';
    pdvRenderMesas();
    pdvRenderCart();

    toast('Pedido salvo com sucesso.');
  } catch(e) {
    console.error('[PDV] Erro inesperado ao criar pedido presencial:', {
      message: e?.message,
      details: e?.details,
      hint: e?.hint,
      code: e?.code,
      full: e,
    });
    toast('Erro ao criar pedido: ' + (e.message || 'tente novamente.'), true);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Salvar pedido'; }
  }
}

function pdvGetOccupiedTables() {
  const occupied = {};
  gs.orders.forEach(o => {
    if (!o.table_number) return;
    if (o.order_source !== 'balcao' && o.delivery_type !== 'balcao') return;
    const st = (o.status || '').toLowerCase();
    if (st === 'finalizado' || st === 'cancelado') return;
    occupied[o.table_number] = o.order_number || o.id?.slice(-8).toUpperCase() || '';
  });
  return occupied;
}

function pdvRenderMesas() {
  const grid = elid('pdv-mesa-grid');
  if (!grid) return;
  const occupied = pdvGetOccupiedTables();

  grid.innerHTML = Array.from({ length: 10 }, (_, i) => {
    const num = i + 1;
    const orderNum = occupied[num];
    const isOccupied = !!orderNum;
    const isSelected = pdv.tableNumber === num;

    let cls = 'pdv-mesa-btn';
    if (isSelected) cls += ' mesa-selected';
    else if (isOccupied) cls += ' mesa-ocupada';
    else cls += ' mesa-livre';

    const statusText = isSelected ? 'Selecionada' : (isOccupied ? 'Ocupada' : 'Livre');
    const orderLine = (isOccupied && !isSelected) ? `<span class="pdv-mesa-order">#${esc(orderNum)}</span>` : '';

    return `<button type="button" class="${cls}" ${isOccupied && !isSelected ? 'disabled' : ''} onclick="pdvSelectMesa(${num})">
      <span class="pdv-mesa-num">${num}</span>
      <span class="pdv-mesa-status">${statusText}</span>
      ${orderLine}
    </button>`;
  }).join('');
}

function pdvSelectMesa(num) {
  const occupied = pdvGetOccupiedTables();
  if (occupied[num] && pdv.tableNumber !== num) {
    toast(`Mesa ${num} está ocupada.`, true);
    return;
  }
  pdv.tableNumber = pdv.tableNumber === num ? null : num;
  pdvRenderMesas();
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
window.useStoreLocation                = useStoreLocation;
window.togglePwd                      = togglePwd;
window.openChangePasswordModal        = openChangePasswordModal;
window.closeChangePasswordModal       = closeChangePasswordModal;
window._pwdModalBgClick               = _pwdModalBgClick;
window.submitChangePassword           = submitChangePassword;
window.copyAccessInfo                 = copyAccessInfo;
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
window.confirmMarkAsPaid              = confirmMarkAsPaid;
window.selectPayModalMethod           = selectPayModalMethod;
window.confirmPayModal                = confirmPayModal;
window.cancelPayModal                 = cancelPayModal;
window.renderOrders                   = renderOrders;
window.refreshOrders                  = refreshOrders;
window.showToast                      = showToast;
window.showConfirmModal               = showConfirmModal;
window._confirmModalConfirm           = _confirmModalConfirm;
window._confirmModalCancel            = _confirmModalCancel;
window._confirmModalBgClick           = _confirmModalBgClick;
window.pdvInit                        = pdvInit;
window.pdvFilterProducts              = pdvFilterProducts;
window.pdvFilterCat                   = pdvFilterCat;
window.pdvAddProduct                  = pdvAddProduct;
window.pdvChangeQty                   = pdvChangeQty;
window.pdvRemoveItem                  = pdvRemoveItem;
window.pdvClearCart                    = pdvClearCart;
window.pdvSave                        = pdvSave;
window.pdvSelectMesa                  = pdvSelectMesa;
window.pdvCloseOptions                = pdvCloseOptions;
window.pdvCloseOptionsOutside         = pdvCloseOptionsOutside;
window.pdvConfirmOptions              = pdvConfirmOptions;
window.pdvToggleOption                = pdvToggleOption;
window.pdvOptQty                      = pdvOptQty;
window.setReportFilter                = setReportFilter;
window.showReportTab                  = showReportTab;
window.renderReports                  = renderReports;
window.exportReportCSV                = exportReportCSV;
window.printReport                    = printReport;
window.cancelReasonModalClose         = cancelReasonModalClose;
window.cancelReasonModalConfirm       = cancelReasonModalConfirm;
window._cancelReasonBgClick           = _cancelReasonBgClick;
