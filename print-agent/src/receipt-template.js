function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmt(n) {
  return Number(n || 0).toFixed(2).replace('.', ',');
}

function buildReceiptHtml(order, paperType) {
  const width = paperType === 'A4' ? '210mm' : (paperType === '58mm' ? '58mm' : '80mm');
  const fontSize = paperType === '58mm' ? '11px' : (paperType === 'A4' ? '14px' : '13px');

  const num = order.order_number || (order.id ? order.id.slice(-8).toUpperCase() : '---');
  const dateTime = order.created_at ? new Date(order.created_at).toLocaleString('pt-BR') : '---';
  const items = Array.isArray(order.items) ? order.items : [];
  const isBalcao = order.order_source === 'balcao' || order.delivery_type === 'balcao';
  const hasMesa = isBalcao && order.table_number;

  let deliveryTag = 'PEDIDO ONLINE';
  if (isBalcao) deliveryTag = 'PEDIDO PRESENCIAL';
  else if (order.delivery_type === 'pickup') deliveryTag = 'RETIRADA';
  else if (order.delivery_type === 'delivery') deliveryTag = 'ENTREGA';

  const isPaid = ['pago', 'paid', 'confirmado', 'confirmed', 'pagamento_confirmado']
    .includes(String(order.payment_status || '').toLowerCase()) || !!order.paid_at;

  const payMethodLabels = {
    pix: 'PIX', pix_online: 'PIX', card: 'Cartão', card_online: 'Cartão',
    cash: 'Dinheiro', online: 'Online', dinheiro: 'Dinheiro',
    pix_loja: 'Pix na loja', cartao_maquininha: 'Cartão maquininha',
    a_definir: 'A definir',
  };

  let payLabel = payMethodLabels[order.payment_method] || order.payment_method || '---';
  if (order.payment_method === 'a_definir') payLabel = 'A definir';

  const itemsHtml = items.length ? items.map(i => {
    const opts = (i.options || []).map(og =>
      `<div class="r-opt">${esc(og.groupTitle)}: ${(og.items || []).map(oi => esc(oi.name)).join(', ')}</div>`
    ).join('');
    const itemNote = i.notes ? `<div class="r-opt">Obs: ${esc(i.notes)}</div>` : '';
    return `<div class="r-item">${i.qty}x ${esc(i.name)}</div>${opts}${itemNote}`;
  }).join('') : '<div>---</div>';

  let locationHtml = '';
  if (!isBalcao && order.delivery_type !== 'pickup') {
    if (order.customer_address_text) {
      locationHtml = `<div class="r-section">
        <div class="r-label">ENDEREÇO</div>
        <div class="r-val">${esc(order.customer_address_text).replace(/\n/g, '<br>')}</div>
      </div>`;
    } else if (order.location) {
      locationHtml = `<div class="r-section">
        <div class="r-label">LOCALIZAÇÃO</div>
        <div class="r-val">Localização aproximada enviada pelo cliente.<br>Consultar mapa na Gestão.</div>
      </div>`;
    }
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: ${fontSize};
    color: #000;
    background: #fff;
    width: ${width};
    ${paperType === 'A4' ? 'max-width: 210mm; margin: 0 auto; padding: 15mm;' : 'padding: 4mm;'}
  }
  .r-header {
    text-align: center;
    border-bottom: 2px solid #000;
    padding-bottom: 8px;
    margin-bottom: 8px;
  }
  .r-brand { font-size: 1.6em; font-weight: 900; text-transform: uppercase; letter-spacing: .08em; }
  .r-sub { font-size: .7em; font-weight: 700; text-transform: uppercase; letter-spacing: .15em; margin-top: 2px; }
  .r-section { border-top: 1px dashed #000; padding: 6px 0; }
  .r-row { display: flex; justify-content: space-between; gap: 4px; }
  .r-row > div { flex: 1; }
  .r-label { font-size: .7em; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #555; }
  .r-val { font-weight: 700; margin-top: 1px; }
  .r-tag {
    text-align: center; font-weight: 900; font-size: 1.1em;
    text-transform: uppercase; letter-spacing: .1em;
    background: #000; color: #fff;
    padding: 6px; margin: 4px 0;
  }
  .r-mesa { background: #1D4ED8; color: #fff; font-size: 1.3em; margin-top: 4px; }
  .r-seal {
    text-align: center; font-weight: 900; font-size: 1em;
    text-transform: uppercase; padding: 5px; margin: 4px 0;
    border: 2px solid #000;
  }
  .r-seal.paid { background: #16a34a; color: #fff; border-color: #16a34a; }
  .r-seal.pending { background: #DC2626; color: #fff; border-color: #DC2626; }
  .r-total-box {
    text-align: center; background: #000; color: #fff;
    padding: 8px; margin: 4px 0;
  }
  .r-total-label { font-size: .7em; font-weight: 700; text-transform: uppercase; letter-spacing: .12em; }
  .r-total-val { font-size: 1.6em; font-weight: 900; }
  .r-items { padding: 6px 0; }
  .r-item { font-weight: 700; margin-top: 4px; padding-top: 4px; border-top: 1px solid #eee; }
  .r-item:first-child { margin-top: 0; padding-top: 0; border-top: none; }
  .r-opt { margin-left: 10px; font-size: .85em; color: #444; font-weight: 400; }
  .r-footer { text-align: center; border-top: 2px solid #000; padding-top: 8px; margin-top: 8px; }
  .r-tagline { font-size: .75em; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; }
  @media print {
    body { width: ${width}; }
    .r-tag, .r-total-box { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .r-seal.paid, .r-seal.pending { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .r-mesa { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="r-header">
    <div class="r-brand">Day Lanches</div>
    <div class="r-sub">Comanda do pedido</div>
  </div>

  <div class="r-section">
    <div class="r-row">
      <div><span class="r-label">Pedido</span><br><span class="r-val">#${esc(num)}</span></div>
      <div><span class="r-label">Data/Hora</span><br><span class="r-val">${dateTime}</span></div>
    </div>
  </div>

  <div class="r-section">
    <div class="r-label">Cliente</div>
    <div class="r-val">${esc(order.customer_name || '---')}</div>
    ${(!isBalcao && order.customer_phone) ? `<div style="margin-top:2px"><span class="r-label">Telefone</span><br><span class="r-val">${esc(order.customer_phone)}</span></div>` : ''}
  </div>

  <div class="r-section">
    <div class="r-tag">${deliveryTag}</div>
    ${hasMesa ? `<div class="r-tag r-mesa">MESA ${order.table_number}</div>` : ''}
  </div>

  <div class="r-section">
    <div class="r-row">
      <div><span class="r-label">Pagamento</span><br><span class="r-val">${esc(payLabel)}</span></div>
      <div><span class="r-label">Status</span><br><span class="r-val">${isPaid ? 'Pago' : 'Pendente'}</span></div>
    </div>
    <div class="r-seal ${isPaid ? 'paid' : 'pending'}">${isPaid ? 'PAGO' : 'PAGAMENTO PENDENTE'}</div>
  </div>

  <div class="r-section">
    <div class="r-total-box">
      <div class="r-total-label">Total do pedido</div>
      <div class="r-total-val">R$ ${fmt(order.total || 0)}</div>
    </div>
  </div>

  <div class="r-section r-items">
    <div class="r-label">Itens</div>
    ${itemsHtml}
  </div>

  ${order.notes ? `<div class="r-section"><div class="r-label">Observação</div><div class="r-val">${esc(order.notes)}</div></div>` : ''}

  ${locationHtml}

  <div class="r-footer">
    <div class="r-tagline">Day Lanches — sabor que marca</div>
  </div>
</body>
</html>`;
}

function buildTestReceiptHtml(paperType) {
  const width = paperType === 'A4' ? '210mm' : (paperType === '58mm' ? '58mm' : '80mm');
  const fontSize = paperType === '58mm' ? '11px' : (paperType === 'A4' ? '14px' : '13px');
  const now = new Date().toLocaleString('pt-BR');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Arial, sans-serif;
    font-size: ${fontSize};
    color: #000;
    background: #fff;
    width: ${width};
    ${paperType === 'A4' ? 'max-width: 210mm; margin: 0 auto; padding: 15mm;' : 'padding: 4mm;'}
    text-align: center;
  }
  .brand { font-size: 1.8em; font-weight: 900; text-transform: uppercase; margin-bottom: 8px; }
  .title { font-size: 1.2em; font-weight: 700; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 8px; }
  .msg { font-size: 1em; line-height: 1.5; margin: 16px 0; }
  .date { font-size: .85em; color: #666; margin-top: 16px; border-top: 1px dashed #000; padding-top: 8px; }
</style>
</head>
<body>
  <div class="brand">DAY LANCHES</div>
  <div class="title">TESTE DE IMPRESSÃO</div>
  <div class="msg">Se você está vendo esta comanda,<br>a impressora está configurada corretamente.</div>
  <div class="date">${now}</div>
</body>
</html>`;
}

window.buildReceiptHtml = buildReceiptHtml;
window.buildTestReceiptHtml = buildTestReceiptHtml;
