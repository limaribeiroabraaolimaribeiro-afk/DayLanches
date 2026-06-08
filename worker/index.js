'use strict';
/* ─────────────────────────────────────────────────────────
   Day Lanches — Cloudflare Worker
   Rotas:
     POST /create-payment       → cria checkout InfinitePay
     POST /infinitepay/webhook  → recebe confirmação de pagamento
     GET  /health               → health check
   ───────────────────────────────────────────────────────── */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
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
    const { pathname } = new URL(request.url);

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

  /* 2. Montar itens InfinitePay */
  const rawItems = Array.isArray(order.items) ? order.items : [];
  let ipItems = rawItems.map(i => ({
    quantity:    i.qty || 1,
    price:       Math.round((i.total || 0) * 100),
    description: (i.name || 'Produto').substring(0, 60),
  })).filter(i => i.price > 0);

  if (!ipItems.length) {
    ipItems = [{ quantity: 1, price: Math.round((order.total || 0) * 100), description: 'Pedido Day Lanches' }];
  }

  if ((order.delivery_fee || 0) > 0) {
    ipItems.push({ quantity: 1, price: Math.round(order.delivery_fee * 100), description: 'Frete' });
  }

  /* 3. Chamar InfinitePay */
  const siteUrl    = env.SITE_URL || 'https://www.daylanches.com.br';
  const workerUrl  = env.WEBHOOK_URL || 'https://api.daylanches.com.br';

  const ipPayload = {
    handle:       env.INFINITEPAY_HANDLE,
    redirect_url: `${siteUrl}/obrigado.html?order=${encodeURIComponent(orderNumber)}`,
    webhook_url:  `${workerUrl}/infinitepay/webhook`,
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

  const ipData     = await ipRes.json();
  const checkoutUrl = ipData.url || ipData.payment_url || ipData.link
                    || ipData.checkout_url || ipData.short_url || ipData.payment_link;

  if (!checkoutUrl) {
    console.error('[DayLanches] InfinitePay sem URL', JSON.stringify(ipData));
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

  /* InfinitePay pode enviar o nsu em diferentes campos */
  const orderNsu = payload.order_nsu
    || payload.order?.order_nsu
    || payload.nsu
    || null;

  if (!orderNsu) {
    console.warn('[DayLanches] Webhook sem order_nsu:', JSON.stringify(payload));
    return json({ ok: true }); /* 200 para evitar retentativas */
  }

  /* Buscar pedido */
  const orders = await sbGet(env, 'orders',
    `order_number=eq.${encodeURIComponent(orderNsu)}&select=id`);

  if (!orders?.length) {
    console.warn('[DayLanches] Webhook: pedido não encontrado:', orderNsu);
    return json({ error: 'Order not found' }, 404);
  }

  const orderId   = orders[0].id;
  /* InfinitePay envia valores em centavos */
  const paidCents = Number(payload.paid_amount || payload.amount || 0);
  const paidBRL   = paidCents > 0 ? paidCents / 100 : null;

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
