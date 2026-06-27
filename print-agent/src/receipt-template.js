function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fmt(n) {
  return Number(n || 0).toFixed(2).replace('.', ',');
}

function buildReceiptHtml(order, paperType) {
  const w = paperType === 'A4' ? '210mm' : (paperType === '58mm' ? '54mm' : '74mm');
  const fs = paperType === '58mm' ? '10px' : (paperType === 'A4' ? '13px' : '12px');
  const pad = paperType === 'A4' ? 'max-width:210mm;margin:0 auto;padding:12mm;' : 'padding:2mm;';

  const num = order.order_number || (order.id ? order.id.slice(-8).toUpperCase() : '---');
  const dateTime = order.created_at ? new Date(order.created_at).toLocaleString('pt-BR') : '---';
  const items = Array.isArray(order.items) ? order.items : [];
  const isBalcao = order.order_source === 'balcao' || order.delivery_type === 'balcao';
  const hasMesa = isBalcao && order.table_number;
  const typeLabel = isBalcao ? 'BALCÃO' : (order.delivery_type === 'pickup' ? 'RETIRADA' : 'ENTREGA');
  const isPaid = ['pago','paid','confirmado','confirmed','pagamento_confirmado'].includes(String(order.payment_status||'').toLowerCase()) || !!order.paid_at;
  const payLabels = { pix:'PIX',pix_online:'PIX',card:'Cartão',card_online:'Cartão',cash:'Dinheiro',online:'Online',dinheiro:'Dinheiro',pix_loja:'Pix na loja',cartao_maquininha:'Cartão maquininha',a_definir:'A definir' };
  const payLabel = payLabels[order.payment_method] || order.payment_method || '---';
  const fee = Number(order.delivery_fee || 0);
  const addressText = order.customer_address_text || (order.location?.address) || '';

  const itemsHtml = items.map(i => {
    const t = i.total || (i.finalUnitPrice||i.unitPrice||0)*(i.qty||1) || 0;
    const opts = (i.options||[]).map(og => `<div class="rc-opt">· ${esc(og.groupTitle)}: ${(og.items||[]).map(oi=>esc(oi.name)).join(', ')}</div>`).join('');
    const note = i.notes ? `<div class="rc-opt">Obs: ${esc(i.notes)}</div>` : '';
    return `<div class="rc-item"><span>${i.qty||1}x ${esc(i.name)}</span><span>R$ ${fmt(t)}</span></div>${opts}${note}`;
  }).join('') || '<div>---</div>';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8">
<style>
  @page { size: ${paperType === 'A4' ? 'A4' : (paperType === '58mm' ? '58mm' : '80mm')} auto; margin: 2mm; }
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Arial,Helvetica,sans-serif;font-size:${fs};color:#000;background:#fff;width:${w};${pad}line-height:1.4}
  .rc-hd{text-align:center;border-bottom:2px solid #000;padding-bottom:4px;margin-bottom:4px}
  .rc-brand{font-size:16px;font-weight:900;text-transform:uppercase;letter-spacing:.06em}
  .rc-sub{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.15em}
  .rc-sep{border:none;border-top:1px dashed #000;margin:4px 0}
  .rc-row{display:flex;justify-content:space-between;gap:4px;font-size:11px}
  .rc-lbl{font-size:9px;font-weight:700;text-transform:uppercase;color:#555;letter-spacing:.04em}
  .rc-val{font-weight:700}
  .rc-type{text-align:center;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;padding:3px 0;border:2px solid #000;margin:4px 0}
  .rc-status{text-align:center;font-size:11px;font-weight:900;text-transform:uppercase;padding:3px 0;border:1px solid #000;margin:3px 0}
  .rc-item{display:flex;justify-content:space-between;padding:2px 0;font-weight:700;font-size:12px}
  .rc-item+.rc-item{border-top:1px dotted #ccc}
  .rc-opt{margin-left:10px;font-size:10px;color:#333;font-weight:400}
  .rc-total{display:flex;justify-content:space-between;font-size:14px;font-weight:900;padding:4px 0}
  .rc-ft{text-align:center;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.03em;color:#555;margin-top:4px}
</style>
</head>
<body>
  <div class="rc-hd"><div class="rc-brand">Day Lanches</div><div class="rc-sub">Comanda do pedido</div></div>
  <div class="rc-row"><span>Pedido: <strong>#${esc(num)}</strong></span><span>${dateTime}</span></div>
  <hr class="rc-sep">
  <div class="rc-type">${typeLabel}${hasMesa ? ' — MESA ' + order.table_number : ''}</div>
  <hr class="rc-sep">
  <div><span class="rc-lbl">Cliente</span><br><span class="rc-val">${esc(order.customer_name||'---')}</span></div>
  ${(!isBalcao && order.customer_phone) ? `<div><span class="rc-lbl">Telefone</span><br><span class="rc-val">${esc(order.customer_phone)}</span></div>` : ''}
  ${(!isBalcao && addressText) ? `<div style="margin-top:2px"><span class="rc-lbl">Endereço</span><br><span class="rc-val" style="font-size:10px">${esc(addressText)}</span></div>` : ''}
  <hr class="rc-sep">
  <div class="rc-row"><span class="rc-lbl">Pagamento</span><span class="rc-val">${esc(payLabel)}</span></div>
  <div class="rc-status">${isPaid ? '✓ PAGO' : '● PAGAMENTO PENDENTE'}</div>
  <hr class="rc-sep">
  <div class="rc-lbl">Itens</div>
  ${itemsHtml}
  ${order.notes ? `<div style="margin-top:3px"><span class="rc-lbl">Obs</span><br><span style="font-size:11px">${esc(order.notes)}</span></div>` : ''}
  <hr class="rc-sep">
  <div class="rc-row" style="font-size:11px"><span>Subtotal</span><span>R$ ${fmt(order.subtotal||0)}</span></div>
  ${fee > 0 ? `<div class="rc-row" style="font-size:11px"><span>Entrega</span><span>R$ ${fmt(fee)}</span></div>` : ''}
  <div class="rc-total"><span>TOTAL</span><span>R$ ${fmt(order.total||0)}</span></div>
  <hr class="rc-sep">
  <div class="rc-ft">Day Lanches — sabor que marca</div>
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
