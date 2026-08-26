'use strict';
/* ─────────────────────────────────────────────────────────
   Day Lanches — Cloudflare Worker
   Rotas:
     POST /create-payment                      → cria checkout InfinitePay
     POST /infinitepay/webhook                 → confirma pagamento
     GET  /order-tracking?token=               → dados públicos do pedido
     GET  /reverse-geocode?lat=&lon=           → converte coordenadas em endereço
     GET  /health                              → health check
     GET  /print-agent/health                  → health check do Print Agent
     GET  /print-agent/pending-orders          → pedidos pendentes de impressão
     POST /print-agent/mark-printed            → marca pedido como impresso
     POST /print-agent/activate                → troca codigo de ativacao por device token
     POST /order-status-notification           → cria notificação WhatsApp
     GET  /whatsapp/status                     → status da instância WhatsApp
     GET  /whatsapp/qrcode                     → QR Code para conectar WhatsApp
     POST /whatsapp/test-message               → envia mensagem de teste
     GET  /local-agent/pending-notifications   → notificações pendentes
     POST /local-agent/mark-notification-sent  → marca notificação enviada
     POST /local-agent/mark-notification-failed → marca falha no envio
   ───────────────────────────────────────────────────────── */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/* ── Supabase REST helpers ── */
function sbHeaders(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };
}

async function sbGet(env, table, params) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?${params}`;
  const res  = await fetch(url, { headers: sbHeaders(env) });
  return res.json();
}

async function sbPatch(env, table, params, body) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?${params}`;
  return fetch(url, {
    method: 'PATCH',
    headers: { ...sbHeaders(env), Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });
}

async function sbPost(env, table, body) {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}`;
  return fetch(url, {
    method: 'POST',
    headers: { ...sbHeaders(env), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  });
}

/* Chama uma função Postgres (RPC) com service_role. Usado para operações que
   precisam ser atômicas (ex: resgatar um código de ativação) — a função faz
   tudo numa única transação no banco, em vez de várias chamadas REST separadas. */
async function sbRpc(env, fn, args) {
  const url = `${env.SUPABASE_URL}/rest/v1/rpc/${fn}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: sbHeaders(env),
    body: JSON.stringify(args || {}),
  });
  const data = await res.json().catch(() => null);
  return { ok: res.ok, status: res.status, data };
}

/* SHA-256 hex — usado só pra token de dispositivo (alta entropia, gerado pelo
   servidor). Não usar pra senhas/códigos curtos digitados por humano — esses
   usam bcrypt (mais lento, resiste a força bruta), feito direto no Postgres. */
async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

/* ══════════════════════════════════════════════════════════
   MAIN HANDLER
══════════════════════════════════════════════════════════ */
export default {
  async fetch(request, env) {
    const url      = new URL(request.url);
    const pathname = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (pathname === '/health' && request.method === 'GET') {
      return json({ ok: true, service: 'day-lanches-worker' });
    }

    if (pathname === '/create-payment' && request.method === 'POST') {
      return handleCreatePayment(request, env);
    }

    if (pathname === '/infinitepay/webhook' && request.method === 'POST') {
      return handleWebhook(request, env);
    }

    if (pathname === '/order-tracking' && request.method === 'GET') {
      return handleOrderTracking(url, env);
    }

    if (pathname === '/reverse-geocode' && request.method === 'GET') {
      return handleReverseGeocode(url, env);
    }

    /* ── Print Agent routes ── */
    if (pathname === '/print-agent/health' && request.method === 'GET') {
      return handlePrintAgentHealth(request, env);
    }

    if (pathname === '/print-agent/pending-orders' && request.method === 'GET') {
      return handlePrintAgentPendingOrders(request, env);
    }

    if (pathname === '/print-agent/mark-printed' && request.method === 'POST') {
      return handlePrintAgentMarkPrinted(request, env);
    }

    if (pathname === '/print-agent/activate' && request.method === 'POST') {
      return handlePrintAgentActivate(request, env);
    }

    if (pathname === '/order-status-notification' && request.method === 'POST') {
      return handleOrderStatusNotification(request, env);
    }

    /* ── WhatsApp management routes ── */
    if (pathname === '/whatsapp/status' && request.method === 'GET') {
      return handleWhatsAppStatus(env);
    }

    if (pathname === '/whatsapp/qrcode' && request.method === 'GET') {
      return handleWhatsAppQRCode(env);
    }

    if (pathname === '/whatsapp/test-message' && request.method === 'POST') {
      return handleWhatsAppTestMessage(request, env);
    }

    /* ── Local Agent routes (polling de notificações) ── */
    if (pathname === '/local-agent/pending-notifications' && request.method === 'GET') {
      return handleLocalAgentPending(request, env);
    }

    if (pathname === '/local-agent/order-status' && request.method === 'GET') {
      return handleLocalAgentOrderStatus(request, url, env);
    }

    if (pathname === '/local-agent/mark-notification-sent' && request.method === 'POST') {
      return handleLocalAgentMarkSent(request, env);
    }

    if (pathname === '/local-agent/mark-notification-failed' && request.method === 'POST') {
      return handleLocalAgentMarkFailed(request, env);
    }

    return json({ error: 'Not found' }, 404);
  },
};

/* ══════════════════════════════════════════════════════════
   POST /create-payment
══════════════════════════════════════════════════════════ */
async function handleCreatePayment(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { orderNumber } = body;
  if (!orderNumber) return json({ error: 'orderNumber required' }, 400);

  /* 1. Buscar pedido no Supabase */
  const orders = await sbGet(env, 'orders',
    `order_number=eq.${encodeURIComponent(orderNumber)}&select=*`);
  if (!orders?.length) return json({ error: 'Order not found' }, 404);
  const order = orders[0];

  /* 2. Montar itens InfinitePay (preços em centavos, inteiros) */
  const rawItems = Array.isArray(order.items) ? order.items : [];

  let ipItems = rawItems
    .map(i => ({
      quantity:    1,
      price:       Math.round((Number(i.total) || 0) * 100),
      description: String(i.name || 'Produto').substring(0, 60),
    }))
    .filter(i => i.price > 1);

  if (!ipItems.length) {
    const fallbackCents = Math.round((Number(order.total) || 0) * 100);
    if (fallbackCents > 1) {
      ipItems = [{ quantity: 1, price: fallbackCents, description: 'Pedido Day Lanches' }];
    }
  }

  const freightCents = Math.round((Number(order.delivery_fee) || 0) * 100);
  if (freightCents > 1) {
    ipItems.push({ quantity: 1, price: freightCents, description: 'Frete' });
  }

  const totalCents = ipItems.reduce((s, i) => s + i.price * i.quantity, 0);
  if (totalCents <= 1) {
    return json({ error: 'Valor mínimo para pagamento online é R$ 2,00', minValue: true }, 422);
  }

  /* 3. Chamar InfinitePay */
  const siteUrl    = env.SITE_URL    || 'https://www.daylanches.com.br';
  const webhookUrl = env.WEBHOOK_URL || 'https://api.daylanches.com.br/infinitepay/webhook';

  const ipPayload = {
    handle:       env.INFINITEPAY_HANDLE,
    redirect_url: `${siteUrl}/obrigado.html?pedido=${encodeURIComponent(orderNumber)}`,
    webhook_url:  webhookUrl,
    order_nsu:    orderNumber,
    items:        ipItems,
  };

  const ipRes = await fetch('https://api.checkout.infinitepay.io/links', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(ipPayload),
  });

  if (!ipRes.ok) {
    const detail = await ipRes.text().catch(() => '');
    console.error('[DayLanches] InfinitePay error', ipRes.status, detail);
    return json({ error: 'Falha ao criar checkout', detail }, 502);
  }

  const ipData      = await ipRes.json();
  const checkoutUrl = ipData.url || ipData.payment_url || ipData.link
                    || ipData.checkout_url || ipData.short_url || ipData.payment_link;

  if (!checkoutUrl) {
    return json({ error: 'URL de checkout não retornada', detail: ipData }, 502);
  }

  /* 4. Atualizar pedido no Supabase */
  await sbPatch(env, 'orders',
    `order_number=eq.${encodeURIComponent(orderNumber)}`, {
      payment_status:   'checkout_criado',
      payment_provider: 'infinitepay',
      payment_url:      checkoutUrl,
      status:           'aguardando_pagamento',
      updated_at:       new Date().toISOString(),
    });

  return json({ checkoutUrl });
}

/* ══════════════════════════════════════════════════════════
   POST /infinitepay/webhook
══════════════════════════════════════════════════════════ */
async function handleWebhook(request, env) {
  let payload;
  try { payload = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const orderNsu = payload.order_nsu || payload.order?.order_nsu || payload.nsu || null;

  if (!orderNsu) {
    console.warn('[DayLanches] Webhook sem order_nsu:', JSON.stringify(payload));
    return json({ ok: true });
  }

  /* Buscar pedido completo para enviar WhatsApp depois */
  const orders = await sbGet(env, 'orders',
    `order_number=eq.${encodeURIComponent(orderNsu)}&select=*`);

  if (!orders?.length) {
    console.warn('[DayLanches] Webhook: pedido não encontrado:', orderNsu);
    return json({ error: 'Order not found' }, 404);
  }

  const order     = orders[0];
  const orderId   = order.id;
  const paidCents = Number(payload.paid_amount || payload.amount || 0);
  const paidBRL   = paidCents > 0 ? paidCents / 100 : null;

  /* 1) Confirmar pagamento no banco — operação crítica. Isso sempre precisa
     acontecer e ser reportado à InfinitePay independente do que rolar com
     a notificação de WhatsApp depois. */
  const patchRes = await sbPatch(env, 'orders', `id=eq.${orderId}`, {
    payment_status:   'pago',
    status:           'novo',
    paid_amount:      paidBRL,
    capture_method:   payload.capture_method  || null,
    transaction_nsu:  payload.transaction_nsu || null,
    receipt_url:      payload.receipt_url     || null,
    paid_at:          new Date().toISOString(),
    updated_at:       new Date().toISOString(),
  });

  if (!patchRes.ok) {
    const detail = await patchRes.text().catch(() => '');
    console.error('[DayLanches] Webhook: falha ao confirmar pagamento:', patchRes.status, detail);
    return json({ error: 'Falha ao confirmar pagamento' }, 500);
  }

  /* 2) Notificar o cliente é best-effort — uma falha aqui (Evolution fora do
     ar, telefone inválido, etc.) nunca desfaz nem impede a confirmação do
     pagamento acima, que já foi salva e já será respondida como sucesso. */
  try {
    await dispatchOrderNotification(orderId, 'pagamento_confirmado', env);
  } catch (err) {
    console.error('[DayLanches] Webhook: falha ao notificar pagamento confirmado:', err);
  }

  return json({ ok: true });
}

/* ══════════════════════════════════════════════════════════
   GET /order-tracking?token=TOKEN  (página acompanhar.html)
══════════════════════════════════════════════════════════ */
async function handleOrderTracking(url, env) {
  const token = url.searchParams.get('token');
  if (!token) return json({ error: 'token required' }, 400);

  const orders = await sbGet(env, 'orders',
    `tracking_token=eq.${encodeURIComponent(token)}&select=order_number,status,payment_status,total,delivery_fee,created_at,items,delivery_type`);

  if (!orders?.length) return json({ error: 'Pedido não encontrado' }, 404);
  const o = orders[0];

  /* Retorna apenas dados seguros — sem telefone, endereço ou dados internos */
  const items = Array.isArray(o.items) ? o.items : [];
  return json({
    order_number:   o.order_number,
    status:         o.status,
    payment_status: o.payment_status,
    total:          o.total,
    delivery_fee:   o.delivery_fee,
    delivery_type:  o.delivery_type,
    created_at:     o.created_at,
    items_summary:  items.map(i => ({ name: i.name, qty: i.qty, total: i.total })),
  });
}

/* ══════════════════════════════════════════════════════════
   GET /reverse-geocode?lat=&lon=  → endereço escrito a partir de coordenadas
══════════════════════════════════════════════════════════ */
const BR_STATE_ABBR = {
  'acre':'AC','alagoas':'AL','amapá':'AP','amapa':'AP','amazonas':'AM','bahia':'BA','ceará':'CE','ceara':'CE',
  'distrito federal':'DF','espírito santo':'ES','espirito santo':'ES','goiás':'GO','goias':'GO','maranhão':'MA','maranhao':'MA',
  'mato grosso':'MT','mato grosso do sul':'MS','minas gerais':'MG','pará':'PA','para':'PA','paraíba':'PB','paraiba':'PB',
  'paraná':'PR','parana':'PR','pernambuco':'PE','piauí':'PI','piaui':'PI','rio de janeiro':'RJ','rio grande do norte':'RN',
  'rio grande do sul':'RS','rondônia':'RO','rondonia':'RO','roraima':'RR','santa catarina':'SC','são paulo':'SP','sao paulo':'SP',
  'sergipe':'SE','tocantins':'TO',
};

function formatAddressFromNominatim(addr) {
  if (!addr) return null;

  const street = addr.road || addr.pedestrian || addr.street || '';
  const neighbourhood = addr.suburb || addr.neighbourhood || addr.quarter || '';
  const city = addr.city || addr.town || addr.village || addr.municipality || '';
  const stateName = String(addr.state || '').toLowerCase();
  const stateAbbr = BR_STATE_ABBR[stateName] || addr.state || '';

  const parts = [];
  if (street) parts.push(street);
  if (neighbourhood) parts.push(neighbourhood);
  if (city) parts.push(stateAbbr ? `${city} - ${stateAbbr}` : city);
  else if (stateAbbr) parts.push(stateAbbr);

  return parts.length ? parts.join(', ') : null;
}

async function handleReverseGeocode(url, env) {
  const lat = url.searchParams.get('lat');
  const lon = url.searchParams.get('lon');

  if (!lat || !lon) return json({ error: 'lat e lon são obrigatórios' }, 400);

  try {
    const geoUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&addressdetails=1&accept-language=pt-BR`;
    const res = await fetch(geoUrl, {
      headers: { 'User-Agent': 'DayLanchesApp/1.0 (contato@daylanches.com.br)' },
    });

    if (!res.ok) return json({ address: null });

    const data = await res.json();
    const address = formatAddressFromNominatim(data.address);

    return json({ address: address || null, raw: data.address || {} });
  } catch (err) {
    console.error('[DayLanches] Erro no reverse geocode:', err);
    return json({ address: null });
  }
}

/* ══════════════════════════════════════════════════════════
   PRINT AGENT — Impressão automática de comandas
══════════════════════════════════════════════════════════ */

function validatePrintAgentToken(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token || !env.PRINT_AGENT_TOKEN || token !== env.PRINT_AGENT_TOKEN) {
    return false;
  }
  return true;
}

/* Autenticação de /print-agent/* — aceita o token mestre (uso interno/testes)
   OU um device token emitido via ativação por código. NUNCA usada por
   /local-agent/*, que continua isolada com validatePrintAgentToken() acima —
   um device token de impressora não deve funcionar nas rotas do WhatsApp. */
async function validatePrintAgentDeviceAuth(request, env) {
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return false;

  if (env.PRINT_AGENT_TOKEN && token === env.PRINT_AGENT_TOKEN) return true;

  try {
    const tokenHash = await sha256Hex(token);
    const devices = await sbGet(
      env,
      'print_agent_devices',
      `device_token_hash=eq.${tokenHash}&revoked_at=is.null&select=id`
    );
    if (!Array.isArray(devices) || !devices.length) return false;

    /* Best-effort — não bloqueia a requisição se a atualização falhar */
    sbPatch(env, 'print_agent_devices', `id=eq.${devices[0].id}`, {
      last_seen_at: new Date().toISOString(),
    }).catch(() => {});

    return true;
  } catch (err) {
    console.error('[DayLanches] Erro ao validar device token:', err);
    return false;
  }
}

/* GET /print-agent/health */
async function handlePrintAgentHealth(request, env) {
  if (!(await validatePrintAgentDeviceAuth(request, env))) {
    return json({ error: 'Unauthorized' }, 401);
  }
  return json({ ok: true, service: 'day-lanches-print-agent' });
}

/* GET /print-agent/pending-orders
   Devolve dois tipos de pedido:
   1) nunca impressos (printed_at is null) — comanda inteira, como sempre.
   2) mesas de Balcão já impressas mas com itens novos anexados depois
      (items.length > printed_items_count) — só o "delta" de itens novos,
      marcado com is_addition:true, pra virar um aviso "ADICIONAL — MESA N"
      em vez de reimprimir a comanda toda (evita duplicar itens na cozinha). */
async function handlePrintAgentPendingOrders(request, env) {
  if (!(await validatePrintAgentDeviceAuth(request, env))) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const fields = [
      'id', 'order_number', 'created_at', 'customer_name', 'customer_phone',
      'delivery_type', 'order_source', 'table_number', 'payment_method',
      'payment_status', 'paid_at', 'status', 'subtotal', 'delivery_fee', 'total', 'items', 'notes',
      'customer_address_text', 'location', 'printed_at', 'printed_items_count',
    ].join(',');

    const paramsFull = `select=${fields}&printed_at=is.null&status=neq.cancelado&order=created_at.asc&limit=10`;
    const fullOrders = await sbGet(env, 'orders', paramsFull);

    /* Sem filtro de payment_status: mesmo se a mesa foi paga rápido demais
       entre o "adicionar item" e o próximo poll, o delta ainda tem que
       chegar na cozinha — só some da lista quando for de fato impresso. */
    const paramsAdd = `select=${fields}&printed_at=not.is.null&order_source=eq.balcao&table_number=not.is.null&status=neq.cancelado&order=created_at.asc&limit=10`;
    const addCandidates = await sbGet(env, 'orders', paramsAdd);

    const additions = (Array.isArray(addCandidates) ? addCandidates : [])
      .filter(o => Array.isArray(o.items) && o.items.length > (o.printed_items_count || 0))
      .map(o => ({
        ...o,
        printed_items_count_before: o.printed_items_count || 0,
        items: o.items.slice(o.printed_items_count || 0),
        is_addition: true,
      }));

    const orders = [...(Array.isArray(fullOrders) ? fullOrders : []), ...additions];

    return json({ orders });
  } catch (err) {
    console.error('[DayLanches] Erro ao buscar pedidos pendentes:', err);
    return json({ error: 'Erro interno ao buscar pedidos' }, 500);
  }
}

/* POST /print-agent/mark-printed
   printed_up_to (opcional): até qual índice do array `items` o Print Agent
   efetivamente imprimiu — evita marcar como impresso um item que a Dayane
   adicionou pela tela entre o Print Agent buscar os pedidos pendentes e
   confirmar a impressão. Sem esse campo (Print Agent antigo, ainda não
   atualizado), cai no comportamento anterior: usa o total atual de itens. */
async function handlePrintAgentMarkPrinted(request, env) {
  if (!(await validatePrintAgentDeviceAuth(request, env))) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { order_id, printed_up_to } = body;
  if (!order_id) return json({ error: 'order_id required' }, 400);

  try {
    let newCount = printed_up_to;
    if (newCount == null) {
      const rows = await sbGet(env, 'orders', `id=eq.${order_id}&select=items`);
      newCount = Array.isArray(rows?.[0]?.items) ? rows[0].items.length : 0;
    }

    const res = await sbPatch(env, 'orders', `id=eq.${order_id}`, {
      printed_at: new Date().toISOString(),
      printed_items_count: newCount,
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[DayLanches] Erro ao marcar impresso:', res.status, detail);
      return json({ error: 'Erro ao atualizar pedido' }, 500);
    }

    /* Registrar no audit_logs */
    try {
      const orders = await sbGet(env, 'orders', `id=eq.${order_id}&select=order_number`);
      const orderNum = orders?.[0]?.order_number || order_id;
      await fetch(`${env.SUPABASE_URL}/rest/v1/audit_logs`, {
        method: 'POST',
        headers: { ...sbHeaders(env), Prefer: 'return=minimal' },
        body: JSON.stringify({
          actor_name: 'Print Agent',
          action: 'auto_print_order',
          entity_type: 'order',
          entity_id: order_id,
          entity_label: `#${orderNum}`,
          metadata: {},
        }),
      });
    } catch (_) { /* não bloqueia o fluxo */ }

    return json({ success: true });
  } catch (err) {
    console.error('[DayLanches] Erro ao marcar impresso:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}

/* POST /print-agent/activate — troca um codigo de ativacao curto por um
   device token proprio daquele computador. Sem Authorization: e a unica
   rota deste grupo que nao exige um token previo, ja que o codigo em si
   e o que autentica esta chamada especifica.

   Toda a logica sensivel (rate limit, validacao do codigo, geracao do
   token, marcar o codigo como usado) roda numa unica transacao no
   Postgres via RPC — nunca aqui em varias chamadas REST separadas. */
async function handlePrintAgentActivate(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ success: false, error: 'invalid_body' }, 400); }

  const code = String(body?.code || '').trim();
  if (!code) return json({ success: false, error: 'code_required' }, 400);

  /* Opcional: o proprio computador pode sugerir um nome (ex: hostname do
     Windows) pra facilitar identificar na lista "Computadores autorizados"
     da Gestao. Se nao vier nada, fica o rotulo definido na geracao do codigo. */
  const deviceLabel = body?.deviceLabel ? String(body.deviceLabel).trim().slice(0, 80) : null;

  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';

  try {
    const { ok, data } = await sbRpc(env, 'activate_print_agent_device', {
      input_code: code,
      input_ip: clientIp,
      input_device_label: deviceLabel,
    });

    if (!ok || !Array.isArray(data) || !data.length) {
      console.error('[DayLanches] Falha ao chamar activate_print_agent_device', ok, data);
      return json({ success: false, error: 'internal_error' }, 500);
    }

    const { device_token, error_code } = data[0];

    if (error_code === 'rate_limited') return json({ success: false, error: 'rate_limited' }, 429);
    if (error_code === 'expired')      return json({ success: false, error: 'expired' }, 410);
    if (error_code === 'invalid')      return json({ success: false, error: 'invalid' }, 401);
    if (error_code)                    return json({ success: false, error: error_code }, 400);

    /* device_token so existe aqui, nesta resposta, uma unica vez —
       o banco guarda so o hash a partir de agora. */
    return json({ success: true, deviceToken: device_token });
  } catch (err) {
    console.error('[DayLanches] Erro na ativacao do print agent:', err);
    return json({ success: false, error: 'internal_error' }, 500);
  }
}

/* ══════════════════════════════════════════════════════════
   POST /order-status-notification — envia WhatsApp ao cliente
══════════════════════════════════════════════════════════ */
const NOTIFICATION_MESSAGES = {
  pagamento_confirmado: (name, num, link) => `Olá, ${name}! ✅\n\nPagamento do pedido ${num} confirmado.\n\nRecebemos seu pedido e ele já foi enviado para a Day Lanches. 🍔\n\nVocê pode acompanhar seu pedido por aqui:\n${link}\n\nDay Lanches`,
  em_preparo: (name, num, link) => `Olá, ${name}! 👋\n\nSeu pedido ${num} está em preparação. 🍔\n\nEstamos preparando tudo para você.\n\nAcompanhe seu pedido:\n${link}\n\nDay Lanches`,
  saiu_para_entrega: (name, num, link) => `Olá, ${name}! 🛵\n\nSeu pedido ${num} saiu para entrega.\n\nEm breve ele estará com você.\n\nAcompanhe seu pedido:\n${link}\n\nDay Lanches`,
  pronto: (name, num, link) => `Olá, ${name}! ✅\n\nSeu pedido ${num} está pronto para retirada.\n\nAcompanhe por aqui:\n${link}\n\nDay Lanches`,
  finalizado: (name, num, link) => `Olá, ${name}! ✅\n\nSeu pedido ${num} foi finalizado.\n\nDay Lanches`,
  cancelado: (name, num, link, reason) => `Olá, ${name}.\n\nSeu pedido ${num} foi cancelado.\n${reason ? `\nMotivo:\n${reason}\n` : ''}\nDay Lanches`,
};

const NOTIFIED_FIELD = {
  pagamento_confirmado: 'notified_payment_confirmed_at',
  em_preparo: 'notified_preparing_at',
  saiu_para_entrega: 'notified_out_for_delivery_at',
  pronto: 'notified_ready_at',
  cancelado: 'notified_cancelled_at',
};

/* Regras de negócio por status: quando o status não fizer sentido pro tipo
   de pedido, pula o envio sem erro (evita, por exemplo, mandar "saiu para
   entrega" pra uma mesa ou retirada — o botão de status na Gestão é o
   mesmo pra todos os tipos de pedido, então essa checagem tem que ficar
   aqui, não na UI). */
function notificationAllowedForOrder(newStatus, order) {
  if (newStatus === 'saiu_para_entrega' && order.delivery_type !== 'delivery') {
    return false;
  }
  return true;
}

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('55') && digits.length >= 12) return digits;
  if (digits.length >= 10) return '55' + digits;
  return null;
}

async function sendWhatsAppMessage(phone, message, env) {
  if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY || !env.EVOLUTION_INSTANCE) {
    console.warn('[DayLanches] Evolution API não configurada');
    return { sent: false, reason: 'not_configured' };
  }
  try {
    const res = await fetch(`${env.EVOLUTION_API_URL}/message/sendText/${env.EVOLUTION_INSTANCE}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: env.EVOLUTION_API_KEY },
      body: JSON.stringify({ number: phone, text: message }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[DayLanches] Evolution API erro:', res.status, detail);
      return { sent: false, reason: 'api_error', status: res.status };
    }
    return { sent: true };
  } catch (err) {
    console.error('[DayLanches] Evolution API falha:', err);
    return { sent: false, reason: 'fetch_error' };
  }
}

/* Fonte única do envio de notificação de status por WhatsApp — usada tanto
   por /order-status-notification (Gestão, clique de status) quanto pelo
   webhook da InfinitePay (pagamento confirmado), chamada direto em
   processo, sem o Worker fazer uma requisição HTTP pra ele mesmo.

   Proteção contra duplicidade em duas camadas:
   1) notified_<status>_at em orders — checado ANTES de tentar (evita
      trabalho desnecessário no caso comum).
   2) o INSERT em order_notifications só "ganha o direito" de processar a
      notificação se realmente for aceito pelo banco — o índice único
      parcial (order_id, status) WHERE status_send IN ('pendente','enviado')
      já existente (add_local_agent_notifications.sql) rejeita com 409 uma
      segunda tentativa concorrente pro mesmo (order_id, status). Só quem
      recebeu 409 desiste; só quem conseguiu inserir de fato envia a
      mensagem. Isso cobre o caso de dois webhooks/cliques chegando quase
      ao mesmo tempo — a checagem em (1) sozinha não seria suficiente
      porque as duas tentativas concorrentes passariam por ela antes que
      qualquer uma tivesse terminado de gravar o notified_<status>_at. */
async function dispatchOrderNotification(orderId, newStatus, env, opts = {}) {
  const msgBuilder = NOTIFICATION_MESSAGES[newStatus];
  if (!msgBuilder) return { ok: true, sent: false, reason: 'status_without_notification' };

  const notifiedField = NOTIFIED_FIELD[newStatus];

  const orders = await sbGet(env, 'orders',
    `id=eq.${orderId}&select=order_number,customer_name,customer_phone,tracking_token,delivery_type,${notifiedField || 'id'},cancel_reason`);
  if (!orders?.length) return { ok: false, sent: false, reason: 'order_not_found' };
  const order = orders[0];

  if (notifiedField && order[notifiedField]) {
    return { ok: true, sent: false, reason: 'already_notified' };
  }

  if (!notificationAllowedForOrder(newStatus, order)) {
    return { ok: true, sent: false, reason: 'not_applicable_for_order_type' };
  }

  const phone = normalizePhone(order.customer_phone);
  if (!phone) return { ok: true, sent: false, reason: 'no_phone' };

  const num = order.order_number || orderId.slice(0, 8);
  const name = order.customer_name || 'cliente';
  const siteUrl = env.SITE_URL || 'https://www.daylanches.com.br';
  const link = order.tracking_token ? `${siteUrl}/acompanhar.html?token=${order.tracking_token}` : siteUrl;
  const reason = opts.cancelReason || order.cancel_reason || '';

  const message = msgBuilder(name, `#${num}`, link, reason);

  const insertRes = await sbPost(env, 'order_notifications', {
    order_id: orderId,
    order_number: num,
    customer_name: name,
    customer_phone: phone,
    status: newStatus,
    message,
    tracking_link: link,
    channel: 'whatsapp_local',
    status_send: 'pendente',
  });

  if (!insertRes.ok) {
    if (insertRes.status === 409) {
      /* Outra tentativa concorrente já ganhou o direito de notificar este
         (order_id, status) — não é erro, é a proteção funcionando. */
      return { ok: true, sent: false, reason: 'already_notified' };
    }
    const detail = await insertRes.text().catch(() => '');
    console.error('[DayLanches] Erro ao criar order_notification:', insertRes.status, detail);
    return { ok: false, sent: false, reason: 'notification_insert_failed' };
  }

  const patchFilter = `order_id=eq.${orderId}&status=eq.${newStatus}&status_send=eq.pendente`;
  const hasEvolution = !!(env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY && env.EVOLUTION_INSTANCE);
  let result = { sent: false, reason: 'queued_for_local_agent' };

  if (hasEvolution) {
    result = await sendWhatsAppMessage(phone, message, env);
    const now = new Date().toISOString();

    if (result.sent) {
      await sbPatch(env, 'order_notifications', patchFilter,
        { status_send: 'enviado', sent_at: now, updated_at: now });
    } else {
      /* Nunca deixar como "enviado" se a Evolution respondeu erro. */
      await sbPatch(env, 'order_notifications', patchFilter,
        { status_send: 'falhou', failed_at: now, error_message: result.reason || 'erro desconhecido', updated_at: now });
    }
  }

  if (notifiedField && result.sent) {
    await sbPatch(env, 'orders', `id=eq.${orderId}`, { [notifiedField]: new Date().toISOString() });
  }

  const auditAction = result.sent
    ? 'order_notification_sent'
    : (hasEvolution ? 'order_notification_failed' : 'order_notification_queued');

  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: { ...sbHeaders(env), Prefer: 'return=minimal' },
      body: JSON.stringify({
        actor_name: 'Sistema',
        action: auditAction,
        entity_type: 'order',
        entity_id: orderId,
        entity_label: `#${num}`,
        source: 'worker',
        metadata: { status: newStatus, phone, channel: hasEvolution ? 'whatsapp_qr' : 'whatsapp_local', sent: result.sent, reason: result.reason || null },
      }),
    });
  } catch (_) {}

  return { ok: true, sent: result.sent, reason: result.reason || null };
}

async function handleOrderStatusNotification(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { order_id, new_status, cancel_reason } = body;
  if (!order_id || !new_status) return json({ error: 'order_id e new_status obrigatórios' }, 400);

  try {
    const result = await dispatchOrderNotification(order_id, new_status, env, { cancelReason: cancel_reason });
    if (!result.ok) {
      const status = result.reason === 'order_not_found' ? 404 : 500;
      return json({ error: result.reason || 'Erro interno' }, status);
    }
    return json({ ok: true, sent: result.sent, reason: result.reason || null });
  } catch (err) {
    console.error('[DayLanches] Erro notificação:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}

/* ══════════════════════════════════════════════════════════
   GET /whatsapp/status — verifica se a Evolution API está configurada e conectada
══════════════════════════════════════════════════════════ */
async function handleWhatsAppStatus(env) {
  const configured = !!(env.EVOLUTION_API_URL && env.EVOLUTION_API_KEY && env.EVOLUTION_INSTANCE);
  if (!configured) {
    return json({ configured: false, instance: null, state: 'not_configured' });
  }

  try {
    const res = await fetch(`${env.EVOLUTION_API_URL}/instance/connectionState/${env.EVOLUTION_INSTANCE}`, {
      headers: { apikey: env.EVOLUTION_API_KEY },
    });
    if (!res.ok) {
      return json({ configured: true, instance: env.EVOLUTION_INSTANCE, state: 'unknown', error: `HTTP ${res.status}` });
    }
    const data = await res.json();
    const state = data.instance?.state || data.state || 'unknown';
    return json({ configured: true, instance: env.EVOLUTION_INSTANCE, state });
  } catch (err) {
    console.error('[DayLanches] WhatsApp status erro:', err);
    return json({ configured: true, instance: env.EVOLUTION_INSTANCE, state: 'error', error: err.message });
  }
}

/* ══════════════════════════════════════════════════════════
   GET /whatsapp/qrcode — gera QR Code para conectar instância
══════════════════════════════════════════════════════════ */
async function handleWhatsAppQRCode(env) {
  if (!env.EVOLUTION_API_URL || !env.EVOLUTION_API_KEY || !env.EVOLUTION_INSTANCE) {
    return json({ error: 'Evolution API não configurada' }, 400);
  }

  try {
    const res = await fetch(`${env.EVOLUTION_API_URL}/instance/connect/${env.EVOLUTION_INSTANCE}`, {
      headers: { apikey: env.EVOLUTION_API_KEY },
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return json({ error: 'Falha ao gerar QR Code', status: res.status, detail }, 502);
    }
    const data = await res.json();

    /* Conexao e somente por QR Code — nunca repassar data.code (payload bruto usado
       para desenhar o QR) nem data.pairingCode para a interface da Gestao. */
    return json({
      qrcode: data.base64 || data.qrcode?.base64 || null,
      instance: env.EVOLUTION_INSTANCE,
    });
  } catch (err) {
    console.error('[DayLanches] QR Code erro:', err);
    return json({ error: 'Erro ao conectar instância' }, 500);
  }
}

/* ══════════════════════════════════════════════════════════
   POST /whatsapp/test-message — envia mensagem de teste
══════════════════════════════════════════════════════════ */
async function handleWhatsAppTestMessage(request, env) {
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { phone } = body;
  if (!phone) return json({ error: 'phone obrigatório' }, 400);

  const normalized = normalizePhone(phone);
  if (!normalized) return json({ error: 'Telefone inválido' }, 400);

  const message = 'Teste de notificação automática Day Lanches.\n\nSe você recebeu esta mensagem, o WhatsApp automático está conectado corretamente. ✅';
  const result = await sendWhatsAppMessage(normalized, message, env);

  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: { ...sbHeaders(env), Prefer: 'return=minimal' },
      body: JSON.stringify({
        actor_name: 'Gestão',
        action: result.sent ? 'whatsapp_test_sent' : 'whatsapp_test_failed',
        entity_type: 'whatsapp',
        entity_id: normalized,
        entity_label: 'Teste WhatsApp',
        source: 'worker',
        metadata: { phone: normalized, sent: result.sent, reason: result.reason || null },
      }),
    });
  } catch (_) {}

  return json({ ok: true, sent: result.sent, reason: result.reason || null });
}

/* ══════════════════════════════════════════════════════════
   LOCAL AGENT — Polling de notificações para envio local
══════════════════════════════════════════════════════════ */

/* GET /local-agent/pending-notifications */
async function handleLocalAgentPending(request, env) {
  if (!validatePrintAgentToken(request, env)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const params = 'select=id,order_id,order_number,customer_name,customer_phone,status,message,tracking_link,attempts,created_at'
      + '&status_send=eq.pendente&order=created_at.asc&limit=20';
    const notifications = await sbGet(env, 'order_notifications', params);
    return json({ notifications: Array.isArray(notifications) ? notifications : [] });
  } catch (err) {
    console.error('[DayLanches] Erro ao buscar notificações pendentes:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}

/* POST /local-agent/mark-notification-sent */
async function handleLocalAgentMarkSent(request, env) {
  if (!validatePrintAgentToken(request, env)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { notification_id } = body;
  if (!notification_id) return json({ error: 'notification_id required' }, 400);

  try {
    const now = new Date().toISOString();
    await sbPatch(env, 'order_notifications', `id=eq.${notification_id}`, {
      status_send: 'enviado',
      sent_at: now,
      updated_at: now,
    });

    /* Atualizar notified_*_at no pedido para evitar duplicidade */
    const notifs = await sbGet(env, 'order_notifications', `id=eq.${notification_id}&select=order_id,status`);
    if (notifs?.length) {
      const { order_id, status } = notifs[0];
      const field = NOTIFIED_FIELD[status];
      if (field) {
        await sbPatch(env, 'orders', `id=eq.${order_id}`, { [field]: now });
      }
    }

    return json({ success: true });
  } catch (err) {
    console.error('[DayLanches] Erro ao marcar notificação enviada:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}

/* GET /local-agent/order-status?order_number=DL-XXXXX */
async function handleLocalAgentOrderStatus(request, url, env) {
  if (!validatePrintAgentToken(request, env)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const orderNumber = url.searchParams.get('order_number');
  if (!orderNumber) return json({ error: 'order_number required' }, 400);

  try {
    const orders = await sbGet(env, 'orders',
      `order_number=eq.${encodeURIComponent(orderNumber)}&select=order_number,status,created_at`);

    if (!orders?.length) return json({ error: 'Pedido nao encontrado' }, 404);

    const o = orders[0];
    return json({ order_number: o.order_number, status: o.status, created_at: o.created_at });
  } catch (err) {
    console.error('[DayLanches] Erro ao buscar status do pedido:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}

/* POST /local-agent/mark-notification-failed */
async function handleLocalAgentMarkFailed(request, env) {
  if (!validatePrintAgentToken(request, env)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { notification_id, error_message } = body;
  if (!notification_id) return json({ error: 'notification_id required' }, 400);

  try {
    const notifs = await sbGet(env, 'order_notifications', `id=eq.${notification_id}&select=attempts`);
    const currentAttempts = notifs?.[0]?.attempts || 0;
    const newAttempts = currentAttempts + 1;
    const now = new Date().toISOString();

    await sbPatch(env, 'order_notifications', `id=eq.${notification_id}`, {
      attempts: newAttempts,
      failed_at: now,
      error_message: error_message || 'Erro desconhecido',
      status_send: newAttempts >= 3 ? 'falhou' : 'pendente',
      updated_at: now,
    });

    return json({ success: true, attempts: newAttempts, gave_up: newAttempts >= 3 });
  } catch (err) {
    console.error('[DayLanches] Erro ao marcar notificação falha:', err);
    return json({ error: 'Erro interno' }, 500);
  }
}
