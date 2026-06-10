'use strict';
/* ─────────────────────────────────────────────────────────
   Day Lanches — Cloudflare Worker
   Rotas:
     POST /create-payment            → cria checkout InfinitePay
     POST /infinitepay/webhook       → confirma pagamento e envia WhatsApp ao cliente
     POST /send-order-whatsapp       → reenvio manual de WhatsApp (gestão)
     GET  /order-tracking?token=     → dados públicos do pedido (página acompanhar)
     GET  /whatsapp/webhook          → verificação de webhook Meta WhatsApp Cloud API
     POST /whatsapp/webhook          → recebe eventos WhatsApp Cloud API
     GET  /health                    → health check
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

    if (pathname === '/send-order-whatsapp' && request.method === 'POST') {
      return handleSendWhatsApp(request, env);
    }

    if (pathname === '/order-tracking' && request.method === 'GET') {
      return handleOrderTracking(url, env);
    }

    if (pathname === '/whatsapp/webhook' && request.method === 'GET') {
      return handleWhatsAppVerify(url, env);
    }

    if (pathname === '/whatsapp/webhook' && request.method === 'POST') {
      return handleWhatsAppEvent(request);
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

  /* Enviar WhatsApp automático ao cliente (não bloqueia a resposta ao webhook) */
  const fullOrder = { ...order, payment_status: 'pago' };
  sendWhatsAppOrderConfirmation(env, fullOrder, orderId).catch(err =>
    console.error('[DayLanches] WhatsApp automático falhou silenciosamente:', err)
  );

  return json({ ok: true });
}

/* ══════════════════════════════════════════════════════════
   POST /send-order-whatsapp  (reenvio manual pela gestão)
══════════════════════════════════════════════════════════ */
async function handleSendWhatsApp(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { orderId } = body;
  if (!orderId) return json({ error: 'orderId required' }, 400);

  const orders = await sbGet(env, 'orders', `id=eq.${orderId}&select=*`);
  if (!orders?.length) return json({ error: 'Order not found' }, 404);
  const order = orders[0];

  try {
    await sendWhatsAppOrderConfirmation(env, order, orderId, /* forceResend */ true);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message }, 502);
  }
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
   GET /whatsapp/webhook  (verificação Meta)
══════════════════════════════════════════════════════════ */
function handleWhatsAppVerify(url, env) {
  const mode      = url.searchParams.get('hub.mode');
  const token     = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }

  return new Response('Forbidden', { status: 403 });
}

/* ══════════════════════════════════════════════════════════
   POST /whatsapp/webhook  (eventos Meta)
══════════════════════════════════════════════════════════ */
async function handleWhatsAppEvent(request) {
  let body;
  try { body = await request.json(); }
  catch { return new Response('OK', { status: 200 }); }

  console.log('WhatsApp webhook:', JSON.stringify(body));
  return new Response('OK', { status: 200 });
}

/* ══════════════════════════════════════════════════════════
   FUNÇÃO: enviar WhatsApp ao cliente via Cloud API
══════════════════════════════════════════════════════════ */
async function sendWhatsAppOrderConfirmation(env, order, orderId, forceResend = false) {
  /* Verificações */
  if (!env.WHATSAPP_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) return; /* não configurado */
  if (!order.customer_phone) return;
  if (!order.whatsapp_opt_in) return;
  if (order.customer_notified_at && !forceResend) return; /* já enviado */

  /* Número em E.164 (sem +): garante prefixo 55 */
  const rawPhone = String(order.customer_phone).replace(/\D/g, '');
  const toPhone  = rawPhone.startsWith('55') ? rawPhone : '55' + rawPhone;

  const siteUrl     = env.SITE_URL    || 'https://www.daylanches.com.br';
  const trackingUrl = order.tracking_token
    ? `${siteUrl}/acompanhar.html?token=${order.tracking_token}`
    : siteUrl;

  const templateName = env.WHATSAPP_TEMPLATE_NAME || 'pedido_recebido';
  const languageCode = env.WHATSAPP_LANGUAGE_CODE || 'pt_BR';

  const waPayload = {
    messaging_product: 'whatsapp',
    to:   toPhone,
    type: 'template',
    template: {
      name:     templateName,
      language: { code: languageCode },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: order.customer_name || 'cliente' },
          { type: 'text', text: order.order_number  || '' },
          { type: 'text', text: trackingUrl },
        ],
      }],
    },
  };

  let notifiedAt  = null;
  let notifError  = null;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v20.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method:  'POST',
        headers: {
          Authorization:  `Bearer ${env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(waPayload),
      }
    );
    const text = await res.text();
    if (!res.ok) throw new Error(`WhatsApp API ${res.status}: ${text}`);
    notifiedAt = new Date().toISOString();
  } catch (err) {
    notifError = err.message.substring(0, 300);
    throw err; /* propaga para o caller registrar e decidir */
  } finally {
    /* Atualiza Supabase independente de sucesso ou erro */
    await sbPatch(env, 'orders', `id=eq.${orderId}`, {
      customer_notified_at:         notifiedAt,
      customer_notification_error:  notifError,
      updated_at:                   new Date().toISOString(),
    }).catch(() => {});
  }
}
