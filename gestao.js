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
  const titles = { produtos:'Produtos', pedidos:'Pedidos', vendas:'Vendas', balcao:'Balcão', caixa:'Caixa', despesas:'Despesas', estoque:'Estoque', relatorios:'Relatórios', config:'Configurações', acessos:'Acessos' };
  elid('dash-title').textContent = titles[name] || name;
  document.body.classList.toggle('is-balcao', name === 'balcao');
  gs.section = name;
  if (name === 'vendas')      renderSales();
  if (name === 'config')      { loadConfig(); waCheckStatus(); }
  if (name === 'acessos')     renderUserInfo();
  if (name === 'pedidos')     loadOrders();
  if (name === 'balcao')      pdvInit();
  if (name === 'relatorios')  initReports();
  if (name === 'caixa')       initCaixa();
  if (name === 'despesas')    initDespesas();
  if (name === 'estoque')     initEstoque();
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
      const oldP = gs.products.find(x => x.id === existingId);
      ({ error: err } = await getSb().from('products').update(data).eq('id', existingId));
      if (!err) {
        showToast('Produto salvo com sucesso.', 'success');
        const meta = { before: {}, after: {} };
        if (oldP) {
          if (oldP.name !== name) { meta.before.nome = oldP.name; meta.after.nome = name; }
          if (oldP.price !== price) { meta.before.preco = oldP.price; meta.after.preco = price; }
          if (oldP.category !== cat) { meta.before.categoria = oldP.category; meta.after.categoria = cat; }
          if (oldP.active !== data.active) { meta.before.ativo = oldP.active; meta.after.ativo = data.active; }
          if (oldP.image_url !== imgUrl) { meta.before.imagem = oldP.image_url ? 'sim' : 'nao'; meta.after.imagem = imgUrl ? 'sim' : 'nao'; }
        }
        logAuditAction('edit_product', 'product', existingId, name, null, meta);
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
  openOrderDetailModal(orderId);
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
  try {
    await fetch(`${WORKER_URL}/order-status-notification`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: id, new_status: 'cancelado', cancel_reason: reason }),
    });
  } catch (_) {}
  await loadOrders();
  if (pdv.initialized) { pdvRenderMesas(); pdvExitTableViewIfStale(); }
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

  const date  = o.created_at ? new Date(o.created_at).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) + ' — ' + new Date(o.created_at).toLocaleDateString('pt-BR') : '—';
  const num   = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
  const items = Array.isArray(o.items) ? o.items : (typeof o.items === 'string' ? JSON.parse(o.items||'[]') : []);
  const isBalcao = o.delivery_type ? o.delivery_type === 'balcao' : o.order_source === 'balcao';
  const originLabel = isBalcao ? 'Balcão' : (o.delivery_type === 'pickup' ? 'Retirada' : (o.delivery_type === 'delivery' || (!isBalcao && o.delivery_type !== 'pickup') ? 'Entrega' : 'Online'));
  const originIcon = isBalcao ? 'fa-cash-register' : (o.delivery_type === 'pickup' ? 'fa-store' : 'fa-motorcycle');
  const creator = o.created_by_email?.split('@')[0] || (isBalcao ? null : 'Cliente online');
  const isPaid = isPaidOrder(o);
  const payLabel = getPaymentLabel(o);
  const psLabel = getOrderPayStatusText(o);
  const psCls = getOrderPayStatusCls(o);
  const fee = Number(o.delivery_fee || 0);

  const itemsPreview = items.slice(0, 3);
  const extraCount = items.length - 3;

  const printedAt = o.printed_at ? new Date(o.printed_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : null;

  return `
    <div class="oc ${stClass[o.status]||''}${gs.newOrderIds.has(o.id)?' oc-new':''}">

      <!-- CABEÇALHO -->
      <div class="oc-head">
        <div class="oc-head-left">
          <span class="oc-num">#${esc(num)}</span>
          <span class="oc-origin-badge"><i class="fas ${originIcon}"></i> ${originLabel}</span>
          ${isBalcao && o.table_number ? `<span class="oc-mesa-badge"><i class="fas fa-chair"></i> Mesa ${o.table_number}</span>` : ''}
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
          <span class="oc-field-label">${isBalcao ? 'Tipo' : 'Tipo do pedido'}</span>
          <span class="oc-field-value"><i class="fas ${originIcon}" style="color:var(--primary)"></i> ${isBalcao ? (o.table_number ? `Mesa ${o.table_number}` : 'Balcão') : originLabel}</span>
        </div>
        <div class="oc-field">
          <span class="oc-field-label">Pagamento</span>
          <span class="oc-field-value">${esc(payLabel)}${o.troco?` <small class="oc-troco">troco p/ R$ ${esc(String(o.troco))}</small>`:''}</span>
        </div>
        <div class="oc-field">
          <span class="oc-field-label">Status pagamento</span>
          <span class="oc-field-value"><span class="oc-ps-badge ${psCls}">${psLabel}</span></span>
        </div>
        <div class="oc-field">
          <span class="oc-field-label">Total</span>
          <span class="oc-field-value oc-total-val">R$ ${fmt(o.total||0)}</span>
        </div>
      </div>

      <!-- ITENS RESUMIDOS -->
      <div class="oc-items-preview">
        ${itemsPreview.map(i => {
          const t = i.total || (i.finalUnitPrice||i.unitPrice||0)*(i.qty||1) || 0;
          return `<div class="oc-item-row"><span>${i.qty||1}x ${esc(i.name||'?')}</span><span>R$ ${fmt(t)}</span></div>`;
        }).join('')}
        ${extraCount > 0 ? `<div class="oc-item-more">+ ${extraCount} ${extraCount === 1 ? 'item' : 'itens'}</div>` : ''}
      </div>

      <!-- RESUMO FINANCEIRO + INFO -->
      <div class="oc-summary-row">
        <div class="oc-summary-col">
          <span class="oc-summary-label">Subtotal</span>
          <span>R$ ${fmt(o.subtotal||0)}</span>
        </div>
        ${fee > 0 ? `<div class="oc-summary-col"><span class="oc-summary-label">Entrega</span><span>R$ ${fmt(fee)}</span></div>` : ''}
        <div class="oc-summary-col oc-summary-total">
          <span class="oc-summary-label">Total</span>
          <span>R$ ${fmt(o.total||0)}</span>
        </div>
      </div>

      <!-- BADGES EXTRAS -->
      <div class="oc-extra-info">
        ${creator ? `<span class="oc-info-tag"><i class="fas fa-user"></i> ${esc(creator)}</span>` : ''}
        ${printedAt ? `<span class="oc-info-tag oc-info-printed"><i class="fas fa-print"></i> Impressa ${printedAt}</span>` : '<span class="oc-info-tag oc-info-noprint"><i class="fas fa-print"></i> Não impressa</span>'}
        ${o.driver_name ? `<span class="oc-info-tag"><i class="fas fa-motorcycle"></i> ${esc(o.driver_name)}</span>` : ''}
        ${Number(o.discount_amount || 0) > 0 ? `<span class="oc-info-tag oc-info-cancel"><i class="fas fa-percent"></i> Desconto R$ ${fmt(o.discount_amount)}</span>` : ''}
        ${Number(o.refund_amount || 0) > 0 ? `<span class="oc-info-tag oc-info-cancel"><i class="fas fa-rotate-left"></i> Estorno R$ ${fmt(o.refund_amount)}</span>` : ''}
        ${Number(o.courtesy_amount || 0) > 0 ? `<span class="oc-info-tag"><i class="fas fa-gift"></i> Cortesia R$ ${fmt(o.courtesy_amount)}</span>` : ''}
        ${o.cancel_reason ? `<span class="oc-info-tag oc-info-cancel"><i class="fas fa-ban"></i> ${esc(o.cancel_reason)}</span>` : ''}
      </div>

      <!-- RODAPÉ: botões -->
      <div class="oc-footer">
        <button class="btn-oc-detail" onclick="openOrderDetailModal('${o.id}')"><i class="fas fa-eye"></i> Ver detalhes</button>
        <div class="oc-footer-actions">
          ${o.status!=='cancelado'?`<button class="btn-oc-print" onclick="printOrderReceipt('${o.id}')">
            <i class="fas fa-receipt"></i> ${(o.printed_at || gs.printedOrderIds.has(o.id))?'Reimprimir':'Imprimir'}
          </button>`:''}
          ${(!isPaid && !['cancelado'].includes(o.status))?`<button class="btn-oc-paid" onclick="confirmMarkAsPaid('${o.id}')"><i class="fas fa-hand-holding-dollar"></i> Pago</button>`:''}
          ${(isPaid && !['cancelado'].includes(o.status) && !o.refund_amount)?`<button class="btn-sale-detail" onclick="applyDiscount('${o.id}')"><i class="fas fa-percent"></i></button><button class="btn-sale-detail" onclick="applyCourtesy('${o.id}')"><i class="fas fa-gift"></i></button><button class="btn-oc-cancel" onclick="refundPayment('${o.id}')"><i class="fas fa-rotate-left"></i> Estornar</button>`:''}
          ${(!isBalcao && o.delivery_type !== 'pickup' && !o.driver_name && !['cancelado'].includes(o.status))?`<button class="btn-sale-detail" onclick="assignDriver('${o.id}')"><i class="fas fa-motorcycle"></i> Entregador</button>`:''}
          ${!['finalizado','cancelado'].includes(o.status)?`<button class="btn-oc-cancel" onclick="confirmCancelOrder('${o.id}')"><i class="fas fa-ban"></i> Cancelar</button>`:''}
          <div class="oc-status-btns">${statusBtns(o)}</div>
        </div>
      </div>

    </div>`;
}

function getOrderPayStatusText(o) {
  if (isPaidOrder(o)) return 'Pago ✓';
  if (o.payment_status === 'pendente' || !o.payment_status) return 'Pendente';
  if (o.payment_status === 'aguardando_pagamento') return 'Aguardando pag.';
  if (o.payment_status === 'aguardando_comprovante') return 'Aguardando comprovante';
  if (o.payment_status === 'checkout_criado') return 'Checkout criado';
  if (o.payment_status === 'pagamento_na_entrega') return 'Na entrega';
  if (o.payment_status === 'cancelado') return 'Cancelado';
  return 'Pendente';
}

function getOrderPayStatusCls(o) {
  if (isPaidOrder(o)) return 'ps-paid';
  if (o.payment_status === 'cancelado') return 'ps-cancelled';
  if (o.payment_status === 'pagamento_na_entrega') return 'ps-delivery';
  return 'ps-waiting';
}

/* ── Order Detail Modal ── */
async function openOrderDetailModal(orderId) {
  const o = gs.orders.find(x => x.id === orderId);
  if (!o) return;
  const num = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
  const items = Array.isArray(o.items) ? o.items : [];
  const date = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '—';
  const isBalcao = o.delivery_type ? o.delivery_type === 'balcao' : o.order_source === 'balcao';
  const originLabel = isBalcao ? 'Balcão' : (o.delivery_type === 'pickup' ? 'Retirada' : 'Entrega');
  const loc = o.location && typeof o.location === 'object' ? o.location : null;
  const addrTxt = o.customer_address_text || loc?.address || '';
  const creator = o.created_by_email?.split('@')[0] || (isBalcao ? 'Sem registro' : 'Cliente online');
  const payer   = o.paid_by_email?.split('@')[0] || (isPaidOrder(o) ? 'Sem registro' : '—');
  const handler = o.handled_by_email?.split('@')[0] || creator;
  const isPaid = isPaidOrder(o);
  const paidDate = o.paid_at ? new Date(o.paid_at).toLocaleString('pt-BR') : '—';
  const printedAt = o.printed_at ? new Date(o.printed_at).toLocaleString('pt-BR') : null;

  let logs = [];
  try {
    const { data } = await getSb().from('audit_logs').select('*')
      .eq('entity_type', 'order').eq('entity_id', orderId)
      .order('created_at', { ascending: false }).limit(30);
    logs = data || [];
  } catch(_) {}

  elid('order-detail-subtitle').textContent = `Pedido #${num}`;

  let html = `<div class="od-tabs">
    <button class="od-tab active" onclick="showOrderDetailTab('resumo')">Resumo</button>
    <button class="od-tab" onclick="showOrderDetailTab('itens')">Itens</button>
    <button class="od-tab" onclick="showOrderDetailTab('financeiro')">Financeiro</button>
    ${(!isBalcao && loc) || isBalcao ? `<button class="od-tab" onclick="showOrderDetailTab('local')">${isBalcao ? 'Mesa' : 'Entrega'}</button>` : ''}
    <button class="od-tab" onclick="showOrderDetailTab('historico')">Histórico</button>
  </div>`;

  html += `<div class="od-panel" id="od-panel-resumo">
    <div class="sd-grid">
      <div class="sd-box">
        <div class="sd-box-title"><i class="fas fa-info-circle"></i> Informações</div>
        <div class="sd-row"><span class="sd-label">Pedido</span><span class="sd-value">#${esc(num)}</span></div>
        <div class="sd-row"><span class="sd-label">Origem</span><span class="sd-value">${originLabel}</span></div>
        ${isBalcao && o.table_number ? `<div class="sd-row"><span class="sd-label">Mesa</span><span class="sd-value">${o.table_number}</span></div>` : ''}
        <div class="sd-row"><span class="sd-label">Cliente</span><span class="sd-value">${esc(o.customer_name || '—')}</span></div>
        ${o.customer_phone ? `<div class="sd-row"><span class="sd-label">Telefone</span><span class="sd-value">${esc(o.customer_phone)}</span></div>` : ''}
        <div class="sd-row"><span class="sd-label">Data</span><span class="sd-value">${date}</span></div>
        <div class="sd-row"><span class="sd-label">Status</span><span class="sd-value"><span class="oc-badge ${stClassMap[o.status] || ''}" style="font-size:.72rem">${ORDER_STATUS_LABELS[o.status] || o.status}</span></span></div>
      </div>
      <div class="sd-box">
        <div class="sd-box-title"><i class="fas fa-users"></i> Rastreio</div>
        <div class="sd-row"><span class="sd-label">Criado por</span><span class="sd-value">${esc(creator)}</span></div>
        <div class="sd-row"><span class="sd-label">Atendido por</span><span class="sd-value">${esc(handler)}</span></div>
        <div class="sd-row"><span class="sd-label">Pagamento</span><span class="sd-value">${esc(getPaymentLabel(o))}</span></div>
        <div class="sd-row"><span class="sd-label">Status pag.</span><span class="sd-value"><span class="oc-ps-badge ${getOrderPayStatusCls(o)}">${getOrderPayStatusText(o)}</span></span></div>
        ${isPaid ? `<div class="sd-row"><span class="sd-label">Pago em</span><span class="sd-value">${paidDate}</span></div>` : ''}
        <div class="sd-row"><span class="sd-label">Confirmado por</span><span class="sd-value">${esc(payer)}</span></div>
        <div class="sd-row"><span class="sd-label">Comanda</span><span class="sd-value">${printedAt ? `Impressa ${printedAt}` : 'Não impressa'}</span></div>
        ${o.cancel_reason ? `<div class="sd-row"><span class="sd-label">Cancelamento</span><span class="sd-value" style="color:var(--danger)">${esc(o.cancel_reason)}</span></div>` : ''}
      </div>
    </div>
  </div>`;

  html += `<div class="od-panel" id="od-panel-itens" style="display:none">
    <table class="sd-items-table">
      <thead><tr><th>Qtd</th><th>Produto</th><th>Opções</th><th>Obs</th><th>Unitário</th><th>Total</th></tr></thead>
      <tbody>${items.map(i => {
        const opts = (i.options || []).map(og => `${og.groupTitle}: ${(og.items || []).map(oi => oi.name).join(', ')}`).join(' · ');
        const unit = i.finalUnitPrice || i.unitPrice || i.price || 0;
        const total = i.total || (unit * (i.qty || 1));
        return `<tr><td>${i.qty||1}</td><td><strong>${esc(i.name||'—')}</strong></td><td class="sd-opts-cell">${opts || '—'}</td><td class="sd-opts-cell">${i.notes ? esc(i.notes) : '—'}</td><td>R$ ${fmt(unit)}</td><td>R$ ${fmt(total)}</td></tr>`;
      }).join('')}</tbody>
    </table>
    ${o.notes ? `<p class="sd-obs" style="margin-top:12px"><strong>Obs do pedido:</strong> ${esc(o.notes)}</p>` : ''}
  </div>`;

  html += `<div class="od-panel" id="od-panel-financeiro" style="display:none">
    <div class="sd-box">
      <div class="sd-row"><span class="sd-label">Subtotal</span><span class="sd-value">R$ ${fmt(o.subtotal||0)}</span></div>
      <div class="sd-row"><span class="sd-label">Taxa de entrega</span><span class="sd-value">${Number(o.delivery_fee||0) > 0 ? `R$ ${fmt(o.delivery_fee)}` : 'Grátis'}</span></div>
      ${o.troco ? `<div class="sd-row"><span class="sd-label">Troco para</span><span class="sd-value">R$ ${esc(String(o.troco))}</span></div>` : ''}
      <div class="sd-row sd-row-total"><span class="sd-label">Total</span><span class="sd-value">R$ ${fmt(o.total||0)}</span></div>
      <div class="sd-row"><span class="sd-label">Forma de pagamento</span><span class="sd-value">${esc(getPaymentLabel(o))}</span></div>
      <div class="sd-row"><span class="sd-label">Status pagamento</span><span class="sd-value"><span class="oc-ps-badge ${getOrderPayStatusCls(o)}">${getOrderPayStatusText(o)}</span></span></div>
      ${isPaid ? `<div class="sd-row"><span class="sd-label">Pago em</span><span class="sd-value">${paidDate}</span></div>` : ''}
      <div class="sd-row"><span class="sd-label">Confirmado por</span><span class="sd-value">${esc(payer)}</span></div>
    </div>
  </div>`;

  if ((!isBalcao && loc) || isBalcao) {
    html += `<div class="od-panel" id="od-panel-local" style="display:none"><div class="sd-box">`;
    if (isBalcao) {
      html += `<div class="sd-row"><span class="sd-label">Mesa</span><span class="sd-value">${o.table_number || '—'}</span></div>
        <div class="sd-row"><span class="sd-label">Criado por</span><span class="sd-value">${esc(creator)}</span></div>
        <div class="sd-row"><span class="sd-label">Horário</span><span class="sd-value">${date}</span></div>`;
    } else {
      html += `${addrTxt ? `<div class="sd-row"><span class="sd-label">Endereço</span><span class="sd-value">${esc(addrTxt)}</span></div>` : ''}
        <div class="sd-row"><span class="sd-label">Taxa de entrega</span><span class="sd-value">${Number(o.delivery_fee||0) > 0 ? `R$ ${fmt(o.delivery_fee)}` : 'Grátis'}</span></div>`;
      if (loc?.mapsLink) html += `<div style="margin-top:10px"><a class="btn-oc-map" href="${esc(loc.mapsLink)}" target="_blank" rel="noopener"><i class="fas fa-map-location-dot"></i> Ver localização</a></div>`;
      if (loc?.routeLink) html += `<div style="margin-top:6px"><a class="btn-oc-route" href="${esc(loc.routeLink)}" target="_blank" rel="noopener"><i class="fas fa-route"></i> Abrir rota</a></div>`;
    }
    html += `</div></div>`;
  }

  html += `<div class="od-panel" id="od-panel-historico" style="display:none">`;
  if (logs.length) {
    html += `<table class="rpt-table"><thead><tr><th>Data/hora</th><th>Conta</th><th>Ação</th><th>Motivo</th></tr></thead><tbody>`;
    logs.forEach(l => {
      const d = new Date(l.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      const actor = l.actor_name || l.actor_email?.split('@')[0] || 'Sistema';
      const act = getFriendlyAction(l.action, l.entity_label, l.metadata);
      html += `<tr><td>${d}</td><td><strong>${esc(actor)}</strong></td><td>${esc(act)}</td><td>${l.reason ? esc(l.reason) : 'Sem observação'}</td></tr>`;
    });
    html += `</tbody></table>`;
  } else {
    html += `<p class="empty-msg">Nenhuma atividade registrada para este pedido.</p>`;
  }
  html += `</div>`;

  elid('order-detail-body').innerHTML = html;
  elid('order-detail-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

const stClassMap = { novo:'st-novo', em_preparo:'st-preparo', saiu_para_entrega:'st-entrega', finalizado:'st-finalizado', cancelado:'st-cancelado' };

function showOrderDetailTab(tab) {
  document.querySelectorAll('.od-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.od-panel').forEach(p => p.style.display = 'none');
  document.querySelectorAll('.od-tab').forEach(b => { if (b.textContent.toLowerCase().includes(tab.slice(0, 4))) b.classList.add('active'); });
  const panel = elid(`od-panel-${tab}`);
  if (panel) panel.style.display = '';
}

function closeOrderDetail() {
  elid('order-detail-overlay').style.display = 'none';
  document.body.style.overflow = '';
}
function closeOrderDetailOutside(e) {
  if (e.target === elid('order-detail-overlay')) closeOrderDetail();
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
  const o = gs.orders.find(x => x.id === id);
  const oldStatus = o?.status || '';
  if (status === 'cancelado') { confirmCancelOrder(id); return; }
  const now = new Date().toISOString();
  const update = { status, updated_at: now };
  if (status === 'em_preparo' && !o?.preparing_at) update.preparing_at = now;
  if (status === 'saiu_para_entrega' && !o?.out_for_delivery_at) update.out_for_delivery_at = now;
  if (status === 'finalizado' && !o?.finished_at) update.finished_at = now;
  const { error } = await getSb().from('orders').update(update).eq('id', id);
  if (error) { toast('Erro ao atualizar status.', true); return; }
  toast('Status atualizado!');
  const num = o?.order_number || id?.slice(-8).toUpperCase() || '';
  logAuditAction('change_status', 'order', id, `#${num}`, null, { before: { status: oldStatus }, after: { status }, source: 'gestao' });

  if (['em_preparo', 'saiu_para_entrega', 'finalizado'].includes(status)) {
    try {
      const res = await fetch(`${WORKER_URL}/order-status-notification`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: id, new_status: status }),
      });
      const result = await res.json();
      if (result.sent) toast('Notificação enviada ao cliente.');
      else if (result.reason === 'queued_for_local_agent') { /* agente local envia */ }
      else if (result.reason === 'not_configured') { /* silencioso */ }
      else if (result.reason === 'no_phone') { /* sem telefone */ }
      else if (result.reason === 'already_notified') { /* já notificado */ }
    } catch (_) { /* não bloqueia */ }
  }

  await loadOrders();
  if (pdv.initialized) { pdvRenderMesas(); pdvExitTableViewIfStale(); }
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
  if (pdv.initialized) { pdvRenderMesas(); pdvExitTableViewIfStale(); }
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
    const items = Array.isArray(o.items) ? o.items : [];
    o.printed_at = nowIso;
    o.printed_items_count = items.length;
    await getSb().from('orders').update({ printed_at: nowIso, printed_items_count: items.length }).eq('id', o.id);
  } catch (e) {
    console.warn('Erro ao marcar comanda como impressa:', e);
  }
}

function buildReceiptHtml(orders) {
  const blocks = orders.map(o => buildReceiptBlock(o)).join('');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Day Lanches — Comanda</title>
<style>
  @page { size: 80mm auto; margin: 3mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12px; color: #000; background: #fff; width: 74mm; max-width: 100%; margin: 0 auto; padding: 2mm; line-height: 1.4; }
  .rc { margin-bottom: 10mm; page-break-after: always; }
  .rc:last-child { page-break-after: auto; }
  .rc-hd { text-align: center; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 4px; }
  .rc-brand { font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: .06em; }
  .rc-sub { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .15em; }
  .rc-sep { border: none; border-top: 1px dashed #000; margin: 5px 0; }
  .rc-row { display: flex; justify-content: space-between; gap: 4px; font-size: 11px; }
  .rc-lbl { font-size: 9px; font-weight: 700; text-transform: uppercase; color: #555; letter-spacing: .04em; }
  .rc-val { font-weight: 700; }
  .rc-type { text-align: center; font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: .1em; padding: 3px 0; border: 2px solid #000; margin: 4px 0; }
  .rc-mesa { text-align: center; font-size: 15px; font-weight: 900; padding: 2px 0; }
  .rc-status { text-align: center; font-size: 11px; font-weight: 900; text-transform: uppercase; padding: 3px 0; border: 1px solid #000; margin: 3px 0; }
  .rc-item { display: flex; justify-content: space-between; padding: 2px 0; font-weight: 700; font-size: 12px; }
  .rc-item + .rc-item { border-top: 1px dotted #ccc; }
  .rc-opt { margin-left: 10px; font-size: 10px; color: #333; font-weight: 400; }
  .rc-total { display: flex; justify-content: space-between; font-size: 14px; font-weight: 900; padding: 4px 0; }
  .rc-ft { text-align: center; font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: .03em; color: #555; margin-top: 4px; }
  .rc-print { display: block; margin: 10px auto; padding: 8px 20px; font-size: 13px; border: none; background: #FF6B00; color: #fff; cursor: pointer; font-weight: 700; border-radius: 4px; }
  @media print { .no-print { display: none !important; } }
</style>
</head>
<body>
  ${blocks}
  <button class="rc-print no-print" onclick="window.print()">Imprimir</button>
</body>
</html>`;
}

function buildReceiptBlock(o) {
  const num = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
  const items = Array.isArray(o.items) ? o.items : (typeof o.items === 'string' ? JSON.parse(o.items || '[]') : []);
  const loc = o.location && typeof o.location === 'object' ? o.location : null;
  const dateTime = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '—';
  /* payment_method 'a_definir' (ou vazio) nunca aparece na comanda impressa —
     é só o estado interno de "mesa ainda não fechou a conta". */
  const showPayMethod = !!o.payment_method && o.payment_method !== 'a_definir';
  const isBalcao = o.delivery_type ? o.delivery_type === 'balcao' : o.order_source === 'balcao';
  const isDelivery = o.delivery_type === 'delivery';
  const hasMesa = isBalcao && o.table_number;
  const typeLabel = isDelivery ? 'DELIVERY' : (isBalcao ? 'BALCÃO' : (o.delivery_type === 'pickup' ? 'RETIRADA' : 'ENTREGA'));
  const fee = Number(o.delivery_fee || 0);
  const addressText = o.customer_address_text || loc?.address || '';

  const itemsHtml = items.map(i => {
    const t = i.total || (i.finalUnitPrice || i.unitPrice || 0) * (i.qty || 1) || 0;
    const opts = (i.options || []).map(og => `<div class="rc-opt">· ${esc(og.groupTitle)}: ${(og.items || []).map(oi => esc(oi.name)).join(', ')}</div>`).join('');
    const note = i.notes ? `<div class="rc-opt">Obs: ${esc(i.notes)}</div>` : '';
    return `<div class="rc-item"><span>${i.qty || 1}x ${esc(i.name)}</span><span>R$ ${fmt(t)}</span></div>${opts}${note}`;
  }).join('');

  let html = `<div class="rc">
  <div class="rc-hd">
    <div class="rc-brand">Day Lanches</div>
    <div class="rc-sub">Comanda do pedido</div>
  </div>
  <div class="rc-row"><span>Pedido: <strong>#${esc(num)}</strong></span><span>${dateTime}</span></div>
  <hr class="rc-sep">
  <div class="rc-type">${typeLabel}${hasMesa ? ` — MESA ${o.table_number}` : ''}</div>`;

  if (hasMesa && !typeLabel.includes('MESA')) {
    html += `<div class="rc-mesa">MESA ${o.table_number}</div>`;
  }

  html += `<hr class="rc-sep">
  <div><span class="rc-lbl">Cliente</span><br><span class="rc-val">${esc(o.customer_name || '—')}</span></div>`;

  if (isDelivery) {
    if (o.customer_phone) html += `<div><span class="rc-lbl">Telefone</span><br><span class="rc-val">${esc(o.customer_phone)}</span></div>`;
    if (addressText) html += `<div style="margin-top:2px"><span class="rc-lbl">Endereço</span><br><span class="rc-val" style="font-size:10px;white-space:pre-line">${esc(addressText)}</span></div>`;
    if (loc?.neighborhood) html += `<div><span class="rc-lbl">Bairro</span><br><span class="rc-val">${esc(loc.neighborhood)}</span></div>`;
    if (loc?.complement) html += `<div><span class="rc-lbl">Complemento</span><br><span class="rc-val">${esc(loc.complement)}</span></div>`;
    if (loc?.reference) html += `<div><span class="rc-lbl">Referência</span><br><span class="rc-val">${esc(loc.reference)}</span></div>`;
    if (fee > 0) html += `<div><span class="rc-lbl">Taxa de entrega</span><br><span class="rc-val">R$ ${fmt(fee)}</span></div>`;

    html += `<hr class="rc-sep">`;
    if (showPayMethod) html += `<div class="rc-status">FORMA DE PAGAMENTO: ${esc(getPaymentLabel(o).toUpperCase())}</div>`;

    if (o.notes) html += `<div style="margin-top:3px"><span class="rc-lbl">Observação</span><br><span style="font-size:11px">${esc(o.notes)}</span></div>`;

    html += `<hr class="rc-sep">
  <div class="rc-lbl">Itens</div>
  ${itemsHtml || '<div>—</div>'}`;

    html += `<hr class="rc-sep">
  <div class="rc-row" style="font-size:11px"><span>Subtotal</span><span>R$ ${fmt(o.subtotal || 0)}</span></div>`;
    if (fee > 0) html += `<div class="rc-row" style="font-size:11px"><span>Taxa de entrega</span><span>R$ ${fmt(fee)}</span></div>`;
    html += `<div class="rc-total"><span>TOTAL</span><span>R$ ${fmt(o.total || 0)}</span></div>`;
  } else {
    if (!isBalcao && o.customer_phone) html += `<div><span class="rc-lbl">Telefone</span><br><span class="rc-val">${esc(o.customer_phone)}</span></div>`;
    if (!isBalcao && addressText) html += `<div style="margin-top:2px"><span class="rc-lbl">Endereço</span><br><span class="rc-val" style="font-size:10px">${esc(addressText)}</span></div>`;

    html += `<hr class="rc-sep">`;
    if (showPayMethod) html += `<div class="rc-status">FORMA DE PAGAMENTO: ${esc(getPaymentLabel(o).toUpperCase())}</div>`;

    html += `<hr class="rc-sep">
  <div class="rc-lbl">Itens</div>
  ${itemsHtml || '<div>—</div>'}`;

    if (o.notes) html += `<div style="margin-top:3px"><span class="rc-lbl">Obs</span><br><span style="font-size:11px">${esc(o.notes)}</span></div>`;

    html += `<hr class="rc-sep">
  <div class="rc-row" style="font-size:11px"><span>Subtotal</span><span>R$ ${fmt(o.subtotal || 0)}</span></div>`;
    if (fee > 0) html += `<div class="rc-row" style="font-size:11px"><span>Entrega</span><span>R$ ${fmt(fee)}</span></div>`;
    html += `<div class="rc-total"><span>TOTAL</span><span>R$ ${fmt(o.total || 0)}</span></div>`;
  }

  html += `<hr class="rc-sep">
  <div class="rc-ft">Day Lanches — sabor que marca</div>
  </div>`;
  return html;
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

function getFilteredSalesOrdersWithFilters() {
  const base = getFilteredSalesOrders();
  const payFilter = elid('sales-filter-payment')?.value || '';
  const originFilter = elid('sales-filter-origin')?.value || '';
  const empFilter = elid('sales-filter-employee')?.value || '';

  return base.filter(o => {
    if (payFilter) {
      if (payFilter === 'online') { if (!isOnlinePayment(o) || o.payment_method === 'pix_loja' || o.payment_method === 'cartao_maquininha') return false; }
      else if (o.payment_method !== payFilter) return false;
    }
    if (originFilter === 'online' && o.order_source === 'balcao') return false;
    if (originFilter === 'balcao' && o.order_source !== 'balcao') return false;
    if (empFilter && o.created_by_email !== empFilter && o.paid_by_email !== empFilter && o.handled_by_email !== empFilter) return false;
    return true;
  });
}

function populateSalesEmployeeFilter() {
  const sel = elid('sales-filter-employee');
  if (!sel) return;
  const emails = new Set();
  gs.orders.forEach(o => {
    if (o.created_by_email) emails.add(o.created_by_email);
    if (o.paid_by_email) emails.add(o.paid_by_email);
    if (o.handled_by_email) emails.add(o.handled_by_email);
  });
  const current = sel.value;
  sel.innerHTML = '<option value="">Todos</option>';
  [...emails].sort().forEach(e => {
    sel.innerHTML += `<option value="${esc(e)}"${e === current ? ' selected' : ''}>${esc(e.split('@')[0])}</option>`;
  });
}

function renderSales() {
  renderSalesFilterUI();
  populateSalesEmployeeFilter();

  const orders  = getFilteredSalesOrdersWithFilters();
  const revenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const count   = orders.length;
  const avg     = count ? revenue / count : 0;
  const cash     = orders.filter(o => o.payment_method === 'dinheiro').reduce((s, o) => s + Number(o.total || 0), 0);
  const online   = orders.filter(o => isOnlinePayment(o) && o.payment_method !== 'pix_loja' && o.payment_method !== 'cartao_maquininha').reduce((s, o) => s + Number(o.total || 0), 0);
  const pixLoja  = orders.filter(o => o.payment_method === 'pix_loja').reduce((s, o) => s + Number(o.total || 0), 0);
  const cartMaq  = orders.filter(o => o.payment_method === 'cartao_maquininha').reduce((s, o) => s + Number(o.total || 0), 0);
  const totalFee = orders.reduce((s, o) => s + Number(o.delivery_fee || 0), 0);

  elid('sv-revenue').textContent = 'R$ ' + fmt(revenue);
  elid('sv-count').textContent   = count;
  elid('sv-avg').textContent     = 'R$ ' + fmt(avg);
  elid('sv-cash').textContent    = 'R$ ' + fmt(cash);
  elid('sv-online').textContent  = 'R$ ' + fmt(online);
  const svPixLoja = elid('sv-pix-loja');
  const svCartMaq = elid('sv-cartao-maq');
  const svFee     = elid('sv-fee');
  if (svPixLoja) svPixLoja.textContent = 'R$ ' + fmt(pixLoja);
  if (svCartMaq) svCartMaq.textContent = 'R$ ' + fmt(cartMaq);
  if (svFee)     svFee.textContent     = 'R$ ' + fmt(totalFee);

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

function getSaleOriginLabel(o) {
  if (o.delivery_type === 'delivery') return 'Entrega';
  if (o.delivery_type === 'pickup') return 'Retirada';
  if (o.delivery_type === 'balcao' || o.order_source === 'balcao') return 'Balcão';
  return 'Online';
}

function getSaleItemsSummary(o) {
  const items = Array.isArray(o.items) ? o.items : [];
  if (!items.length) return '—';
  if (items.length <= 2) return items.map(i => `${i.qty || 1}x ${i.name || '?'}`).join(', ');
  return `${items[0].qty || 1}x ${items[0].name || '?'} +${items.length - 1} itens`;
}

function salesRow(o) {
  const date  = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
  const num   = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
  const fee   = Number(o.delivery_fee || 0);
  const handler = o.created_by_email?.split('@')[0] || o.handled_by_email?.split('@')[0] || 'Sistema';
  return `<tr>
    <td data-label="Data">${date}</td>
    <td data-label="Pedido"><strong>#${esc(num)}</strong></td>
    <td data-label="Cliente">${esc(o.customer_name || '—')}</td>
    <td data-label="Origem"><span class="sales-origin-pill">${getSaleOriginLabel(o)}</span></td>
    <td data-label="Itens" class="sales-items-cell">${esc(getSaleItemsSummary(o))}</td>
    <td data-label="Subtotal">R$ ${fmt(o.subtotal || 0)}</td>
    <td data-label="Entrega">${fee > 0 ? `R$ ${fmt(fee)}` : '—'}</td>
    <td data-label="Total"><strong>R$ ${fmt(o.total || 0)}</strong></td>
    <td data-label="Pagamento">${esc(getPaymentLabel(o))}</td>
    <td data-label="Atendido por">${esc(handler)}</td>
    <td data-label="Ações"><button class="btn-sale-detail" onclick="openSaleDetail('${o.id}')"><i class="fas fa-eye"></i> Ver</button></td>
  </tr>`;
}

/* ── Sale Detail Modal ── */
function openSaleDetail(orderId) {
  const o = gs.orders.find(x => x.id === orderId);
  if (!o) return;
  const num = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
  const items = Array.isArray(o.items) ? o.items : [];
  const date = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '—';
  const isBalcao = o.delivery_type ? o.delivery_type === 'balcao' : o.order_source === 'balcao';
  const creator = o.created_by_email?.split('@')[0] || (isBalcao ? 'Sem registro' : 'Cliente online');
  const payer   = o.paid_by_email?.split('@')[0] || 'Sem registro';

  elid('sale-detail-subtitle').textContent = `Pedido #${num}`;

  let html = '<div class="sd-grid">';

  html += `<div class="sd-box">
    <div class="sd-box-title"><i class="fas fa-info-circle"></i> Informações</div>
    <div class="sd-row"><span class="sd-label">Pedido</span><span class="sd-value">#${esc(num)}</span></div>
    <div class="sd-row"><span class="sd-label">Cliente</span><span class="sd-value">${esc(o.customer_name || '—')}</span></div>
    ${o.customer_phone ? `<div class="sd-row"><span class="sd-label">Telefone</span><span class="sd-value">${esc(o.customer_phone)}</span></div>` : ''}
    <div class="sd-row"><span class="sd-label">Data</span><span class="sd-value">${date}</span></div>
    <div class="sd-row"><span class="sd-label">Origem</span><span class="sd-value">${getSaleOriginLabel(o)}</span></div>
    ${isBalcao && o.table_number ? `<div class="sd-row"><span class="sd-label">Mesa</span><span class="sd-value">${o.table_number}</span></div>` : ''}
    <div class="sd-row"><span class="sd-label">Criado por</span><span class="sd-value">${esc(creator)}</span></div>
    <div class="sd-row"><span class="sd-label">Pago por</span><span class="sd-value">${esc(payer)}</span></div>
  </div>`;

  html += `<div class="sd-box">
    <div class="sd-box-title"><i class="fas fa-receipt"></i> Resumo financeiro</div>
    <div class="sd-row"><span class="sd-label">Subtotal</span><span class="sd-value">R$ ${fmt(o.subtotal || 0)}</span></div>
    <div class="sd-row"><span class="sd-label">Taxa de entrega</span><span class="sd-value">${Number(o.delivery_fee || 0) > 0 ? `R$ ${fmt(o.delivery_fee)}` : 'Grátis'}</span></div>
    ${o.troco ? `<div class="sd-row"><span class="sd-label">Troco para</span><span class="sd-value">R$ ${esc(String(o.troco))}</span></div>` : ''}
    <div class="sd-row sd-row-total"><span class="sd-label">Total</span><span class="sd-value">R$ ${fmt(o.total || 0)}</span></div>
    <div class="sd-row"><span class="sd-label">Pagamento</span><span class="sd-value">${esc(getPaymentLabel(o))}</span></div>
    <div class="sd-row"><span class="sd-label">Status</span><span class="sd-value">${isPaidOrder(o) ? '<span class="rpt-pill rpt-pill-paid">Pago</span>' : '<span class="rpt-pill rpt-pill-pending">Pendente</span>'}</span></div>
  </div>`;

  html += '</div>';

  html += `<div class="sd-box sd-box-full">
    <div class="sd-box-title"><i class="fas fa-list-ul"></i> Itens comprados</div>
    <table class="sd-items-table">
      <thead><tr><th>Qtd</th><th>Produto</th><th>Opções</th><th>Unitário</th><th>Total</th></tr></thead>
      <tbody>`;
  items.forEach(i => {
    const opts = (i.options || []).map(og => `${og.groupTitle}: ${(og.items || []).map(oi => oi.name).join(', ')}`).join(' · ');
    const unit = i.finalUnitPrice || i.unitPrice || i.price || 0;
    const total = i.total || (unit * (i.qty || 1));
    html += `<tr>
      <td>${i.qty || 1}</td>
      <td><strong>${esc(i.name || '—')}</strong></td>
      <td class="sd-opts-cell">${opts ? esc(opts) : '—'}</td>
      <td>R$ ${fmt(unit)}</td>
      <td>R$ ${fmt(total)}</td>
    </tr>`;
  });
  html += `</tbody></table></div>`;

  if (o.notes) {
    html += `<div class="sd-box sd-box-full">
      <div class="sd-box-title"><i class="fas fa-comment"></i> Observações</div>
      <p class="sd-obs">${esc(o.notes)}</p>
    </div>`;
  }

  elid('sale-detail-body').innerHTML = html;
  elid('sale-detail-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeSaleDetail() {
  elid('sale-detail-overlay').style.display = 'none';
  document.body.style.overflow = '';
}
function closeSaleDetailOutside(e) {
  if (e.target === elid('sale-detail-overlay')) closeSaleDetail();
}

function csvEscape(val) {
  const s = String(val ?? '');
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function exportSalesCSV() {
  const orders = getFilteredSalesOrdersWithFilters();
  if (!orders.length) { toast('Nenhuma venda para exportar.', true); return; }

  const header = ['data','pedido','cliente','telefone','origem','itens','subtotal','taxa_entrega','total','pagamento','atendido_por','pago_por'];
  const rows = orders.map(o => {
    const date = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '';
    const num  = o.order_number || o.id?.slice(-8).toUpperCase() || '';
    const items = Array.isArray(o.items) ? o.items : [];
    const itemsText = items.map(i => `${i.qty || 1}x ${i.name || '?'}`).join('; ');
    const handler = o.created_by_email?.split('@')[0] || o.handled_by_email?.split('@')[0] || 'Sistema';
    const payer   = o.paid_by_email?.split('@')[0] || '';
    return [
      date, num, o.customer_name || '', o.customer_phone || '',
      getSaleOriginLabel(o), itemsText, fmt(o.subtotal || 0),
      fmt(o.delivery_fee || 0), fmt(o.total || 0),
      getPaymentLabel(o), handler, payer,
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
  const orders = getFilteredSalesOrdersWithFilters();
  if (!orders.length) { toast('Nenhuma venda no período selecionado.', true); return; }

  const revenue  = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalFee = orders.reduce((s, o) => s + Number(o.delivery_fee || 0), 0);
  const rows = orders.map(o => {
    const date = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
    const num  = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
    const items = Array.isArray(o.items) ? o.items : [];
    const itemsText = items.map(i => `${i.qty || 1}x ${i.name || '?'}`).join(', ');
    const handler = o.created_by_email?.split('@')[0] || o.handled_by_email?.split('@')[0] || 'Sistema';
    return `<tr>
      <td>${date}</td>
      <td>#${esc(num)}</td>
      <td>${esc(o.customer_name || '—')}</td>
      <td>${esc(getSaleOriginLabel(o))}</td>
      <td style="font-size:.78rem">${esc(itemsText)}</td>
      <td>R$ ${fmt(o.delivery_fee || 0)}</td>
      <td>R$ ${fmt(o.total || 0)}</td>
      <td>${esc(getPaymentLabel(o))}</td>
      <td>${esc(handler)}</td>
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
  table { width: 100%; border-collapse: collapse; font-size: .78rem; }
  th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: left; }
  th { background: #f5f5f5; font-size: .72rem; }
  .print-total { margin-top: 16px; font-size: 1rem; font-weight: 700; text-align: right; }
  .print-btn { margin-top: 20px; padding: 10px 24px; font-size: 1rem; border-radius: 8px; border: none; background: #FF6B00; color: #fff; cursor: pointer; }
  @media print { .no-print { display: none; } }
</style>
</head>
<body>
  <h1>Day Lanches — Relatório de Vendas</h1>
  <p class="print-period">Período: ${esc(getSalesPeriodLabel())}</p>
  <table>
    <thead><tr><th>Data</th><th>Pedido</th><th>Cliente</th><th>Origem</th><th>Itens</th><th>Entrega</th><th>Total</th><th>Pagamento</th><th>Atendido por</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="print-total">Total geral: R$ ${fmt(revenue)} · Taxas de entrega: R$ ${fmt(totalFee)} · ${orders.length} vendas</p>
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

const FALLBACK_SCHEDULE_TEXT = 'Quarta a domingo 17:30 às 23:00';

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
    gs.storeConfig = data;
    renderStoreLocationStatus();
    loadDriversList();
    pdvRenderCloseStoreButtons();
  } catch (e) { console.warn('Erro config:', e); }
}

/* ══════════════════════════════════════════════════════════
   FECHAMENTO MANUAL DA LOJA — "Fechar loja hoje"
   Reaproveita store_settings (mesma linha id='store' já usada acima).
   manual_closed_date só vale pro dia exato (America/Sao_Paulo) em que foi
   setado — no dia seguinte deixa de ter efeito sozinho, sem precisar de
   rotina de limpeza. Botões em ambos os cabeçalhos (Gestão normal e
   Balcão) usam a classe .js-close-store-btn (não IDs) pra atualizar os
   dois de uma vez, sem duplicar id.
══════════════════════════════════════════════════════════ */
const MANUAL_CLOSE_MAX_LEN = 180;

function getSaoPauloDateISO(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date || new Date());
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return `${y}-${m}-${d}`;
}

function isStoreManuallyClosedToday() {
  const d = gs.storeConfig?.manual_closed_date;
  return !!d && d === getSaoPauloDateISO();
}

/* Busca só os 3 campos de fechamento manual — chamado no login (antes de
   loadConfig(), que só roda quando a aba Configurações é aberta) pra que
   os dois cabeçalhos já mostrem o estado certo assim que a Gestão abre. */
async function pdvSyncCloseStoreState() {
  try {
    const { data, error } = await getSb().from('store_settings')
      .select('manual_closed_date, manual_closed_message, manual_closed_at')
      .eq('id', 'store').single();
    if (!error && data) gs.storeConfig = { ...(gs.storeConfig || {}), ...data };
  } catch (e) { console.warn('Erro ao carregar estado de fechamento manual:', e); }
  pdvRenderCloseStoreButtons();
}

function pdvRenderCloseStoreButtons() {
  const closedToday = isStoreManuallyClosedToday();
  document.querySelectorAll('.js-close-store-btn').forEach(btn => {
    btn.classList.toggle('is-closed', closedToday);
    btn.title = closedToday ? 'Loja fechada hoje — clique para reabrir' : 'Fechar loja hoje';
    const label = btn.querySelector('.btn-sound-label');
    if (label) label.textContent = closedToday ? 'Loja fechada hoje' : 'Fechar loja hoje';
  });
}

function pdvOpenCloseStoreModal() {
  if (isStoreManuallyClosedToday()) { pdvOpenReopenStoreModal(); return; }

  const message = `
    <p>A loja ficará fechada para pedidos durante o restante de hoje.</p>
    <label class="pdv-section-label" style="display:block;margin-top:10px">Observação para os clientes (opcional)</label>
    <textarea id="close-store-note" maxlength="${MANUAL_CLOSE_MAX_LEN}" rows="3"
      style="width:100%;resize:vertical;padding:8px;border-radius:8px;border:1.5px solid var(--border);font:inherit"
      placeholder="Ex.: Hoje não teremos atendimento. Voltamos amanhã normalmente."></textarea>`;

  showConfirmModal({
    title: 'Fechar loja hoje',
    message,
    confirmText: 'Fechar loja hoje',
    cancelText: 'Cancelar',
    danger: true,
  }).then(async (ok) => {
    if (!ok) return;
    const note = (elid('close-store-note')?.value || '').trim().slice(0, MANUAL_CLOSE_MAX_LEN);
    await pdvCloseStoreToday(note);
  });
}

function pdvOpenReopenStoreModal() {
  showConfirmModal({
    title: 'Reabrir loja hoje',
    message: '<p>A loja volta a seguir o horário normal de funcionamento imediatamente.</p>',
    confirmText: 'Reabrir loja hoje',
    cancelText: 'Cancelar',
  }).then(async (ok) => { if (ok) await pdvReopenStoreToday(); });
}

async function pdvCloseStoreToday(message) {
  const todayISO = getSaoPauloDateISO();
  const { error } = await getSb().from('store_settings').update({
    manual_closed_date: todayISO,
    manual_closed_message: message || null,
    manual_closed_at: new Date().toISOString(),
  }).eq('id', 'store');
  if (error) { toast('Erro ao fechar a loja: ' + error.message, true); return; }
  gs.storeConfig = { ...(gs.storeConfig || {}), manual_closed_date: todayISO, manual_closed_message: message || null };
  pdvRenderCloseStoreButtons();
  toast('Loja fechada para hoje.');
  logAuditAction('close_store_manual', 'config', 'store', 'Fechamento manual da loja', null, { date: todayISO, message: message || '' });
}

async function pdvReopenStoreToday() {
  const { error } = await getSb().from('store_settings').update({
    manual_closed_date: null,
    manual_closed_message: null,
    manual_closed_at: null,
  }).eq('id', 'store');
  if (error) { toast('Erro ao reabrir a loja: ' + error.message, true); return; }
  gs.storeConfig = { ...(gs.storeConfig || {}), manual_closed_date: null, manual_closed_message: null };
  pdvRenderCloseStoreButtons();
  toast('Loja reaberta.');
  logAuditAction('reopen_store_manual', 'config', 'store', 'Reabertura manual da loja', null, {});
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
    /* Não editável mais na UI (o site usa a tabela fixa de frete por
       distância, não mais R$/km) — preserva o que já estava salvo. */
    delivery_price_per_km: cfg.delivery_price_per_km,
    route_factor:          cfg.route_factor || 1.4,
    store_lat:             cfg.store_lat,
    store_lon:             cfg.store_lon,
    updated_at:            new Date().toISOString(),
  };
  const { error } = await getSb().from('store_settings').upsert(data);
  if (error) { toast('Erro ao salvar: ' + error.message, true); return; }
  toast('Configurações salvas!');
  const meta = { before: {}, after: {} };
  if (cfg.whatsapp !== data.whatsapp) { meta.before.whatsapp = cfg.whatsapp || ''; meta.after.whatsapp = data.whatsapp; }
  if (cfg.delivery_price_per_km !== data.delivery_price_per_km) { meta.before.frete_km = cfg.delivery_price_per_km; meta.after.frete_km = data.delivery_price_per_km; }
  const oldSched = typeof cfg.schedule === 'string' ? cfg.schedule : cfg.schedule?.text || '';
  const newSched = data.schedule?.text || '';
  if (oldSched !== newSched) { meta.before.horario = oldSched; meta.after.horario = newSched; }
  if (cfg.instagram !== data.instagram) { meta.before.instagram = cfg.instagram || ''; meta.after.instagram = data.instagram; }
  logAuditAction('save_config', 'config', 'store', 'Configurações da loja', null, meta);
  await loadConfig();
}

/* ── WhatsApp da loja ──
   Estado sempre consultado ao vivo em /whatsapp/status (Worker -> Evolution API).
   Nunca fixar "conectado" no código - a tela reflete exatamente o que a API responder. */

function waSetPill(html, kind) {
  const pill = elid('wa-status-pill');
  if (!pill) return;
  pill.innerHTML = html;
  pill.className = 'wa-pill wa-pill-' + kind;
}

function waShowConnectedView(connected) {
  const setup = elid('wa-setup-view');
  const connectedView = elid('wa-connected-view');
  if (setup) setup.style.display = connected ? 'none' : 'block';
  if (connectedView) connectedView.style.display = connected ? 'block' : 'none';
}

async function waCheckStatus() {
  waSetPill('<i class="fas fa-circle-notch fa-spin"></i> Verificando...', 'unknown');
  try {
    const res = await fetch(`${WORKER_URL}/whatsapp/status`);
    const data = await res.json();
    const state = (data.state || '').toLowerCase();
    const isConnected = !!data.configured && (state === 'open' || state === 'connected');

    waShowConnectedView(isConnected);

    if (isConnected) {
      waSetPill('<i class="fas fa-check-circle"></i> Conectado', 'connected');
    } else if (state === 'connecting') {
      waSetPill('<i class="fas fa-circle-notch fa-spin"></i> Conectando...', 'connecting');
    } else {
      waSetPill('<i class="fas fa-qrcode"></i> Aguardando conexão', 'waiting');
    }
  } catch (err) {
    waShowConnectedView(false);
    waSetPill('<i class="fas fa-exclamation-triangle"></i> Não foi possível verificar agora', 'waiting');
  }
}

async function waGenerateQR() {
  const imgContainer = elid('wa-qrcode-img');
  if (!imgContainer) return;
  imgContainer.innerHTML = '<span class="wa-qr-placeholder">Gerando QR Code...</span>';
  try {
    const res = await fetch(`${WORKER_URL}/whatsapp/qrcode`);
    const data = await res.json();
    if (data.error) {
      imgContainer.innerHTML = `<span class="wa-qr-error">${data.error}</span>`;
      return;
    }
    if (data.qrcode) {
      const src = data.qrcode.startsWith('data:') ? data.qrcode : `data:image/png;base64,${data.qrcode}`;
      imgContainer.innerHTML = `<img src="${src}" alt="QR Code WhatsApp">`;
    } else {
      imgContainer.innerHTML = '<span class="wa-qr-placeholder">QR Code não disponível no momento. Clique em "Atualizar status".</span>';
    }
  } catch (err) {
    imgContainer.innerHTML = '<span class="wa-qr-error">Erro ao gerar QR Code</span>';
  }
}

function waOpenTestModal() {
  const ov = elid('wa-test-overlay');
  if (ov) ov.style.display = 'flex';
  const input = elid('wa-test-phone');
  if (input) { input.value = ''; input.focus(); }
}

function waCloseTestModal() {
  const ov = elid('wa-test-overlay');
  if (ov) ov.style.display = 'none';
}

function waTestBgClick(e) {
  if (e.target === e.currentTarget) waCloseTestModal();
}

async function waSendTest() {
  const phone = getv('wa-test-phone');
  if (!phone || phone.replace(/\D/g, '').length < 10) {
    toast('Informe um telefone válido.', true);
    return;
  }
  const btn = elid('wa-test-send-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...'; }
  try {
    const res = await fetch(`${WORKER_URL}/whatsapp/test-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone.replace(/\D/g, '') }),
    });
    const data = await res.json();
    if (data.sent) {
      toast('Mensagem de teste enviada!');
      waCloseTestModal();
    } else if (data.reason === 'not_configured') {
      toast('Evolution API não configurada no Worker.', true);
    } else {
      toast('Falha ao enviar: ' + (data.reason || data.error || 'erro desconhecido'), true);
    }
  } catch (err) {
    toast('Erro ao enviar mensagem de teste.', true);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar teste'; }
  }
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
  loadProfiles();
  loadPrintAgentDevices();
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
    const meta = metadata || {};
    if (!meta.source) meta.source = 'gestao';
    const row = {
      actor_user_id: user?.id || null,
      actor_email:   user?.email || null,
      actor_name:    user?.user_metadata?.name || user?.email?.split('@')[0] || null,
      action,
      entity_type:   entityType,
      entity_id:     entityId || null,
      entity_label:  entityLabel || null,
      reason:        reason || null,
      metadata:      meta,
      source:        meta.source,
      user_agent:    navigator.userAgent || null,
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

const _FRIENDLY_ACTIONS = {
  create_order:           'Pedido criado',
  create_counter_order:   'Pedido criado no balcão',
  add_table_items:        'Itens adicionados ao pedido',
  cancel_order:           'Pedido cancelado',
  mark_paid:              'Pagamento confirmado',
  mark_order_paid:        'Pagamento confirmado',
  change_status:          'Status do pedido alterado',
  update_order_status:    'Status do pedido alterado',
  print_receipt:          'Comanda impressa',
  print_order_receipt:    'Comanda impressa',
  reprint_receipt:        'Comanda reimpressa',
  reprint_order_receipt:  'Comanda reimpressa',
  auto_print_order:       'Comanda impressa automaticamente',
  create_product:         'Produto cadastrado',
  edit_product:           'Produto editado',
  update_product:         'Produto editado',
  delete_product:         'Produto excluído',
  toggle_product:         'Status do produto alterado',
  save_config:            'Configurações da loja alteradas',
  update_store_config:    'Configurações da loja alteradas',
  close_store_manual:     'Loja fechada manualmente por hoje',
  reopen_store_manual:    'Loja reaberta manualmente',
  save_location:          'Localização da loja atualizada',
  update_location:        'Localização da loja atualizada',
  export_report:          'Exportação realizada',
  export_backup:          'Exportação realizada',
  export_data:            'Exportação realizada',
  print_report:           'Relatório impresso',
  change_password:        'Senha alterada',
  open_cash_register:     'Caixa aberto',
  close_cash_register:    'Caixa fechado',
  create_expense:         'Despesa registrada',
  update_expense:         'Despesa alterada',
  cancel_expense:         'Despesa cancelada',
  create_inventory_item:  'Item de estoque cadastrado',
  update_inventory_item:  'Item de estoque alterado',
  inventory_entry:        'Entrada no estoque',
  inventory_exit:         'Saída do estoque',
  inventory_adjustment:   'Ajuste de estoque',
  inventory_loss:         'Perda registrada no estoque',
  create_driver:          'Entregador cadastrado',
  assign_driver:          'Entregador vinculado ao pedido',
  start_delivery:         'Saiu para entrega',
  complete_delivery:      'Entrega concluída',
  create_user_account:    'Novo acesso criado',
  create_access:          'Novo acesso criado',
  update_user_role:       'Cargo do usuário alterado',
  deactivate_user:        'Conta desativada',
  activate_user:          'Conta ativada',
  apply_discount:              'Desconto aplicado',
  refund_payment:              'Pagamento estornado',
  apply_courtesy:              'Cortesia aplicada',
  order_notification_sent:     'Notificação enviada ao cliente',
  order_notification_failed:   'Falha ao enviar notificação',
};

const _STATUS_LABELS_PT = { novo:'Novo', em_preparo:'Em preparo', saiu_para_entrega:'Saiu para entrega', finalizado:'Finalizado', cancelado:'Cancelado' };

function getFriendlyAction(action, entityLabel, metadata) {
  const base = _FRIENDLY_ACTIONS[action] || 'Ação registrada';
  const meta = metadata || {};
  const label = entityLabel || '';

  if ((action === 'change_status' || action === 'update_order_status') && meta.before?.status && meta.after?.status) {
    const from = _STATUS_LABELS_PT[meta.before.status] || meta.before.status;
    const to   = _STATUS_LABELS_PT[meta.after.status]  || meta.after.status;
    return label ? `Status do pedido ${label} alterado de "${from}" para "${to}"` : `Status do pedido alterado de "${from}" para "${to}"`;
  }

  if (action === 'assign_driver' && meta.driver) return `Entregador vinculado ao pedido${label ? ' ' + label : ''}: ${meta.driver}`;
  if (action === 'create_inventory_item' && label) return `Item de estoque cadastrado: ${label}`;
  if (action === 'inventory_entry' && label) return `Entrada no estoque: ${label}`;
  if (action === 'inventory_exit' && label) return `Saída do estoque: ${label}`;
  if (action === 'create_expense' && label) return `Despesa registrada: ${label}`;
  if (action === 'create_driver' && label) return `Entregador cadastrado: ${label}`;
  if (action === 'update_user_role' && label) return `Cargo alterado: ${label}`;

  if (action === 'apply_discount' && label) return `Desconto aplicado no pedido ${label}`;
  if (action === 'apply_courtesy' && label) return `Cortesia aplicada no pedido ${label}`;
  if (action === 'refund_payment' && label) return `Pagamento estornado no pedido ${label}`;
  if (action === 'mark_paid' || action === 'mark_order_paid') {
    const pay = meta.payment_method ? ` (${PAY_METHOD_LABELS[meta.payment_method] || meta.payment_method})` : '';
    return label ? `Pagamento confirmado: ${label}${pay}` : `Pagamento confirmado${pay}`;
  }

  if (label) return `${base}: ${label}`;
  return base;
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
  tab: 'visao',
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
    if (originFilter === 'online' && o.order_source === 'balcao') return false;
    if (originFilter === 'balcao' && o.order_source !== 'balcao') return false;
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
  document.querySelectorAll('.rpt-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.rpt-tab').forEach(b => {
    const txt = b.textContent.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const t = tab.normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (txt.startsWith(t.slice(0, 4)) || (tab === 'visao' && txt.includes('visao'))) b.classList.add('active');
  });
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

  const cancelledCount = orders.filter(o => o.status === 'cancelado').length;

  const clientMap = {};
  paid.forEach(o => { const n = o.customer_name || 'Sem nome'; clientMap[n] = (clientMap[n] || 0) + Number(o.total || 0); });
  const topClient = Object.entries(clientMap).sort((a, b) => b[1] - a[1])[0];

  const payMethodCount = {};
  paid.forEach(o => { const m = getPaymentLabel(o); payMethodCount[m] = (payMethodCount[m] || 0) + 1; });
  const topPayMethod = Object.entries(payMethodCount).sort((a, b) => b[1] - a[1])[0];

  const onlineCount = orders.filter(o => o.order_source !== 'balcao' && o.delivery_type !== 'balcao').length;
  const balcaoCount = orders.filter(o => o.delivery_type ? o.delivery_type === 'balcao' : o.order_source === 'balcao').length;
  const entregaCount = orders.filter(o => o.delivery_type === 'delivery').length;
  const retiradaCount = orders.filter(o => o.delivery_type === 'pickup').length;

  const cards = [
    { icon: 'fa-hand-holding-dollar', val: `R$ ${fmt(totalSold)}`, label: 'Faturamento total' },
    { icon: 'fa-receipt', val: totalOrders, label: 'Total de pedidos' },
    { icon: 'fa-circle-check', val: paidCount, label: 'Pedidos pagos' },
    { icon: 'fa-clock', val: pendCount, label: 'Pedidos pendentes' },
    { icon: 'fa-ban', val: cancelledCount, label: 'Pedidos cancelados' },
    { icon: 'fa-chart-line', val: `R$ ${fmt(ticketAvg)}`, label: 'Ticket médio' },
    { icon: 'fa-truck', val: `R$ ${fmt(totalFee)}`, label: 'Taxas de entrega' },
    { icon: 'fa-money-bill-wave', val: `R$ ${fmt(totalCash)}`, label: 'Total em dinheiro' },
    { icon: 'fa-qrcode', val: `R$ ${fmt(totalPix)}`, label: 'Total em Pix' },
    { icon: 'fa-credit-card', val: `R$ ${fmt(totalCard)}`, label: 'Total em cartão' },
    { icon: 'fa-globe', val: `R$ ${fmt(totalOnline)}`, label: 'Total online' },
    { icon: 'fa-star', val: topProduct ? topProduct[0] : '—', label: 'Mais vendido' },
    { icon: 'fa-user-tie', val: topEmployee ? topEmployee[0].split('@')[0] : '—', label: 'Mais atendimentos' },
    { icon: 'fa-user', val: topClient ? topClient[0] : '—', label: 'Cliente que mais comprou' },
    { icon: 'fa-wallet', val: topPayMethod ? `${topPayMethod[0]} (${topPayMethod[1]})` : '—', label: 'Pagamento mais usado' },
    { icon: 'fa-laptop', val: onlineCount, label: 'Pedidos online' },
    { icon: 'fa-cash-register', val: balcaoCount, label: 'Pedidos balcão' },
    { icon: 'fa-motorcycle', val: entregaCount, label: 'Pedidos entrega' },
    { icon: 'fa-store', val: retiradaCount, label: 'Pedidos retirada' },
    { icon: 'fa-percent', val: `R$ ${fmt(paid.reduce((s, o) => s + Number(o.discount_amount || 0), 0))}`, label: 'Descontos' },
    { icon: 'fa-rotate-left', val: `R$ ${fmt(orders.filter(o => o.refund_amount > 0).reduce((s, o) => s + Number(o.refund_amount || 0), 0))}`, label: 'Estornos' },
    { icon: 'fa-gift', val: `R$ ${fmt(paid.reduce((s, o) => s + Number(o.courtesy_amount || 0), 0))}`, label: 'Cortesias' },
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
    case 'visao':         renderRptVisaoGeral(); break;
    case 'financeiro':    renderRptFinanceiro(); break;
    case 'clientes':      renderRptClientes(); break;
    case 'entregas':      renderRptEntregas(); break;
    case 'produtos':      renderRptProdutos(); break;
    case 'funcionarios':  renderRptFuncionarios(); break;
    case 'cancelados':    renderRptCancelados(); break;
    case 'atividades':    renderRptAtividades(); break;
    case 'revisoes':      renderRptRevisoes(); break;
    case 'impressoes':    renderRptImpressoes(); break;
  }
}

/* ── Tab: Visão geral ── */
function renderRptVisaoGeral() {
  const el = elid('rpt-tab-visao');
  if (!el) return;
  el.innerHTML = '<p class="rpt-visao-hint"><i class="fas fa-info-circle"></i> Os cards acima resumem a visão geral do período. Use as abas para explorar cada área em detalhes.</p>';
}

/* ── Tab: Financeiro ── */
function renderRptFinanceiro() {
  const orders = getFilteredReportOrders().filter(o => o.status !== 'cancelado');
  const el = elid('rpt-tab-financeiro');
  if (!el) return;

  const paid = orders.filter(o => isPaidOrder(o));
  const pending = orders.filter(o => !isPaidOrder(o));
  const totalSold = paid.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalPending = pending.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalCancelled = getFilteredReportOrders().filter(o => o.status === 'cancelado').reduce((s, o) => s + Number(o.total || 0), 0);
  const totalFee = paid.reduce((s, o) => s + Number(o.delivery_fee || 0), 0);

  const payBreakdown = {};
  paid.forEach(o => { const m = getPaymentLabel(o); if (!payBreakdown[m]) payBreakdown[m] = { count: 0, total: 0 }; payBreakdown[m].count++; payBreakdown[m].total += Number(o.total || 0); });

  let summaryHtml = `<div class="rpt-summary-box" style="margin-bottom:16px">
    <div class="rpt-summary-item">Total vendido: <strong>R$ ${fmt(totalSold)}</strong></div>
    <div class="rpt-summary-item">Total pendente: <strong>R$ ${fmt(totalPending)}</strong></div>
    <div class="rpt-summary-item">Total cancelado: <strong>R$ ${fmt(totalCancelled)}</strong></div>
    <div class="rpt-summary-item">Taxas de entrega: <strong>R$ ${fmt(totalFee)}</strong></div>
    ${Object.entries(payBreakdown).map(([m, d]) => `<div class="rpt-summary-item">${esc(m)}: <strong>${d.count} vendas · R$ ${fmt(d.total)}</strong></div>`).join('')}
  </div>`;

  if (!orders.length) { el.innerHTML = summaryHtml + '<p class="empty-msg">Nenhum pedido no período.</p>'; return; }

  const rows = orders.map(o => {
    const date = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
    const num = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
    const paid2 = isPaidOrder(o);
    const paidDate = o.paid_at ? new Date(o.paid_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
    const origin = getSaleOriginLabel(o);
    return `<tr>
      <td>${date}</td>
      <td>#${esc(num)}</td>
      <td>${esc(o.customer_name || '—')}</td>
      <td>R$ ${fmt(o.total || 0)}</td>
      <td>R$ ${fmt(o.delivery_fee || 0)}</td>
      <td>${esc(getPaymentLabel(o))}</td>
      <td><span class="rpt-pill ${paid2 ? 'rpt-pill-paid' : 'rpt-pill-pending'}">${paid2 ? 'Pago' : 'Pendente'}</span></td>
      <td>${paidDate}</td>
      <td>${esc(o.paid_by_email?.split('@')[0] || (paid2 ? 'Sem registro' : '—'))}</td>
      <td>${esc(origin)}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="rpt-tab-export">
      <button class="btn-secondary" onclick="exportReportCSV('financeiro')"><i class="fas fa-file-csv"></i> CSV</button>
    </div>
    ${summaryHtml}
    <table class="rpt-table">
      <thead><tr><th>Data</th><th>Pedido</th><th>Cliente</th><th>Total</th><th>Entrega</th><th>Pagamento</th><th>Status</th><th>Pago em</th><th>Confirmado por</th><th>Origem</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ── Tab: Clientes ── */
function renderRptClientes() {
  const orders = getFilteredReportOrders().filter(o => o.status !== 'cancelado');
  const el = elid('rpt-tab-clientes');
  if (!el) return;

  const clientMap = {};
  orders.forEach(o => {
    const name = o.customer_name || 'Sem nome';
    const phone = o.customer_phone || '';
    const key = name + '|' + phone;
    if (!clientMap[key]) clientMap[key] = { name, phone, orders: 0, totalSpent: 0, totalPaid: 0, totalPending: 0, totalFee: 0, lastOrder: null, products: {}, origins: {}, cancelled: 0, orderList: [] };
    const c = clientMap[key];
    c.orders++;
    c.totalSpent += Number(o.total || 0);
    if (isPaidOrder(o)) c.totalPaid += Number(o.total || 0); else c.totalPending += Number(o.total || 0);
    c.totalFee += Number(o.delivery_fee || 0);
    const d = new Date(o.created_at);
    if (!c.lastOrder || d > c.lastOrder) c.lastOrder = d;
    const origin = getSaleOriginLabel(o);
    c.origins[origin] = (c.origins[origin] || 0) + 1;
    (Array.isArray(o.items) ? o.items : []).forEach(i => { const n = i.name || '?'; c.products[n] = (c.products[n] || 0) + (i.qty || 1); });
    c.orderList.push(o);
  });

  const sorted = Object.values(clientMap).sort((a, b) => b.totalSpent - a.totalSpent);
  if (!sorted.length) { el.innerHTML = '<p class="empty-msg">Nenhum cliente no período.</p>'; return; }

  const rows = sorted.map(c => {
    const topProd = Object.entries(c.products).sort((a, b) => b[1] - a[1])[0];
    const topOrigin = Object.entries(c.origins).sort((a, b) => b[1] - a[1])[0];
    const daysSince = c.lastOrder ? Math.floor((new Date() - c.lastOrder) / 86400000) : 999;
    let clientStatus = 'Ativo', clientCls = 'rpt-pill-paid';
    if (c.orders === 1) { clientStatus = 'Novo'; clientCls = 'rpt-pill-pending'; }
    else if (c.orders >= 5) { clientStatus = 'Frequente'; clientCls = 'rpt-pill-paid'; }
    if (c.totalPending > 0) { clientStatus = 'Com pendência'; clientCls = 'rpt-pill-cancelled'; }
    else if (daysSince > 30) { clientStatus = 'Inativo'; clientCls = 'rpt-pill-cancelled'; }
    return `<tr>
      <td><strong><a href="#" class="rpt-link" onclick="event.preventDefault();openClientDetailModal('${esc(c.name)}','${esc(c.phone)}')">${esc(c.name)}</a></strong></td>
      <td>${esc(c.phone || '—')}</td>
      <td>${c.orders}</td>
      <td>R$ ${fmt(c.totalSpent)}</td>
      <td>R$ ${fmt(c.totalPaid)}</td>
      <td>${c.totalPending > 0 ? `<span class="rpt-pill rpt-pill-pending">R$ ${fmt(c.totalPending)}</span>` : '—'}</td>
      <td>R$ ${fmt(c.totalFee)}</td>
      <td>${c.lastOrder ? c.lastOrder.toLocaleDateString('pt-BR') : '—'}</td>
      <td>${topProd ? esc(topProd[0]) : '—'}</td>
      <td><span class="rpt-pill ${clientCls}">${clientStatus}</span></td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="rpt-tab-export">
      <button class="btn-secondary" onclick="exportReportCSV('clientes')"><i class="fas fa-file-csv"></i> CSV</button>
    </div>
    <h3>Relatório de clientes</h3>
    <table class="rpt-table">
      <thead><tr><th>Cliente</th><th>Telefone</th><th>Pedidos</th><th>Total gasto</th><th>Total pago</th><th>Pendente</th><th>Taxas entrega</th><th>Último pedido</th><th>Produto favorito</th><th>Status</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function openClientDetailModal(name, phone) {
  const orders = gs.orders.filter(o => o.customer_name === name && (o.customer_phone || '') === phone);
  elid('client-detail-subtitle').textContent = name;
  let html = `<h3 style="margin:0 0 12px">Pedidos de ${esc(name)}</h3>`;
  if (!orders.length) { html += '<p class="empty-msg">Nenhum pedido encontrado.</p>'; }
  else {
    html += '<table class="rpt-table"><thead><tr><th>Data</th><th>Pedido</th><th>Itens</th><th>Total</th><th>Entrega</th><th>Pagamento</th><th>Status</th></tr></thead><tbody>';
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).forEach(o => {
      const d = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
      const num = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
      const items = (Array.isArray(o.items) ? o.items : []).map(i => `${i.qty||1}x ${i.name||'?'}`).join(', ');
      html += `<tr><td>${d}</td><td>#${esc(num)}</td><td class="sd-opts-cell">${esc(items || '—')}</td><td>R$ ${fmt(o.total||0)}</td><td>R$ ${fmt(o.delivery_fee||0)}</td><td>${esc(getPaymentLabel(o))}</td><td><span class="rpt-pill ${isPaidOrder(o)?'rpt-pill-paid':'rpt-pill-pending'}">${isPaidOrder(o)?'Pago':'Pendente'}</span></td></tr>`;
    });
    html += '</tbody></table>';
  }
  elid('client-detail-body').innerHTML = html;
  elid('client-detail-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function closeClientDetail() { elid('client-detail-overlay').style.display = 'none'; document.body.style.overflow = ''; }
function closeClientDetailOutside(e) { if (e.target === elid('client-detail-overlay')) closeClientDetail(); }

/* ── Tab: Entregas ── */
function renderRptEntregas() {
  const orders = getFilteredReportOrders().filter(o => o.status !== 'cancelado');
  const el = elid('rpt-tab-entregas');
  if (!el) return;

  const rows = orders.map(o => {
    const date = o.created_at ? new Date(o.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
    const num = o.order_number || o.id?.slice(-8).toUpperCase() || '—';
    const isBalcao = o.delivery_type ? o.delivery_type === 'balcao' : o.order_source === 'balcao';
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
  const deliveryOrders = orders.filter(o => Number(o.delivery_fee || 0) > 0);
  const avgFee = deliveryOrders.length ? totalFee / deliveryOrders.length : 0;
  const deliveries = orders.filter(o => o.delivery_type !== 'pickup' && o.order_source !== 'balcao' && o.delivery_type !== 'balcao').length;
  const maxFee = deliveryOrders.length ? Math.max(...deliveryOrders.map(o => Number(o.delivery_fee || 0))) : 0;
  const minFee = deliveryOrders.length ? Math.min(...deliveryOrders.map(o => Number(o.delivery_fee || 0))) : 0;
  const feeByClient = {};
  deliveryOrders.forEach(o => { const n = o.customer_name || 'Sem nome'; feeByClient[n] = (feeByClient[n] || 0) + Number(o.delivery_fee || 0); });
  const topFeeClient = Object.entries(feeByClient).sort((a, b) => b[1] - a[1])[0];

  el.innerHTML = `
    <div class="rpt-tab-export">
      <button class="btn-secondary" onclick="exportReportCSV('entregas')"><i class="fas fa-file-csv"></i> CSV</button>
    </div>
    <div class="rpt-summary-box" style="margin-bottom:16px">
      <div class="rpt-summary-item">Total de entregas: <strong>${deliveries}</strong></div>
      <div class="rpt-summary-item">Total em taxas: <strong>R$ ${fmt(totalFee)}</strong></div>
      <div class="rpt-summary-item">Média por entrega: <strong>R$ ${fmt(avgFee)}</strong></div>
      <div class="rpt-summary-item">Maior taxa: <strong>R$ ${fmt(maxFee)}</strong></div>
      <div class="rpt-summary-item">Menor taxa: <strong>R$ ${fmt(minFee)}</strong></div>
      ${topFeeClient ? `<div class="rpt-summary-item">Mais pagou taxa: <strong>${esc(topFeeClient[0])} (R$ ${fmt(topFeeClient[1])})</strong></div>` : ''}
    </div>
    <h3>Taxas de entrega por cliente</h3>
    <table class="rpt-table">
      <thead><tr><th>Data</th><th>Pedido</th><th>Cliente</th><th>Telefone</th><th>Tipo</th><th>Taxa entrega</th><th>Total</th><th>Pagamento</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
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
        <td><strong><a href="#" class="rpt-link" onclick="event.preventDefault();openEmpDetailModal('${esc(name)}')">${esc(name.includes('@') ? name.split('@')[0] : name)}</a></strong></td>
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
    const items = (Array.isArray(o.items) ? o.items : []).map(i => `${i.qty||1}x ${i.name||'?'}`).join(', ');
    return `<tr>
      <td>${date}</td>
      <td>#${esc(num)}</td>
      <td>${esc(o.customer_name || '—')}</td>
      <td>R$ ${fmt(o.total || 0)}</td>
      <td>${esc(o.cancelled_by_email?.split('@')[0] || 'Sem registro')}</td>
      <td>${esc(o.cancel_reason || 'Não informado')}</td>
      <td>${cancelDate}</td>
      <td>${esc(getSaleOriginLabel(o))}</td>
      <td class="sd-opts-cell">${esc(items || '—')}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="rpt-tab-export">
      <button class="btn-secondary" onclick="exportReportCSV('cancelados')"><i class="fas fa-file-csv"></i> CSV</button>
    </div>
    <h3>Pedidos cancelados / excluídos</h3>
    <table class="rpt-table">
      <thead><tr><th>Data</th><th>Pedido</th><th>Cliente</th><th>Total</th><th>Quem cancelou</th><th>Motivo</th><th>Horário</th><th>Origem</th><th>Itens</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ── Tab: Atividades ── */
function renderRptAtividades() {
  const el = elid('rpt-tab-atividades');
  if (!el) return;

  if (!rpt.auditLogs.length) { el.innerHTML = '<p class="empty-msg">Nenhuma atividade registrada no período.</p>'; return; }

  const rows = rpt.auditLogs.map(log => {
    const date = new Date(log.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const actor = log.actor_name || log.actor_email?.split('@')[0] || 'Sistema';
    const actionText = getFriendlyAction(log.action, log.entity_label, log.metadata);
    return `<tr>
      <td>${date}</td>
      <td><span class="rpt-activity-actor">${esc(actor)}</span></td>
      <td><span class="rpt-activity-action">${esc(actionText)}</span></td>
      <td>${log.reason ? `<span class="rpt-activity-reason">${esc(log.reason)}</span>` : 'Sem observação'}</td>
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
   Tab: Revisões
══════════════════════════════════════ */
function renderRptRevisoes() {
  const el = elid('rpt-tab-revisoes');
  if (!el) return;

  const logs = rpt.auditLogs.filter(l => {
    const m = l.metadata || {};
    return (m.before && Object.keys(m.before).length > 0) || (m.after && Object.keys(m.after).length > 0);
  });

  if (!logs.length) { el.innerHTML = '<p class="empty-msg">Nenhuma revisão/alteração com detalhes no período.</p>'; return; }

  const rows = logs.map(l => {
    const d = new Date(l.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const actor = l.actor_name || l.actor_email?.split('@')[0] || 'Sistema';
    const act = getFriendlyAction(l.action, l.entity_label, l.metadata);
    const m = l.metadata || {};
    const before = m.before || {};
    const after = m.after || {};
    const changes = Object.keys({ ...before, ...after }).filter(k => k !== '').map(k => {
      const bv = before[k] != null ? before[k] : '—';
      const av = after[k] != null ? after[k] : '—';
      const bStr = typeof bv === 'boolean' ? (bv ? 'Sim' : 'Não') : (typeof bv === 'number' ? `R$ ${fmt(bv)}` : String(bv));
      const aStr = typeof av === 'boolean' ? (av ? 'Sim' : 'Não') : (typeof av === 'number' ? `R$ ${fmt(av)}` : String(av));
      return `<div class="rpt-revision-change"><span class="rpt-rev-field">${esc(k)}:</span> <span class="rpt-rev-before">${esc(bStr)}</span> → <span class="rpt-rev-after">${esc(aStr)}</span></div>`;
    }).join('');
    return `<tr>
      <td>${d}</td>
      <td><strong>${esc(actor)}</strong></td>
      <td>${esc(act)}</td>
      <td>${l.entity_label ? esc(l.entity_label) : '—'}</td>
      <td>${changes || '—'}</td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="rpt-tab-export">
      <button class="btn-secondary" onclick="exportReportCSV('revisoes')"><i class="fas fa-file-csv"></i> CSV</button>
    </div>
    <h3>Revisões e alterações (antes/depois)</h3>
    <table class="rpt-table">
      <thead><tr><th>Data</th><th>Conta</th><th>Ação</th><th>Item</th><th>Alterações</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ══════════════════════════════════════
   Tab: Impressões
══════════════════════════════════════ */
function renderRptImpressoes() {
  const el = elid('rpt-tab-impressoes');
  if (!el) return;

  const logs = rpt.auditLogs.filter(l => ['print_receipt', 'reprint_receipt', 'auto_print_order'].includes(l.action));
  if (!logs.length) { el.innerHTML = '<p class="empty-msg">Nenhuma impressão registrada no período.</p>'; return; }

  const rows = logs.map(l => {
    const d = new Date(l.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
    const actor = l.actor_name || l.actor_email?.split('@')[0] || 'Sistema';
    return `<tr>
      <td>${d}</td>
      <td>${l.entity_label ? esc(l.entity_label) : '—'}</td>
      <td>${esc(getFriendlyAction(l.action, null, l.metadata))}</td>
      <td><strong>${esc(actor)}</strong></td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="rpt-tab-export">
      <button class="btn-secondary" onclick="exportReportCSV('impressoes')"><i class="fas fa-file-csv"></i> CSV</button>
    </div>
    <h3>Impressões de comandas</h3>
    <table class="rpt-table">
      <thead><tr><th>Data</th><th>Pedido</th><th>Tipo</th><th>Impresso por</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ── Employee Detail Modal ── */
async function openEmpDetailModal(email) {
  elid('emp-detail-subtitle').textContent = email.includes('@') ? email.split('@')[0] : email;

  let logs = [];
  try {
    const [start, end] = getReportDateRange();
    const q = getSb().from('audit_logs').select('*').gte('created_at', start.toISOString()).lte('created_at', end.toISOString()).order('created_at', { ascending: false }).limit(200);
    if (email.includes('@')) q.eq('actor_email', email); else q.eq('actor_name', email);
    const { data } = await q;
    logs = data || [];
  } catch(_) {}

  let html = '';
  if (!logs.length) { html = '<p class="empty-msg">Nenhuma atividade registrada no período.</p>'; }
  else {
    html = '<table class="rpt-table"><thead><tr><th>Data</th><th>Ação</th><th>Motivo</th></tr></thead><tbody>';
    logs.forEach(l => {
      const d = new Date(l.created_at).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
      html += `<tr><td>${d}</td><td>${esc(getFriendlyAction(l.action, l.entity_label, l.metadata))}</td><td>${l.reason ? esc(l.reason) : 'Sem observação'}</td></tr>`;
    });
    html += '</tbody></table>';
  }

  elid('emp-detail-body').innerHTML = html;
  elid('emp-detail-overlay').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}
function closeEmpDetail() { elid('emp-detail-overlay').style.display = 'none'; document.body.style.overflow = ''; }
function closeEmpDetailOutside(e) { if (e.target === elid('emp-detail-overlay')) closeEmpDetail(); }

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
      const isBalcao = o.delivery_type ? o.delivery_type === 'balcao' : o.order_source === 'balcao';
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
      getFriendlyAction(l.action, l.entity_label, l.metadata), '', l.reason || 'Sem observação',
    ]);
  } else if (type === 'clientes') {
    const orders = getFilteredReportOrders().filter(o => o.status !== 'cancelado');
    const clientMap = {};
    orders.forEach(o => {
      const key = (o.customer_name || 'Sem nome') + '|' + (o.customer_phone || '');
      if (!clientMap[key]) clientMap[key] = { name: o.customer_name || 'Sem nome', phone: o.customer_phone || '', orders: 0, total: 0, paid: 0, pending: 0, fee: 0 };
      const c = clientMap[key]; c.orders++; c.total += Number(o.total || 0); c.fee += Number(o.delivery_fee || 0);
      if (isPaidOrder(o)) c.paid += Number(o.total || 0); else c.pending += Number(o.total || 0);
    });
    const sorted = Object.values(clientMap).sort((a, b) => b.total - a.total);
    if (!sorted.length) { toast('Nenhum dado para exportar.', true); return; }
    header = ['Cliente','Telefone','Pedidos','Total gasto','Pago','Pendente','Taxas entrega'];
    rows = sorted.map(c => [c.name, c.phone, c.orders, fmt(c.total), fmt(c.paid), fmt(c.pending), fmt(c.fee)]);
  } else if (type === 'revisoes') {
    const logs = rpt.auditLogs.filter(l => { const m = l.metadata || {}; return (m.before && Object.keys(m.before).length) || (m.after && Object.keys(m.after).length); });
    if (!logs.length) { toast('Nenhum dado para exportar.', true); return; }
    header = ['Data','Conta','Acao','Item','Alteracoes'];
    rows = logs.map(l => {
      const m = l.metadata || {};
      const changes = Object.keys({ ...(m.before||{}), ...(m.after||{}) }).map(k => `${k}: ${m.before?.[k] ?? '—'} → ${m.after?.[k] ?? '—'}`).join('; ');
      return [new Date(l.created_at).toLocaleString('pt-BR'), l.actor_name || l.actor_email || 'Sistema', getFriendlyAction(l.action, l.entity_label, l.metadata), '', changes];
    });
  } else if (type === 'impressoes') {
    const logs = rpt.auditLogs.filter(l => ['print_receipt','reprint_receipt','auto_print_order'].includes(l.action));
    if (!logs.length) { toast('Nenhum dado para exportar.', true); return; }
    header = ['Data','Pedido','Tipo','Impresso por'];
    rows = logs.map(l => [new Date(l.created_at).toLocaleString('pt-BR'), l.entity_label || '', getFriendlyAction(l.action, l.entity_label, l.metadata), l.actor_name || l.actor_email || 'Sistema']);
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

  const period = getReportPeriodLabel();
  const now = new Date().toLocaleString('pt-BR');
  const empFilter = elid('rpt-employee')?.selectedOptions?.[0]?.text || 'Todos';
  const payFilter = elid('rpt-payment')?.selectedOptions?.[0]?.text || 'Todos';
  const statusFilter = elid('rpt-status')?.selectedOptions?.[0]?.text || 'Todos';
  const originFilter = elid('rpt-origin')?.selectedOptions?.[0]?.text || 'Todas';

  const tabNames = { visao:'Visão geral', financeiro:'Financeiro', clientes:'Clientes', entregas:'Entregas e taxas', produtos:'Produtos', funcionarios:'Funcionários', cancelados:'Cancelados', atividades:'Atividades', revisoes:'Revisões', impressoes:'Impressões' };
  const activeTab = tabNames[rpt.tab] || rpt.tab;

  const cardsEl = elid('rpt-cards');
  const cardItems = cardsEl ? cardsEl.querySelectorAll('.rpt-card') : [];
  let summaryRows = '';
  cardItems.forEach(card => {
    const val = card.querySelector('.rpt-card-val')?.textContent || '';
    const label = card.querySelector('.rpt-card-label')?.textContent || '';
    if (label) summaryRows += `<tr><td class="ps-label">${esc(label)}</td><td class="ps-val">${esc(val)}</td></tr>`;
  });

  const tabEl = elid(`rpt-tab-${rpt.tab}`);
  const tabHtml = tabEl ? tabEl.innerHTML : '';
  const cleanTabHtml = tabHtml
    .replace(/<div class="rpt-tab-export">[\s\S]*?<\/div>/g, '')
    .replace(/<button[^>]*>[\s\S]*?<\/button>/g, '')
    .replace(/<a[^>]*class="rpt-link"[^>]*>/g, '<span style="font-weight:600">')
    .replace(/<\/a>/g, '</span>');

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>Day Lanches — Relatório Gerencial</title>
<style>
  @page { size: A4 portrait; margin: 16mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 11px; line-height: 1.45; background: #fff; }

  .pr-header { border-bottom: 2px solid #FF6B00; padding-bottom: 10px; margin-bottom: 12px; display: flex; justify-content: space-between; align-items: flex-end; }
  .pr-brand { font-size: 18px; font-weight: 900; }
  .pr-brand-day { color: #1a1a1a; font-style: italic; }
  .pr-brand-lanches { color: #FF6B00; }
  .pr-header-right { text-align: right; font-size: 9px; color: #666; line-height: 1.6; }
  .pr-header-right strong { color: #333; }

  .pr-title { font-size: 13px; font-weight: 700; color: #333; margin-bottom: 2px; }
  .pr-subtitle { font-size: 10px; color: #666; margin-bottom: 12px; }

  .pr-section { font-size: 11px; font-weight: 700; color: #1a1a1a; margin: 14px 0 6px; padding: 3px 6px; background: #f0f0f0; border-left: 3px solid #FF6B00; }

  .ps-table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  .ps-table th { background: #f5f5f5; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: .04em; color: #555; padding: 5px 8px; text-align: left; border: 1px solid #ddd; }
  .ps-table td { padding: 4px 8px; border: 1px solid #e5e5e5; font-size: 10.5px; vertical-align: top; }
  .ps-table tr:nth-child(even) td { background: #fafafa; }
  .ps-table tr { page-break-inside: avoid; }
  .ps-table thead { display: table-header-group; }
  .ps-label { font-weight: 600; color: #333; width: 55%; }
  .ps-val { text-align: right; font-weight: 700; color: #1a1a1a; }

  .rpt-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
  .rpt-table th { background: #f5f5f5; font-weight: 700; font-size: 8.5px; text-transform: uppercase; letter-spacing: .03em; color: #555; padding: 5px 6px; text-align: left; border: 1px solid #ddd; }
  .rpt-table td { padding: 4px 6px; border: 1px solid #e5e5e5; font-size: 10px; vertical-align: top; }
  .rpt-table tr:nth-child(even) td { background: #fafafa; }
  .rpt-table tr { page-break-inside: avoid; }
  .rpt-table thead { display: table-header-group; }

  .rpt-pill { display: inline-block; padding: 1px 5px; border-radius: 3px; font-size: 8.5px; font-weight: 600; border: 1px solid; }
  .rpt-pill-paid { background: #f0fdf4; color: #16a34a; border-color: #bbf7d0; }
  .rpt-pill-pending { background: #fff7ed; color: #ea580c; border-color: #fed7aa; }
  .rpt-pill-cancelled { background: #fef2f2; color: #dc2626; border-color: #fecaca; }

  .rpt-summary-box { padding: 6px 8px; background: #f9fafb; border: 1px solid #e5e5e5; margin-bottom: 10px; font-size: 10px; display: flex; flex-wrap: wrap; gap: 8px; }
  .rpt-summary-item strong { color: #1a1a1a; }
  .rpt-product-section { margin-bottom: 12px; }
  .rpt-product-section h4 { font-size: 10.5px; font-weight: 700; margin-bottom: 4px; }
  .rpt-product-section h4 i { display: none; }
  h3 { font-size: 11px; font-weight: 700; margin-bottom: 6px; }

  .rpt-activity-actor { font-weight: 600; }
  .rpt-activity-action { color: #333; }
  .rpt-activity-reason { font-size: 9px; color: #888; font-style: italic; }
  .rpt-revision-change { font-size: 9px; line-height: 1.5; }
  .rpt-rev-field { font-weight: 600; }
  .rpt-rev-before { color: #dc2626; text-decoration: line-through; }
  .rpt-rev-after { color: #16a34a; font-weight: 600; }
  .rpt-visao-hint { display: none; }
  .sd-opts-cell { font-size: 9px; color: #888; }
  .empty-msg { font-size: 10px; color: #999; padding: 8px 0; }
  .btn-sale-detail, .btn-secondary, .btn-primary, .rpt-link { font-weight: 600; color: #1a1a1a; text-decoration: none; cursor: default; }

  .pr-footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ccc; display: flex; justify-content: space-between; font-size: 8.5px; color: #999; }
  .pr-print-btn { display: block; margin: 16px auto; padding: 10px 32px; font-size: 13px; border-radius: 6px; border: none; background: #FF6B00; color: #fff; cursor: pointer; font-weight: 700; }
  @media print {
    .no-print { display: none !important; }
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>

  <div class="pr-header">
    <div>
      <div class="pr-brand"><span class="pr-brand-day">Day</span><span class="pr-brand-lanches">Lanches</span></div>
      <div class="pr-title">Relatório Gerencial</div>
    </div>
    <div class="pr-header-right">
      <strong>Aba:</strong> ${esc(activeTab)}<br>
      <strong>Período:</strong> ${esc(period)}<br>
      <strong>Emitido em:</strong> ${esc(now)}<br>
      ${empFilter !== 'Todos' ? `<strong>Funcionário:</strong> ${esc(empFilter)}<br>` : ''}
      ${payFilter !== 'Todos' ? `<strong>Pagamento:</strong> ${esc(payFilter)}<br>` : ''}
      ${statusFilter !== 'Todos' ? `<strong>Status:</strong> ${esc(statusFilter)}<br>` : ''}
      ${originFilter !== 'Todas' ? `<strong>Origem:</strong> ${esc(originFilter)}<br>` : ''}
    </div>
  </div>

  <div class="pr-section">Resumo do período</div>
  <table class="ps-table">
    <thead><tr><th>Indicador</th><th style="text-align:right">Valor</th></tr></thead>
    <tbody>${summaryRows}</tbody>
  </table>

  ${rpt.tab !== 'visao' ? `<div class="pr-section">${esc(activeTab)}</div>${cleanTabHtml}` : ''}

  <div class="pr-footer">
    <span>Relatório emitido pelo sistema Day Lanches</span>
    <span>${esc(now)}</span>
  </div>
  <button class="pr-print-btn no-print" onclick="window.print()">Imprimir / Salvar PDF</button>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) { toast('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.', true); return; }
  win.document.write(html);
  win.document.close();
}

/* ══════════════════════════════════════
   FECHAMENTO DE CAIXA
══════════════════════════════════════ */
async function initCaixa() {
  const el = elid('caixa-content');
  if (!el) return;
  el.innerHTML = '<p class="loading-msg"><i class="fas fa-spinner fa-spin"></i> Carregando...</p>';
  try {
    const { data: openCaixa } = await getSb().from('cash_closings').select('*').eq('status', 'aberto').order('opened_at', { ascending: false }).limit(1).maybeSingle();
    if (openCaixa) {
      await renderCaixaAberto(openCaixa);
    } else {
      renderCaixaFechado();
    }
  } catch (e) {
    console.warn('[Caixa] Erro:', e);
    el.innerHTML = '<p class="empty-msg">Erro ao carregar caixa. Verifique se a migration SQL foi executada.</p>';
  }
}

function renderCaixaFechado() {
  const el = elid('caixa-content');
  el.innerHTML = `<div class="g-card">
    <div class="g-card-head"><h2 class="g-card-title"><i class="fas fa-lock"></i> Caixa fechado</h2><p class="g-card-desc">Abra o caixa para registrar as vendas do dia.</p></div>
    <div class="form-group"><label class="form-label">Valor inicial em dinheiro (troco)</label><input type="text" id="caixa-opening" class="form-input" placeholder="0,00" inputmode="decimal"></div>
    <div class="form-group"><label class="form-label">Observação (opcional)</label><input type="text" id="caixa-open-notes" class="form-input" placeholder="Ex: Início do turno da noite"></div>
    <div class="g-card-actions"><button class="btn-primary" onclick="abrirCaixa()"><i class="fas fa-lock-open"></i> Abrir caixa</button></div>
  </div>`;
}

async function renderCaixaAberto(c) {
  const el = elid('caixa-content');
  const [start, end] = [new Date(c.opened_at), new Date()];
  const orders = gs.orders.filter(o => {
    if (o.status === 'cancelado' || !isPaidOrder(o) || !o.paid_at) return false;
    const d = new Date(o.paid_at);
    return d >= start && d <= end;
  });
  const cash = orders.filter(o => o.payment_method === 'dinheiro').reduce((s, o) => s + Number(o.total || 0), 0);
  const pix = orders.filter(o => o.payment_method === 'pix_loja').reduce((s, o) => s + Number(o.total || 0), 0);
  const card = orders.filter(o => o.payment_method === 'cartao_maquininha').reduce((s, o) => s + Number(o.total || 0), 0);
  const online = orders.filter(o => isOnlinePayment(o) && o.payment_method !== 'pix_loja' && o.payment_method !== 'cartao_maquininha').reduce((s, o) => s + Number(o.total || 0), 0);
  const fee = orders.reduce((s, o) => s + Number(o.delivery_fee || 0), 0);
  const expectedCash = Number(c.opening_amount || 0) + cash;
  const openedDate = new Date(c.opened_at).toLocaleString('pt-BR');
  const opener = c.opened_by_email?.split('@')[0] || 'Sistema';

  el.innerHTML = `<div class="g-card">
    <div class="g-card-head"><h2 class="g-card-title"><i class="fas fa-lock-open" style="color:var(--success)"></i> Caixa aberto</h2><p class="g-card-desc">Aberto por <strong>${esc(opener)}</strong> em ${openedDate}</p></div>
    <div class="rpt-cards" style="margin-bottom:16px">
      <div class="rpt-card"><div class="rpt-card-icon"><i class="fas fa-coins"></i></div><div class="rpt-card-val">R$ ${fmt(c.opening_amount || 0)}</div><div class="rpt-card-label">Valor inicial</div></div>
      <div class="rpt-card"><div class="rpt-card-icon"><i class="fas fa-money-bill-wave"></i></div><div class="rpt-card-val">R$ ${fmt(cash)}</div><div class="rpt-card-label">Dinheiro</div></div>
      <div class="rpt-card"><div class="rpt-card-icon"><i class="fas fa-qrcode"></i></div><div class="rpt-card-val">R$ ${fmt(pix)}</div><div class="rpt-card-label">Pix</div></div>
      <div class="rpt-card"><div class="rpt-card-icon"><i class="fas fa-credit-card"></i></div><div class="rpt-card-val">R$ ${fmt(card)}</div><div class="rpt-card-label">Cartão</div></div>
      <div class="rpt-card"><div class="rpt-card-icon"><i class="fas fa-globe"></i></div><div class="rpt-card-val">R$ ${fmt(online)}</div><div class="rpt-card-label">Online</div></div>
      <div class="rpt-card"><div class="rpt-card-icon"><i class="fas fa-truck"></i></div><div class="rpt-card-val">R$ ${fmt(fee)}</div><div class="rpt-card-label">Entregas</div></div>
      <div class="rpt-card"><div class="rpt-card-icon"><i class="fas fa-calculator"></i></div><div class="rpt-card-val">R$ ${fmt(expectedCash)}</div><div class="rpt-card-label">Esperado no caixa</div></div>
      <div class="rpt-card"><div class="rpt-card-icon"><i class="fas fa-receipt"></i></div><div class="rpt-card-val">${orders.length}</div><div class="rpt-card-label">Vendas</div></div>
    </div>
    <div class="form-group"><label class="form-label">Valor contado no caixa (dinheiro)</label><input type="text" id="caixa-counted" class="form-input" placeholder="0,00" inputmode="decimal"></div>
    <div class="form-group"><label class="form-label">Observação do fechamento (opcional)</label><textarea id="caixa-close-notes" class="form-textarea" rows="2" placeholder="Ex: Tudo certo, sem diferença"></textarea></div>
    <div class="g-card-actions"><button class="btn-primary" onclick="fecharCaixa('${c.id}', ${expectedCash})"><i class="fas fa-lock"></i> Fechar caixa</button><button class="btn-secondary" onclick="initCaixa()"><i class="fas fa-sync"></i> Atualizar</button></div>
  </div>`;
}

async function abrirCaixa() {
  const amount = parsePriceInput(elid('caixa-opening')?.value || '0');
  const notes = elid('caixa-open-notes')?.value?.trim() || null;
  const actor = getCurrentActor();
  const { error } = await getSb().from('cash_closings').insert({
    opening_amount: amount, status: 'aberto', notes,
    opened_by_user_id: actor.id, opened_by_email: actor.email,
  });
  if (error) { toast('Erro ao abrir caixa: ' + error.message, true); return; }
  toast('Caixa aberto!');
  logAuditAction('open_cash_register', 'cash', null, 'Caixa aberto', null, { opening_amount: amount, source: 'gestao' });
  initCaixa();
}

async function fecharCaixa(id, expectedCash) {
  const counted = parsePriceInput(elid('caixa-counted')?.value || '0');
  const notes = elid('caixa-close-notes')?.value?.trim() || null;
  const diff = counted - expectedCash;
  const actor = getCurrentActor();
  const { error } = await getSb().from('cash_closings').update({
    closed_at: new Date().toISOString(), status: 'fechado',
    closed_by_user_id: actor.id, closed_by_email: actor.email,
    expected_cash_amount: expectedCash, counted_cash_amount: counted,
    difference_amount: diff, notes, updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) { toast('Erro ao fechar caixa: ' + error.message, true); return; }
  const diffLabel = diff === 0 ? 'Sem diferença' : (diff > 0 ? `Sobra: R$ ${fmt(diff)}` : `Falta: R$ ${fmt(Math.abs(diff))}`);
  toast(`Caixa fechado. ${diffLabel}`);
  logAuditAction('close_cash_register', 'cash', id, 'Caixa fechado', null, { expected: expectedCash, counted, difference: diff, source: 'gestao' });
  initCaixa();
}

/* ══════════════════════════════════════
   DESPESAS
══════════════════════════════════════ */
const EXPENSE_CATEGORIES = ['Ingredientes','Embalagens','Gás','Bebidas','Motoboy','Taxas de cartão','Taxas InfinitePay','Manutenção','Outros'];

async function initDespesas() {
  const el = elid('despesas-content');
  if (!el) return;
  el.innerHTML = '<p class="loading-msg"><i class="fas fa-spinner fa-spin"></i> Carregando...</p>';
  try {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    const { data, error } = await getSb().from('expenses').select('*').gte('expense_date', monthStart.slice(0, 10)).neq('status', 'cancelado').order('expense_date', { ascending: false });
    if (error) throw error;
    renderDespesas(data || []);
  } catch (e) {
    console.warn('[Despesas] Erro:', e);
    el.innerHTML = '<p class="empty-msg">Erro ao carregar despesas. Verifique se a migration SQL foi executada.</p>';
  }
}

function renderDespesas(expenses) {
  const el = elid('despesas-content');
  const total = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
  const byCategory = {};
  expenses.forEach(e => { const c = e.category || 'Outros'; byCategory[c] = (byCategory[c] || 0) + Number(e.amount || 0); });

  const catOptions = EXPENSE_CATEGORIES.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

  const rows = expenses.map(e => {
    const d = new Date(e.expense_date + 'T12:00:00').toLocaleDateString('pt-BR');
    return `<tr><td>${d}</td><td>${esc(e.category)}</td><td>${esc(e.description)}</td><td>R$ ${fmt(e.amount)}</td><td>${esc(e.payment_method || '—')}</td><td>${esc(e.created_by_email?.split('@')[0] || 'Sistema')}</td></tr>`;
  }).join('');

  el.innerHTML = `
    <div class="g-card">
      <div class="g-card-head"><h2 class="g-card-title"><i class="fas fa-plus-circle"></i> Registrar despesa</h2></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Categoria *</label><select id="desp-cat" class="form-input">${catOptions}</select></div>
        <div class="form-group"><label class="form-label">Valor *</label><input type="text" id="desp-amount" class="form-input" placeholder="0,00" inputmode="decimal"></div>
      </div>
      <div class="form-group"><label class="form-label">Descrição *</label><input type="text" id="desp-desc" class="form-input" placeholder="Ex: Compra de pães"></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Pagamento</label><select id="desp-pay" class="form-input"><option value="">—</option><option value="dinheiro">Dinheiro</option><option value="pix">Pix</option><option value="cartao">Cartão</option></select></div>
        <div class="form-group"><label class="form-label">Observação</label><input type="text" id="desp-notes" class="form-input" placeholder="Opcional"></div>
      </div>
      <div class="g-card-actions"><button class="btn-primary" onclick="salvarDespesa()"><i class="fas fa-save"></i> Registrar despesa</button></div>
    </div>
    <div class="g-card">
      <div class="g-card-head"><h2 class="g-card-title">Despesas do mês</h2><p class="g-card-desc">Total: <strong>R$ ${fmt(total)}</strong></p></div>
      <div class="rpt-summary-box" style="margin-bottom:14px">${Object.entries(byCategory).map(([c, v]) => `<div class="rpt-summary-item">${esc(c)}: <strong>R$ ${fmt(v)}</strong></div>`).join('')}</div>
      ${rows ? `<table class="rpt-table"><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Valor</th><th>Pagamento</th><th>Registrado por</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="empty-msg">Nenhuma despesa registrada.</p>'}
    </div>`;
}

async function salvarDespesa() {
  const cat = elid('desp-cat')?.value;
  const amount = parsePriceInput(elid('desp-amount')?.value || '0');
  const desc = elid('desp-desc')?.value?.trim();
  if (!desc) { toast('Informe a descrição da despesa.', true); return; }
  if (!amount || amount <= 0) { toast('Informe o valor da despesa.', true); return; }
  const actor = getCurrentActor();
  const { error } = await getSb().from('expenses').insert({
    category: cat, description: desc, amount,
    payment_method: elid('desp-pay')?.value || null,
    notes: elid('desp-notes')?.value?.trim() || null,
    created_by_user_id: actor.id, created_by_email: actor.email,
  });
  if (error) { toast('Erro ao salvar despesa: ' + error.message, true); return; }
  toast('Despesa registrada!');
  logAuditAction('create_expense', 'expense', null, `${cat}: ${desc}`, null, { amount, source: 'gestao' });
  initDespesas();
}

/* ══════════════════════════════════════
   ESTOQUE
══════════════════════════════════════ */
async function initEstoque() {
  const el = elid('estoque-content');
  if (!el) return;
  el.innerHTML = '<p class="loading-msg"><i class="fas fa-spinner fa-spin"></i> Carregando...</p>';
  try {
    const { data, error } = await getSb().from('inventory_items').select('*').eq('is_active', true).order('name');
    if (error) throw error;
    renderEstoque(data || []);
  } catch (e) {
    console.warn('[Estoque] Erro:', e);
    el.innerHTML = '<p class="empty-msg">Erro ao carregar estoque. Verifique se a migration SQL foi executada.</p>';
  }
}

function renderEstoque(items) {
  const el = elid('estoque-content');
  const total = items.length;
  const low = items.filter(i => i.current_quantity > 0 && i.current_quantity <= i.minimum_quantity).length;
  const zero = items.filter(i => i.current_quantity <= 0).length;
  const estValue = items.reduce((s, i) => s + (Number(i.current_quantity || 0) * Number(i.cost_price || 0)), 0);

  const rows = items.map(i => {
    const qty = Number(i.current_quantity || 0);
    const min = Number(i.minimum_quantity || 0);
    let statusCls = 'rpt-pill-paid', statusTxt = 'OK';
    if (qty <= 0) { statusCls = 'rpt-pill-cancelled'; statusTxt = 'Zerado'; }
    else if (qty <= min) { statusCls = 'rpt-pill-pending'; statusTxt = 'Baixo'; }
    return `<tr>
      <td><strong>${esc(i.name)}</strong></td><td>${esc(i.category || '—')}</td>
      <td>${qty} ${esc(i.unit || 'un')}</td><td>${min}</td>
      <td>R$ ${fmt(i.cost_price || 0)}</td>
      <td><span class="rpt-pill ${statusCls}">${statusTxt}</span></td>
      <td>
        <button class="btn-sale-detail" onclick="estoqueMovimento('${i.id}','entrada')"><i class="fas fa-plus"></i></button>
        <button class="btn-sale-detail" onclick="estoqueMovimento('${i.id}','saida')"><i class="fas fa-minus"></i></button>
      </td>
    </tr>`;
  }).join('');

  el.innerHTML = `
    <div class="rpt-cards" style="margin-bottom:16px">
      <div class="rpt-card"><div class="rpt-card-icon"><i class="fas fa-boxes-stacked"></i></div><div class="rpt-card-val">${total}</div><div class="rpt-card-label">Itens em estoque</div></div>
      <div class="rpt-card"><div class="rpt-card-icon"><i class="fas fa-triangle-exclamation"></i></div><div class="rpt-card-val">${low}</div><div class="rpt-card-label">Estoque baixo</div></div>
      <div class="rpt-card"><div class="rpt-card-icon"><i class="fas fa-circle-xmark"></i></div><div class="rpt-card-val">${zero}</div><div class="rpt-card-label">Zerados</div></div>
      <div class="rpt-card"><div class="rpt-card-icon"><i class="fas fa-dollar-sign"></i></div><div class="rpt-card-val">R$ ${fmt(estValue)}</div><div class="rpt-card-label">Valor estimado</div></div>
    </div>
    <div class="g-card">
      <div class="g-card-head"><h2 class="g-card-title"><i class="fas fa-plus-circle"></i> Novo item</h2></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Nome *</label><input type="text" id="est-name" class="form-input" placeholder="Ex: Pão de hambúrguer"></div>
        <div class="form-group"><label class="form-label">Categoria</label><input type="text" id="est-cat" class="form-input" placeholder="Ex: Ingredientes"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Quantidade inicial</label><input type="number" id="est-qty" class="form-input" placeholder="0" inputmode="numeric"></div>
        <div class="form-group"><label class="form-label">Estoque mínimo</label><input type="number" id="est-min" class="form-input" placeholder="10" inputmode="numeric"></div>
        <div class="form-group"><label class="form-label">Custo unitário</label><input type="text" id="est-cost" class="form-input" placeholder="0,00" inputmode="decimal"></div>
        <div class="form-group"><label class="form-label">Unidade</label><input type="text" id="est-unit" class="form-input" placeholder="un" value="un"></div>
      </div>
      <div class="g-card-actions"><button class="btn-primary" onclick="criarItemEstoque()"><i class="fas fa-save"></i> Adicionar item</button></div>
    </div>
    <div class="g-card">
      <div class="g-card-head"><h2 class="g-card-title">Itens em estoque</h2></div>
      ${rows ? `<table class="rpt-table"><thead><tr><th>Item</th><th>Categoria</th><th>Quantidade</th><th>Mínimo</th><th>Custo</th><th>Status</th><th>Ações</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="empty-msg">Nenhum item cadastrado.</p>'}
    </div>`;
}

async function criarItemEstoque() {
  const name = elid('est-name')?.value?.trim();
  if (!name) { toast('Informe o nome do item.', true); return; }
  const qty = Number(elid('est-qty')?.value || 0);
  const { error } = await getSb().from('inventory_items').insert({
    name, category: elid('est-cat')?.value?.trim() || null,
    current_quantity: qty, minimum_quantity: Number(elid('est-min')?.value || 0),
    cost_price: parsePriceInput(elid('est-cost')?.value || '0'),
    unit: elid('est-unit')?.value?.trim() || 'un',
  });
  if (error) { toast('Erro ao criar item: ' + error.message, true); return; }
  toast('Item adicionado ao estoque!');
  logAuditAction('create_inventory_item', 'inventory', null, name, null, { quantity: qty, source: 'gestao' });
  initEstoque();
}

async function estoqueMovimento(itemId, tipo) {
  const label = tipo === 'entrada' ? 'Adicionar entrada' : 'Registrar saída';
  const confirmed = await showConfirmModal({
    title: label,
    message: `Informe a quantidade para ${tipo}.`,
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
  });
  if (!confirmed) return;
  const qtyStr = prompt(`Quantidade para ${tipo}:`);
  if (!qtyStr) return;
  const qty = Number(qtyStr);
  if (!qty || qty <= 0) { toast('Quantidade inválida.', true); return; }
  const reason = tipo === 'saida' ? (prompt('Motivo da saída (opcional):') || null) : null;
  const actor = getCurrentActor();

  const sign = tipo === 'entrada' ? qty : -qty;
  const { error: movErr } = await getSb().from('inventory_movements').insert({
    inventory_item_id: itemId, movement_type: tipo, quantity: qty,
    reason, created_by_user_id: actor.id, created_by_email: actor.email,
  });
  if (movErr) { toast('Erro ao registrar movimentação.', true); return; }

  const { data: item } = await getSb().from('inventory_items').select('current_quantity,name').eq('id', itemId).single();
  if (item) {
    const newQty = Number(item.current_quantity || 0) + sign;
    await getSb().from('inventory_items').update({ current_quantity: newQty, updated_at: new Date().toISOString() }).eq('id', itemId);
    logAuditAction(tipo === 'entrada' ? 'inventory_entry' : 'inventory_exit', 'inventory', itemId, item.name, reason, { quantity: qty, new_quantity: newQty, source: 'gestao' });
  }

  toast(`${tipo === 'entrada' ? 'Entrada' : 'Saída'} registrada!`);
  initEstoque();
}

/* ══════════════════════════════════════
   PERMISSÕES POR CARGO
══════════════════════════════════════ */
const ROLE_LABELS = { admin:'Dona / Admin', gerente:'Gerente', caixa:'Caixa', atendente:'Atendente', cozinha:'Cozinha', entregador:'Entregador', funcionario:'Funcionário' };
const ROLE_ACCESS = {
  admin:      ['produtos','pedidos','vendas','balcao','caixa','despesas','estoque','relatorios','config','acessos'],
  gerente:    ['produtos','pedidos','vendas','balcao','caixa','despesas','estoque','relatorios'],
  caixa:      ['pedidos','vendas','balcao','caixa'],
  atendente:  ['pedidos','balcao'],
  cozinha:    ['pedidos'],
  entregador: ['pedidos'],
  funcionario:['pedidos','balcao','vendas'],
};

function getUserRole() {
  return gs.currentUser?.user_metadata?.role || 'admin';
}

function canAccessSection(name) {
  const role = getUserRole();
  const allowed = ROLE_ACCESS[role] || ROLE_ACCESS.admin;
  return allowed.includes(name);
}

async function loadProfiles() {
  try {
    const { data, error } = await getSb().from('profiles').select('*').order('name');
    if (error) throw error;
    renderProfilesList(data || []);
  } catch (e) {
    const el = elid('profiles-list');
    if (el) el.innerHTML = '<p class="empty-msg">Execute a migration SQL para usar esta funcionalidade.</p>';
  }
}

function renderProfilesList(profiles) {
  const el = elid('profiles-list');
  if (!el) return;
  if (!profiles.length) { el.innerHTML = '<p class="empty-msg">Nenhuma conta cadastrada.</p>'; return; }

  const roleOpts = Object.entries(ROLE_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

  el.innerHTML = `<table class="rpt-table">
    <thead><tr><th>Nome</th><th>Email</th><th>Cargo</th><th>Status</th><th>Ações</th></tr></thead>
    <tbody>${profiles.map(p => `<tr>
      <td><strong>${esc(p.name || '—')}</strong></td>
      <td>${esc(p.email || '—')}</td>
      <td>${esc(ROLE_LABELS[p.role] || p.role || 'Funcionário')}</td>
      <td><span class="rpt-pill ${p.is_active !== false ? 'rpt-pill-paid' : 'rpt-pill-cancelled'}">${p.is_active !== false ? 'Ativo' : 'Inativo'}</span></td>
      <td>
        <select class="form-input" style="width:auto;display:inline;font-size:.78rem" onchange="updateProfileRole('${p.id}',this.value,'${esc(p.name||'')}')">${Object.entries(ROLE_LABELS).map(([v, l]) => `<option value="${v}"${p.role === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn-sale-detail" onclick="toggleProfileActive('${p.id}',${p.is_active !== false},'${esc(p.name||'')}')"><i class="fas fa-${p.is_active !== false ? 'ban' : 'check'}"></i></button>
      </td>
    </tr>`).join('')}</tbody>
  </table>`;
}

async function updateProfileRole(id, newRole, name) {
  const { error } = await getSb().from('profiles').update({ role: newRole, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { toast('Erro ao alterar cargo.', true); return; }
  toast(`Cargo de ${name} alterado para ${ROLE_LABELS[newRole] || newRole}.`);
  logAuditAction('update_user_role', 'user', id, name, null, { after: { role: newRole } });
  loadProfiles();
}

async function toggleProfileActive(id, currentlyActive, name) {
  const newStatus = !currentlyActive;
  const { error } = await getSb().from('profiles').update({ is_active: newStatus, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { toast('Erro ao alterar status.', true); return; }
  toast(`${name} ${newStatus ? 'ativado' : 'desativado'}.`);
  logAuditAction(newStatus ? 'activate_user' : 'deactivate_user', 'user', id, name);
  loadProfiles();
}

/* ══════════════════════════════════════
   PRINT AGENT — ativação de dispositivos
   Tudo aqui passa por funções SECURITY DEFINER (RPC) — a Gestão nunca
   lê/grava direto nas tabelas print_agent_devices/activation_codes,
   que ficam com RLS travado e revogadas de anon/authenticated.
   O único gate é "estar autenticado na Gestão", igual ao resto do app
   (não existe hoje um nível "admin" real e funcional pra distinguir além disso).
══════════════════════════════════════ */

async function paGenerateCode() {
  const actor = getCurrentActor();
  try {
    const { data, error } = await getSb().rpc('generate_print_agent_activation_code', {
      input_label: null,
      input_email: actor.email,
      expires_in_min: 30,
    });
    if (error) throw error;

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.code) throw new Error('Resposta inesperada');

    const box = elid('pa-new-code-box');
    elid('pa-code-value').textContent = row.code;
    const mins = Math.round((new Date(row.expires_at) - new Date()) / 60000);
    elid('pa-code-expiry').textContent = `${mins} min`;
    box.style.display = 'block';

    logAuditAction('generate_print_agent_code', 'print_agent', null, row.code.replace(/.(?=.{4})/g, '•'));
    toast('Código gerado. Válido por 30 minutos, uso único.');
  } catch (e) {
    console.error('[PrintAgent] Erro ao gerar código:', e);
    toast('Erro ao gerar código. Execute a migration SQL (add_print_agent_activation.sql) antes de usar.', true);
  }
}

async function paCopyCode() {
  const code = elid('pa-code-value')?.textContent?.trim();
  if (!code) return;
  try {
    await navigator.clipboard.writeText(code);
    toast('Código copiado.');
  } catch (e) {
    toast('Não foi possível copiar automaticamente. Selecione o código manualmente.', true);
  }
}

async function loadPrintAgentDevices() {
  try {
    const { data, error } = await getSb().rpc('list_print_agent_devices');
    if (error) throw error;
    renderPrintAgentDevices(data || []);
  } catch (e) {
    const el = elid('pa-devices-list');
    if (el) el.innerHTML = '<p class="empty-msg">Execute a migration SQL (add_print_agent_activation.sql) para usar esta funcionalidade.</p>';
  }
}

function renderPrintAgentDevices(devices) {
  const el = elid('pa-devices-list');
  if (!el) return;
  if (!devices.length) { el.innerHTML = '<p class="empty-msg">Nenhum computador ativado ainda.</p>'; return; }

  const fmt = (d) => d ? new Date(d).toLocaleString('pt-BR') : '—';

  const fmtRelative = (d) => {
    if (!d) return 'Nunca';
    const diffMs = Date.now() - new Date(d).getTime();
    const min = Math.floor(diffMs / 60000);
    if (min < 1) return 'agora mesmo';
    if (min < 60) return `há ${min} minuto${min === 1 ? '' : 's'}`;
    const h = Math.floor(min / 60);
    if (h < 24) return `há ${h} hora${h === 1 ? '' : 's'}`;
    const days = Math.floor(h / 24);
    return `há ${days} dia${days === 1 ? '' : 's'}`;
  };

  el.innerHTML = `<table class="rpt-table">
    <thead><tr><th>Computador</th><th>Ativado em</th><th>Última conexão</th><th>Status</th><th>Ações</th></tr></thead>
    <tbody>${devices.map(d => `<tr>
      <td><strong>${esc(d.label || 'Sem nome')}</strong></td>
      <td>${fmt(d.activated_at)}</td>
      <td>${esc(fmtRelative(d.last_seen_at))}</td>
      <td><span class="rpt-pill ${d.revoked_at ? 'rpt-pill-cancelled' : 'rpt-pill-paid'}">${d.revoked_at ? 'Revogado' : 'Ativo'}</span></td>
      <td>${d.revoked_at ? '' : `<button class="btn-sale-detail" onclick="paRevokeDevice('${d.id}','${esc(d.label || 'este computador')}')"><i class="fas fa-ban"></i> Revogar</button>`}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

async function paRevokeDevice(id, label) {
  const ok = await showConfirmModal({
    title: 'Revogar computador?',
    message: `"${label}" vai parar de conseguir imprimir comandas imediatamente. Essa ação não pode ser desfeita — será preciso gerar um novo código de ativação.`,
    confirmText: 'Revogar',
    cancelText: 'Cancelar',
    danger: true,
  });
  if (!ok) return;

  try {
    const { error } = await getSb().rpc('revoke_print_agent_device', { input_device_id: id });
    if (error) throw error;
    toast(`"${label}" revogado.`);
    logAuditAction('revoke_print_agent_device', 'print_agent', id, label);
    loadPrintAgentDevices();
  } catch (e) {
    console.error('[PrintAgent] Erro ao revogar:', e);
    toast('Erro ao revogar dispositivo.', true);
  }
}

/* ══════════════════════════════════════
   DESCONTOS, ESTORNOS E CORTESIAS
══════════════════════════════════════ */
async function applyDiscount(orderId) {
  const o = gs.orders.find(x => x.id === orderId);
  if (!o) return;
  const valStr = prompt('Valor do desconto (R$):');
  if (!valStr) return;
  const val = parsePriceInput(valStr);
  if (!val || val <= 0) { toast('Valor inválido.', true); return; }
  const reason = prompt('Motivo do desconto (obrigatório):');
  if (!reason || !reason.trim()) { toast('Informe o motivo do desconto.', true); return; }
  const actor = getCurrentActor();
  const newTotal = Math.max(0, Number(o.total || 0) - val);
  const { error } = await getSb().from('orders').update({
    discount_amount: val, discount_reason: reason.trim(),
    discount_by_user_id: actor.id, discount_by_email: actor.email,
    total: newTotal, updated_at: new Date().toISOString(),
  }).eq('id', orderId);
  if (error) { toast('Erro ao aplicar desconto.', true); return; }
  const num = o.order_number || orderId.slice(-8).toUpperCase();
  toast(`Desconto de R$ ${fmt(val)} aplicado.`);
  logAuditAction('apply_discount', 'order', orderId, `#${num}`, reason.trim(), { before: { total: o.total }, after: { total: newTotal, discount: val } });
  await loadOrders();
}

async function refundPayment(orderId) {
  const o = gs.orders.find(x => x.id === orderId);
  if (!o) return;
  const valStr = prompt(`Valor do estorno (total do pedido: R$ ${fmt(o.total || 0)}):`);
  if (!valStr) return;
  const val = parsePriceInput(valStr);
  if (!val || val <= 0) { toast('Valor inválido.', true); return; }
  const reason = prompt('Motivo do estorno (obrigatório):');
  if (!reason || !reason.trim()) { toast('Informe o motivo do estorno.', true); return; }
  const actor = getCurrentActor();
  const { error } = await getSb().from('orders').update({
    refund_amount: val, refund_reason: reason.trim(),
    refunded_at: new Date().toISOString(),
    refunded_by_user_id: actor.id, refunded_by_email: actor.email,
    payment_status: 'estornado', updated_at: new Date().toISOString(),
  }).eq('id', orderId);
  if (error) { toast('Erro ao estornar.', true); return; }
  const num = o.order_number || orderId.slice(-8).toUpperCase();
  toast(`Estorno de R$ ${fmt(val)} registrado.`);
  logAuditAction('refund_payment', 'order', orderId, `#${num}`, reason.trim(), { before: { payment_status: o.payment_status }, after: { payment_status: 'estornado', refund: val } });
  await loadOrders();
}

async function applyCourtesy(orderId) {
  const o = gs.orders.find(x => x.id === orderId);
  if (!o) return;
  const valStr = prompt('Valor da cortesia (R$):');
  if (!valStr) return;
  const val = parsePriceInput(valStr);
  if (!val || val <= 0) { toast('Valor inválido.', true); return; }
  const reason = prompt('Motivo da cortesia (obrigatório):');
  if (!reason || !reason.trim()) { toast('Informe o motivo da cortesia.', true); return; }
  const actor = getCurrentActor();
  const newTotal = Math.max(0, Number(o.total || 0) - val);
  const { error } = await getSb().from('orders').update({
    courtesy_amount: val, courtesy_reason: reason.trim(),
    courtesy_by_user_id: actor.id, courtesy_by_email: actor.email,
    total: newTotal, updated_at: new Date().toISOString(),
  }).eq('id', orderId);
  if (error) { toast('Erro ao aplicar cortesia.', true); return; }
  const num = o.order_number || orderId.slice(-8).toUpperCase();
  toast(`Cortesia de R$ ${fmt(val)} aplicada.`);
  logAuditAction('apply_courtesy', 'order', orderId, `#${num}`, reason.trim(), { before: { total: o.total }, after: { total: newTotal, courtesy: val } });
  await loadOrders();
}

/* ══════════════════════════════════════
   ENTREGADORES
══════════════════════════════════════ */
async function loadDrivers() {
  try {
    const { data } = await getSb().from('delivery_drivers').select('*').eq('is_active', true).order('name');
    return data || [];
  } catch (_) { return []; }
}

async function salvarEntregador() {
  const name = elid('driver-name')?.value?.trim();
  if (!name) { toast('Informe o nome do entregador.', true); return; }
  const phone = elid('driver-phone')?.value?.trim() || null;
  const { error } = await getSb().from('delivery_drivers').insert({ name, phone });
  if (error) { toast('Erro ao cadastrar: ' + error.message, true); return; }
  toast(`Entregador ${name} cadastrado!`);
  logAuditAction('create_driver', 'driver', null, name);
  elid('driver-name').value = '';
  elid('driver-phone').value = '';
  loadDriversList();
}

async function loadDriversList() {
  const el = elid('drivers-list');
  if (!el) return;
  const drivers = await loadDrivers();
  if (!drivers.length) { el.innerHTML = '<p class="empty-msg" style="font-size:.82rem">Nenhum entregador cadastrado.</p>'; return; }
  el.innerHTML = `<table class="rpt-table"><thead><tr><th>Nome</th><th>Telefone</th><th>Status</th></tr></thead><tbody>${drivers.map(d => `<tr><td><strong>${esc(d.name)}</strong></td><td>${esc(d.phone || '—')}</td><td><span class="rpt-pill rpt-pill-paid">Ativo</span></td></tr>`).join('')}</tbody></table>`;
}

async function assignDriver(orderId) {
  const drivers = await loadDrivers();
  if (!drivers.length) { toast('Cadastre um entregador em Configurações primeiro.', true); return; }
  const o = gs.orders.find(x => x.id === orderId);
  if (!o) return;
  const names = drivers.map((d, i) => `${i + 1}. ${d.name}`).join('\n');
  const choice = prompt(`Escolha o entregador:\n${names}\n\nDigite o número:`);
  if (!choice) return;
  const idx = Number(choice) - 1;
  const driver = drivers[idx];
  if (!driver) { toast('Entregador inválido.', true); return; }
  const feeStr = prompt('Valor a pagar ao entregador (R$, 0 se não pagar):');
  const fee = parsePriceInput(feeStr || '0');
  const { error } = await getSb().from('orders').update({
    driver_id: driver.id, driver_name: driver.name, driver_fee: fee,
    updated_at: new Date().toISOString(),
  }).eq('id', orderId);
  if (error) { toast('Erro ao atribuir entregador.', true); return; }
  const num = o.order_number || orderId.slice(-8).toUpperCase();
  toast(`Entregador ${driver.name} atribuído.`);
  logAuditAction('assign_driver', 'order', orderId, `#${num}`, null, { driver: driver.name, fee });
  await loadOrders();
}

/* ══════════════════════════════════════
   BACKUP / EXPORTAÇÃO GERAL
══════════════════════════════════════ */
async function exportBackupData(type) {
  const actor = getCurrentActor();
  let header, rows, data;

  if (type === 'pedidos') {
    data = gs.orders;
    header = ['Pedido','Data','Cliente','Telefone','Total','Pagamento','Status','Origem'];
    rows = data.map(o => [o.order_number || '', o.created_at ? new Date(o.created_at).toLocaleString('pt-BR') : '', o.customer_name || '', o.customer_phone || '', fmt(o.total || 0), getPaymentLabel(o), o.status || '', getSaleOriginLabel(o)]);
  } else if (type === 'produtos') {
    data = gs.products;
    header = ['Nome','Categoria','Preço','Ativo'];
    rows = data.map(p => [p.name || '', p.category || '', fmt(p.price || 0), p.active !== false ? 'Sim' : 'Não']);
  } else if (type === 'estoque') {
    const { data: items } = await getSb().from('inventory_items').select('*').order('name');
    header = ['Item','Categoria','Quantidade','Mínimo','Custo','Unidade','Ativo'];
    rows = (items || []).map(i => [i.name, i.category || '', i.current_quantity, i.minimum_quantity, fmt(i.cost_price || 0), i.unit || 'un', i.is_active ? 'Sim' : 'Não']);
  } else if (type === 'despesas') {
    const { data: exp } = await getSb().from('expenses').select('*').neq('status', 'cancelado').order('expense_date', { ascending: false });
    header = ['Data','Categoria','Descrição','Valor','Pagamento','Registrado por'];
    rows = (exp || []).map(e => [e.expense_date, e.category, e.description, fmt(e.amount || 0), e.payment_method || '', e.created_by_email?.split('@')[0] || '']);
  } else if (type === 'caixa') {
    const { data: closings } = await getSb().from('cash_closings').select('*').order('opened_at', { ascending: false });
    header = ['Aberto em','Fechado em','Aberto por','Fechado por','Valor inicial','Esperado','Contado','Diferença','Status'];
    rows = (closings || []).map(c => [c.opened_at ? new Date(c.opened_at).toLocaleString('pt-BR') : '', c.closed_at ? new Date(c.closed_at).toLocaleString('pt-BR') : '', c.opened_by_email?.split('@')[0] || '', c.closed_by_email?.split('@')[0] || '', fmt(c.opening_amount || 0), fmt(c.expected_cash_amount || 0), fmt(c.counted_cash_amount || 0), fmt(c.difference_amount || 0), c.status]);
  } else if (type === 'auditoria') {
    const { data: logs } = await getSb().from('audit_logs').select('*').order('created_at', { ascending: false }).limit(1000);
    header = ['Data','Conta','Ação','Tipo','Item','Motivo','Origem'];
    rows = (logs || []).map(l => [new Date(l.created_at).toLocaleString('pt-BR'), l.actor_name || l.actor_email || '', getFriendlyAction(l.action, l.entity_label, l.metadata), l.entity_type, l.entity_label || '', l.reason || 'Sem observação', l.source || '']);
  } else { toast('Tipo de exportação inválido.', true); return; }

  if (!rows || !rows.length) { toast('Nenhum dado para exportar.', true); return; }

  const csv = [header.join(','), ...rows.map(r => r.map(csvEscape).join(','))].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `backup-${type}-day-lanches-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  try {
    await getSb().from('export_logs').insert({ export_type: type, exported_by_user_id: actor.id, exported_by_email: actor.email });
  } catch (_) {}
  logAuditAction('export_backup', 'backup', null, type);
  toast(`Exportação de ${type} concluída!`);
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
      pdvSyncCloseStoreState();
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
  orderType: 'balcao',
  /* Forma de pagamento do pedido de Delivery lançado no Balcão (dinheiro |
     pix_loja | cartao_maquininha) -- obrigatória, não usado para Mesa. */
  paymentMethod: null,
  /* mode: 'new' (montando pedido novo) | 'table' (vendo comanda de uma mesa
     ocupada) | 'adding' (adicionando produtos a essa comanda) */
  mode: 'new',
  activeTableOrder: null,
  addCart: [],
};

/* Carrinho "ativo": o da tela de novo pedido, ou o de adição a uma mesa
   ocupada — deixa pdvAddProduct/pdvConfirmOptions/pdvChangeQty/etc. servirem
   os dois fluxos sem duplicar lógica. */
function pdvActiveCart() {
  return pdv.mode === 'adding' ? pdv.addCart : pdv.cart;
}

function pdvInit() {
  if (!pdv.initialized) {
    pdv.initialized = true;
  }
  pdvRenderProducts();
  pdvRenderMesas();
  if (pdv.mode !== 'new') {
    pdvExitTableViewIfStale();
    if (pdv.mode !== 'new') pdvRenderTableView();
  }
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

  const cart = pdvActiveCart();
  const existing = cart.find(c => c.productId === productId && !c.options?.length);
  if (existing) {
    existing.qty++;
    existing.total = existing.qty * existing.unitPrice;
  } else {
    cart.push({
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
  const cart = pdvActiveCart();
  const existing = cart.find(c => c.productId === product.id && !c.options?.length);
  if (existing) {
    existing.qty++;
    existing.total = existing.qty * existing.unitPrice;
  } else {
    cart.push({
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

  pdvActiveCart().push({
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

function pdvSetOrderType(type) {
  pdv.orderType = type;
  const isDelivery = type === 'delivery';

  document.querySelectorAll('#pdv-order-type-grid .pdv-status-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.orderType === type);
  });

  const mesaSection = elid('pdv-mesa-section');
  const deliverySection = elid('pdv-delivery-section');
  const phoneGroup = elid('pdv-phone-group');
  if (mesaSection) mesaSection.style.display = isDelivery ? 'none' : '';
  if (deliverySection) deliverySection.style.display = isDelivery ? '' : 'none';
  if (phoneGroup) phoneGroup.style.display = isDelivery ? '' : 'none';

  const hint = elid('pdv-customer-hint');
  if (hint) {
    hint.textContent = isDelivery ? 'obrigatório' : 'opcional';
    hint.classList.toggle('pdv-required', isDelivery);
  }

  if (!isDelivery) {
    pdv.tableNumber = null;
    pdv.paymentMethod = null;
    document.querySelectorAll('#pdv-payment-method-grid .pdv-pay-btn').forEach(b => b.classList.remove('active'));
    ['pdv-customer-phone', 'pdv-delivery-fee'].forEach(id => { const el = elid(id); if (el) el.value = ''; });
    pdvRenderMesas();
  }

  pdvRenderCart();
}

function pdvSelectPaymentMethod(method) {
  pdv.paymentMethod = method;
  document.querySelectorAll('#pdv-payment-method-grid .pdv-pay-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.pay === method);
  });
}

function pdvFormatPhone(input) {
  let v = input.value.replace(/\D/g, '').substring(0, 11);
  if (v.length > 6) {
    v = '(' + v.substring(0,2) + ') ' + v.substring(2,7) + '-' + v.substring(7);
  } else if (v.length > 2) {
    v = '(' + v.substring(0,2) + ') ' + v.substring(2);
  } else if (v.length > 0) {
    v = '(' + v;
  }
  input.value = v;
}

function pdvGetDeliveryFee() {
  const raw = (elid('pdv-delivery-fee')?.value || '').replace(',', '.').trim();
  const n = parseFloat(raw);
  return isNaN(n) || n < 0 ? 0 : n;
}

function pdvHighlightError(input) {
  if (!input) return;
  input.classList.add('pdv-field-error');
  input.focus();
  input.addEventListener('input', function clearErr() {
    input.classList.remove('pdv-field-error');
    input.removeEventListener('input', clearErr);
  }, { once: true });
}

function pdvRenderCart() {
  const adding = pdv.mode === 'adding';
  const cart = pdvActiveCart();
  const wrap = elid(adding ? 'pdv-table-addcart-items' : 'pdv-cart-items');
  if (!wrap) return;
  const isDelivery = !adding && pdv.orderType === 'delivery';
  const feeRow = elid('pdv-fee-row');
  const subtotalEl = elid(adding ? 'pdv-tv-addcart-subtotal' : 'pdv-subtotal');
  const totalEl = elid(adding ? 'pdv-tv-addcart-total' : 'pdv-total');

  if (!cart.length) {
    wrap.innerHTML = '<p class="pdv-cart-empty"><i class="fas fa-basket-shopping"></i> Nenhum item adicionado</p>';
    if (subtotalEl) subtotalEl.textContent = 'R$ 0,00';
    if (totalEl) totalEl.textContent = 'R$ 0,00';
    if (!adding && feeRow) feeRow.style.display = 'none';
    return;
  }

  wrap.innerHTML = cart.map((c, i) => {
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

  const subtotal = cart.reduce((s, c) => s + c.total, 0);
  const fee = isDelivery ? pdvGetDeliveryFee() : 0;
  const total = subtotal + fee;
  if (subtotalEl) subtotalEl.textContent = `R$ ${fmt(subtotal)}`;
  if (totalEl) totalEl.textContent = `R$ ${fmt(total)}`;
  if (!adding && feeRow) {
    feeRow.style.display = isDelivery ? '' : 'none';
    if (isDelivery) elid('pdv-fee-display').textContent = `R$ ${fmt(fee)}`;
  }
}

function pdvChangeQty(index, delta) {
  const cart = pdvActiveCart();
  const item = cart[index];
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
  item.total = item.qty * item.unitPrice;
  pdvRenderCart();
}

function pdvRemoveItem(index) {
  pdvActiveCart().splice(index, 1);
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
  ['pdv-customer-name', 'pdv-notes', 'pdv-customer-phone', 'pdv-delivery-fee']
    .forEach(id => { const el = elid(id); if (el) el.value = ''; });
  pdvSetOrderType('balcao');
}

async function pdvSave() {
  if (!pdv.cart.length) { toast('Adicione pelo menos um produto.', true); return; }

  const isDelivery = pdv.orderType === 'delivery';

  const customerName  = (elid('pdv-customer-name')?.value || '').trim();
  const customerPhone = (elid('pdv-customer-phone')?.value || '').trim();
  const feeRaw         = (elid('pdv-delivery-fee')?.value || '').trim();
  const notes = (elid('pdv-notes')?.value || '').trim();
  /* Validação estrita só pra salvar (o preview ao vivo em pdvRenderCart()
     continua usando pdvGetDeliveryFee(), que é tolerante por design).
     parseFloat sozinho aceita lixo depois do número ("12abc"→12), então o
     formato inteiro precisa bater com a regex antes de converter — só
     dígitos, com no máximo um separador decimal (vírgula ou ponto) e até
     2 casas. Um valor negativo ou mal digitado não pode virar 0/entrega
     grátis em silêncio. */
  let fee = 0;

  if (isDelivery) {
    if (!customerName)  { toast('Informe o nome do cliente.', true); pdvHighlightError(elid('pdv-customer-name')); return; }
    if (!customerPhone) { toast('Informe o telefone do cliente.', true); pdvHighlightError(elid('pdv-customer-phone')); return; }

    if (!feeRaw) { toast('Informe uma taxa de entrega válida.', true); pdvHighlightError(elid('pdv-delivery-fee')); return; }
    const feeNormalized = feeRaw.replace(',', '.');
    if (feeNormalized.startsWith('-')) { toast('A taxa de entrega não pode ser negativa.', true); pdvHighlightError(elid('pdv-delivery-fee')); return; }
    if (!/^\d+(?:\.\d{1,2})?$/.test(feeNormalized)) { toast('Informe uma taxa de entrega válida.', true); pdvHighlightError(elid('pdv-delivery-fee')); return; }
    fee = Number(feeNormalized);
    if (!Number.isFinite(fee)) { toast('Informe uma taxa de entrega válida.', true); pdvHighlightError(elid('pdv-delivery-fee')); return; }

    if (!pdv.paymentMethod) { toast('Selecione a forma de pagamento.', true); return; }
  } else {
    if (!pdv.tableNumber) { toast('Selecione a mesa do cliente.', true); return; }
  }

  const btn = elid('pdv-btn-save');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

  const subtotal = pdv.cart.reduce((s, c) => s + c.total, 0);
  const total = subtotal + (isDelivery ? fee : 0);
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
    customer_name: customerName || 'Cliente balcão',
    customer_phone: isDelivery ? (customerPhone || null) : null,
    delivery_type: isDelivery ? 'delivery' : 'balcao',
    delivery_fee: isDelivery ? fee : 0,
    /* Delivery lançado no Balcão: cliente já envia endereço pelo WhatsApp,
       então não é coletado aqui — só a forma de pagamento, escolhida pela
       Dayane. Mesa/Balcão normal continuam com 'a_definir' (pagam depois,
       ao fechar a comanda). */
    payment_method: isDelivery ? pdv.paymentMethod : 'a_definir',
    payment_status: 'pendente',
    paid_at: null,
    status: 'novo',
    subtotal: subtotal,
    total: total,
    items: orderItems,
    notes: notes || null,
    order_source: 'balcao',
    table_number: isDelivery ? null : pdv.tableNumber,
    customer_address_text: null,
    location: null,
    created_by_user_id: actor.id,
    created_by_email: actor.email,
    handled_by_user_id: actor.id,
    handled_by_email: actor.email,
  };

  console.log('[PDV] Payload pedido:', orderData);

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

      /* Índice único orders_one_open_table: outra requisição (duplo clique,
         outra aba) já abriu essa mesa entre o carregamento da tela e este
         salvamento. Em vez de erro, abre a comanda que já existe. */
      if (error.code === '23505' && !isDelivery) {
        const stuckTable = pdv.tableNumber;
        toast(`Mesa ${stuckTable} já está aberta. Abrindo pedido existente...`);
        await loadOrders();
        pdv.cart = [];
        pdvSetOrderType('balcao');
        pdvOpenTable(stuckTable);
        return;
      }

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

    logAuditAction('create_order', 'order', data.id, `#${orderNumber}`, null, { table: pdv.tableNumber, deliveryType: orderData.delivery_type, total });

    pdv.cart = [];
    ['pdv-customer-name', 'pdv-notes', 'pdv-customer-phone', 'pdv-delivery-fee']
      .forEach(id => { const el = elid(id); if (el) el.value = ''; });
    pdvSetOrderType('balcao');

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

/* Uma mesa está ocupada quando existe uma comanda de Balcão aberta pra ela:
   não cancelada e ainda não paga. Pagar nunca muda `status` (só
   payment_status/paid_at), então o critério tem que olhar pagamento, não
   status — do contrário uma mesa paga fica "ocupada" pra sempre até alguém
   avançar o status manualmente. */
function pdvIsOpenTableOrder(o) {
  if (!o.table_number) return false;
  if (o.order_source !== 'balcao' && o.delivery_type !== 'balcao') return false;
  if (o.status === 'cancelado') return false;
  return !isPaidOrder(o);
}

function pdvFindOpenOrderForTable(num) {
  return gs.orders.find(o => o.table_number === num && pdvIsOpenTableOrder(o)) || null;
}

function pdvGetOccupiedTables() {
  const occupied = {};
  gs.orders.forEach(o => {
    if (!pdvIsOpenTableOrder(o)) return;
    occupied[o.table_number] = {
      orderId: o.id,
      orderNumber: o.order_number || o.id?.slice(-8).toUpperCase() || '',
      customerName: o.customer_name || 'Cliente balcão',
      total: Number(o.total || 0),
    };
  });
  return occupied;
}

function pdvRenderMesas() {
  const grid = elid('pdv-mesa-grid');
  if (!grid) return;
  const occupied = pdvGetOccupiedTables();

  grid.innerHTML = Array.from({ length: 10 }, (_, i) => {
    const num = i + 1;
    const info = occupied[num];
    const isOccupied = !!info;
    const isSelected = pdv.tableNumber === num;

    let cls = 'pdv-mesa-btn';
    if (isSelected) cls += ' mesa-selected';
    else if (isOccupied) cls += ' mesa-ocupada';
    else cls += ' mesa-livre';

    const statusText = isSelected ? 'Selecionada' : (isOccupied ? 'Ocupada' : 'Livre');
    const infoLine = (isOccupied && !isSelected)
      ? `<span class="pdv-mesa-client">${esc(info.customerName)}</span>`
      : '';
    const titleAttr = isOccupied ? ` title="Pedido #${esc(info.orderNumber)} — R$ ${fmt(info.total)}"` : '';

    return `<button type="button" class="${cls}"${titleAttr} onclick="pdvSelectMesa(${num})">
      <span class="pdv-mesa-num">${num}</span>
      <span class="pdv-mesa-status">${statusText}</span>
      ${infoLine}
    </button>`;
  }).join('');
}

function pdvSelectMesa(num) {
  const occupied = pdvGetOccupiedTables();
  if (occupied[num]) {
    pdvOpenTable(num);
    return;
  }
  pdv.tableNumber = pdv.tableNumber === num ? null : num;
  pdvRenderMesas();
}

/* ── Comanda da mesa (mesa ocupada) ── */

function pdvOpenTable(num) {
  const order = pdvFindOpenOrderForTable(num);
  if (!order) {
    toast(`Mesa ${num} não está mais ocupada.`, true);
    pdvRenderMesas();
    return;
  }
  pdv.activeTableOrder = order;
  pdv.mode = 'table';
  pdv.addCart = [];

  const newOrderView = elid('pdv-new-order-view');
  const tableView = elid('pdv-table-view');
  if (newOrderView) newOrderView.style.display = 'none';
  if (tableView) tableView.style.display = '';

  pdvRenderTableView();
  pdvRenderMesas();
}

function pdvBackToMesaGrid() {
  pdv.mode = 'new';
  pdv.activeTableOrder = null;
  pdv.addCart = [];

  const newOrderView = elid('pdv-new-order-view');
  const tableView = elid('pdv-table-view');
  if (tableView) tableView.style.display = 'none';
  if (newOrderView) newOrderView.style.display = '';

  pdvRenderMesas();
  pdvRenderCart();
}

/* Se a mesa exibida na tela deixou de estar aberta (paga ou cancelada por
   outra ação na mesma aba, ex: em Pedidos), sai da visão da comanda em vez
   de continuar mostrando um pedido que não existe mais como "aberto". */
function pdvExitTableViewIfStale() {
  if (pdv.mode === 'new' || !pdv.activeTableOrder) return;
  const stillOpen = pdvFindOpenOrderForTable(pdv.activeTableOrder.table_number);
  if (!stillOpen || stillOpen.id !== pdv.activeTableOrder.id) {
    pdvBackToMesaGrid();
  }
}

function pdvRenderTableView() {
  const order = pdv.activeTableOrder;
  if (!order) return;

  const titleEl = elid('pdv-tv-title');
  if (titleEl) titleEl.textContent = `Mesa ${order.table_number} · Ocupada`;

  const metaEl = elid('pdv-tv-meta');
  if (metaEl) {
    const opened = order.created_at ? new Date(order.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—';
    metaEl.innerHTML = `
      <div class="pdv-tv-meta-row"><i class="fas fa-user"></i> ${esc(order.customer_name || 'Cliente balcão')}</div>
      <div class="pdv-tv-meta-row"><i class="fas fa-clock"></i> Aberta às ${opened}</div>
      ${order.notes ? `<div class="pdv-tv-meta-row"><i class="fas fa-note-sticky"></i> ${esc(order.notes)}</div>` : ''}
    `;
  }

  const items = Array.isArray(order.items) ? order.items : [];
  const itemsEl = elid('pdv-tv-items');
  if (itemsEl) {
    itemsEl.innerHTML = items.length ? items.map(i => {
      const optsHtml = (i.options || []).map(og => `${og.groupTitle}: ${(og.items || []).map(oi => oi.name).join(', ')}`).join(' · ');
      const total = i.total || (i.finalUnitPrice || i.unitPrice || 0) * (i.qty || 1) || 0;
      return `<div class="pdv-item">
        <div class="pdv-item-info">
          <div class="pdv-item-name">${i.qty || 1}x ${esc(i.name)}</div>
          ${optsHtml ? `<div class="pdv-item-opts">${esc(optsHtml)}</div>` : ''}
          ${i.notes ? `<div class="pdv-item-opts">Obs: ${esc(i.notes)}</div>` : ''}
        </div>
        <div class="pdv-item-price">R$ ${fmt(total)}</div>
      </div>`;
    }).join('') : '<p class="pdv-cart-empty"><i class="fas fa-basket-shopping"></i> Nenhum item</p>';
  }

  const summaryEl = elid('pdv-tv-summary');
  if (summaryEl) {
    const discount = Number(order.discount_amount || 0);
    const courtesy = Number(order.courtesy_amount || 0);
    summaryEl.innerHTML = `
      <div class="pdv-summary-row"><span>Subtotal</span><span>R$ ${fmt(order.subtotal || 0)}</span></div>
      ${discount > 0 ? `<div class="pdv-summary-row"><span>Desconto</span><span>- R$ ${fmt(discount)}</span></div>` : ''}
      ${courtesy > 0 ? `<div class="pdv-summary-row"><span>Cortesia</span><span>- R$ ${fmt(courtesy)}</span></div>` : ''}
      <div class="pdv-summary-row pdv-summary-total"><span>Total</span><span>R$ ${fmt(order.total || 0)}</span></div>
    `;
  }

  /* Volta pro estado "comanda" (some com o sub-carrinho de adição) sempre
     que a comanda é (re)desenhada fora do modo 'adding' */
  const addBlock = elid('pdv-tv-addcart');
  if (addBlock) addBlock.style.display = pdv.mode === 'adding' ? '' : 'none';
  const actionsBlock = elid('pdv-tv-actions');
  if (actionsBlock) actionsBlock.style.display = pdv.mode === 'adding' ? 'none' : '';

  if (pdv.mode === 'adding') pdvRenderCart();
}

function pdvStartAddingToTable() {
  pdv.mode = 'adding';
  pdv.addCart = [];
  pdvRenderTableView();
  pdvRenderCart();
}

function pdvCancelAddingToTable() {
  pdv.mode = 'table';
  pdv.addCart = [];
  pdvRenderTableView();
}

async function pdvConfirmAddToTable() {
  const order = pdv.activeTableOrder;
  if (!order) return;
  if (!pdv.addCart.length) { toast('Adicione pelo menos um produto.', true); return; }

  const btn = elid('pdv-tv-addcart-confirm');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Adicionando...'; }

  try {
    const newItems = pdv.addCart.map(c => ({
      name: c.name,
      qty: c.qty,
      unitPrice: c.unitPrice,
      finalUnitPrice: c.finalUnitPrice || c.unitPrice,
      total: c.total,
      options: c.options || [],
    }));

    const existingItems = Array.isArray(order.items) ? order.items : [];
    const mergedItems = [...existingItems, ...newItems]; // só anexa — nunca reordena/edita
    const subtotal = mergedItems.reduce((s, i) => s + (i.total || 0), 0);
    /* Preserva desconto/cortesia já aplicados em Pedidos (applyDiscount/
       applyCourtesy alteram `total` sem tocar `items`) */
    const discount = Number(order.discount_amount || 0);
    const courtesy = Number(order.courtesy_amount || 0);
    const total = Math.max(0, subtotal - discount - courtesy);
    const now = new Date().toISOString();

    const { data, error } = await getSb().from('orders')
      .update({ items: mergedItems, subtotal, total, updated_at: now })
      .eq('id', order.id)
      .select('*')
      .single();

    if (error) {
      console.error('[PDV] Erro ao adicionar itens à mesa:', error);
      toast('Erro ao adicionar itens: ' + (error.message || 'tente novamente.'), true);
      return;
    }

    const idx = gs.orders.findIndex(o => o.id === order.id);
    if (idx !== -1) gs.orders[idx] = data;
    pdv.activeTableOrder = data;
    /* orders é a única fonte de verdade em memória; mantém a tela Pedidos
       (e seus filtros/contadores, que leem de gs.orders) sincronizada na
       hora, sem esperar o usuário navegar até lá ou clicar em Atualizar. */
    renderOrders();

    logAuditAction('add_table_items', 'order', order.id, `#${data.order_number || order.id.slice(-8).toUpperCase()}`, null, {
      added: newItems.length,
      table: order.table_number,
    });

    pdv.mode = 'table';
    pdv.addCart = [];
    pdvRenderTableView();
    pdvRenderMesas();
    toast('Itens adicionados ao pedido.');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Confirmar itens'; }
  }
}

async function pdvPayTable() {
  const order = pdv.activeTableOrder;
  if (!order) return;

  await confirmMarkAsPaid(order.id); // reaproveita 100% o modal/lógica de pagamento já existente

  const fresh = gs.orders.find(o => o.id === order.id);
  if (fresh && isPaidOrder(fresh)) {
    toast(`Mesa ${order.table_number} liberada.`);
    pdvBackToMesaGrid();
  }
  /* Se o modal foi cancelado, confirmMarkAsPaid não alterou nada — a
     comanda continua exibida como estava (mesa continua ocupada). */
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
window.pdvOpenTable                   = pdvOpenTable;
window.pdvBackToMesaGrid              = pdvBackToMesaGrid;
window.pdvStartAddingToTable          = pdvStartAddingToTable;
window.pdvCancelAddingToTable         = pdvCancelAddingToTable;
window.pdvConfirmAddToTable           = pdvConfirmAddToTable;
window.pdvPayTable                    = pdvPayTable;
window.pdvSetOrderType                = pdvSetOrderType;
window.pdvSelectPaymentMethod         = pdvSelectPaymentMethod;
window.pdvFormatPhone                 = pdvFormatPhone;
window.pdvCloseOptions                = pdvCloseOptions;
window.pdvCloseOptionsOutside         = pdvCloseOptionsOutside;
window.pdvConfirmOptions              = pdvConfirmOptions;
window.pdvToggleOption                = pdvToggleOption;
window.pdvOptQty                      = pdvOptQty;
window.openOrderDetailModal           = openOrderDetailModal;
window.showOrderDetailTab             = showOrderDetailTab;
window.closeOrderDetail               = closeOrderDetail;
window.closeOrderDetailOutside        = closeOrderDetailOutside;
window.openSaleDetail                 = openSaleDetail;
window.closeSaleDetail                = closeSaleDetail;
window.closeSaleDetailOutside         = closeSaleDetailOutside;
window.setReportFilter                = setReportFilter;
window.showReportTab                  = showReportTab;
window.renderReports                  = renderReports;
window.exportReportCSV                = exportReportCSV;
window.printReport                    = printReport;
window.openClientDetailModal          = openClientDetailModal;
window.closeClientDetail              = closeClientDetail;
window.closeClientDetailOutside       = closeClientDetailOutside;
window.openEmpDetailModal             = openEmpDetailModal;
window.closeEmpDetail                 = closeEmpDetail;
window.closeEmpDetailOutside          = closeEmpDetailOutside;
window.cancelReasonModalClose         = cancelReasonModalClose;
window.cancelReasonModalConfirm       = cancelReasonModalConfirm;
window._cancelReasonBgClick           = _cancelReasonBgClick;
window.abrirCaixa                     = abrirCaixa;
window.fecharCaixa                    = fecharCaixa;
window.salvarDespesa                  = salvarDespesa;
window.criarItemEstoque               = criarItemEstoque;
window.estoqueMovimento               = estoqueMovimento;
window.updateProfileRole              = updateProfileRole;
window.toggleProfileActive            = toggleProfileActive;
window.paGenerateCode                 = paGenerateCode;
window.paCopyCode                     = paCopyCode;
window.paRevokeDevice                 = paRevokeDevice;
window.applyDiscount                  = applyDiscount;
window.refundPayment                  = refundPayment;
window.applyCourtesy                  = applyCourtesy;
window.assignDriver                   = assignDriver;
window.salvarEntregador               = salvarEntregador;
window.exportBackupData               = exportBackupData;
window.pdvOpenCloseStoreModal         = pdvOpenCloseStoreModal;
window.pdvOpenReopenStoreModal        = pdvOpenReopenStoreModal;
