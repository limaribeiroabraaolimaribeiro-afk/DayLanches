'use strict';
/* ─────────────────────────────────────────────────────────
   Day Lanches — Cloudflare Worker
   Rotas:
     POST /create-payment            → cria checkout InfinitePay
     POST /infinitepay/webhook       → confirma pagamento
     GET  /order-tracking?token=     → dados públicos do pedido (página acompanhar)
     GET  /reverse-geocode?lat=&lon= → converte coordenadas em endereço
     GET  /health                    → health check
     GET  /print-agent/health        → health check do Print Agent
     GET  /print-agent/pending-orders → pedidos pendentes de impressão
     POST /print-agent/mark-printed  → marca pedido como impresso
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

  /* Atualizar pagamento */
  await sbPatch(env, 'orders', `id=eq.${orderId}`, {
    payment_status:   'pago',
    status:           'novo',
    paid_amount:      paidBRL,
    capture_method:   payload.capture_method  || null,
    transaction_nsu:  payload.transaction_nsu || null,
    receipt_url:      payload.receipt_url     || null,
    paid_at:          new Date().toISOString(),
    updated_at:       new Date().toISOString(),
  });

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

/* GET /print-agent/health */
function handlePrintAgentHealth(request, env) {
  if (!validatePrintAgentToken(request, env)) {
    return json({ error: 'Unauthorized' }, 401);
  }
  return json({ ok: true, service: 'day-lanches-print-agent' });
}

/* GET /print-agent/pending-orders */
async function handlePrintAgentPendingOrders(request, env) {
  if (!validatePrintAgentToken(request, env)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  try {
    const fields = [
      'id', 'order_number', 'created_at', 'customer_name', 'customer_phone',
      'delivery_type', 'order_source', 'table_number', 'payment_method',
      'payment_status', 'paid_at', 'status', 'total', 'items', 'notes',
      'customer_address_text', 'location', 'printed_at',
    ].join(',');

    const params = `select=${fields}&printed_at=is.null&status=neq.cancelado&order=created_at.asc&limit=10`;
    const orders = await sbGet(env, 'orders', params);

    return json({ orders: Array.isArray(orders) ? orders : [] });
  } catch (err) {
    console.error('[DayLanches] Erro ao buscar pedidos pendentes:', err);
    return json({ error: 'Erro interno ao buscar pedidos' }, 500);
  }
}

/* POST /print-agent/mark-printed */
async function handlePrintAgentMarkPrinted(request, env) {
  if (!validatePrintAgentToken(request, env)) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { order_id } = body;
  if (!order_id) return json({ error: 'order_id required' }, 400);

  try {
    const res = await sbPatch(env, 'orders', `id=eq.${order_id}`, {
      printed_at: new Date().toISOString(),
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
