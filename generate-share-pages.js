'use strict';
const fs   = require('fs');
const path = require('path');

const SITE_URL = 'https://www.daylanches.com.br';

/* ── Configuração pública do Supabase — reaproveitada de supabase-config.js
   (mesma fonte que o site usa), pra nunca ter dois valores divergentes.
   Só a anon key (pública por design); NUNCA service_role/secret. ── */
const configSrc = fs.readFileSync(path.join(__dirname, 'supabase-config.js'), 'utf8');
const urlMatch = configSrc.match(/const SUPABASE_URL\s*=\s*"([^"]+)"/);
const keyMatch = configSrc.match(/const SUPABASE_ANON_KEY\s*=\s*"([^"]+)"/);
if (!urlMatch || !keyMatch) {
  console.error('❌ Não foi possível extrair SUPABASE_URL/SUPABASE_ANON_KEY de supabase-config.js');
  process.exit(1);
}
const SUPABASE_URL      = urlMatch[1];
const SUPABASE_ANON_KEY = keyMatch[1];

/* ── Helpers ── */
function slugify(text) {
  return text.toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function fmtPrice(n) {
  return Number(n || 0).toFixed(2).replace('.', ',');
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* og:image:type pela extensão real do arquivo — sem request de rede por
   imagem (não compensa nesta etapa). URL sem extensão reconhecível cai
   num fallback seguro (image/jpeg), sem lógica frágil de sniff. */
function guessImageMime(url) {
  const clean = url.split('?')[0].split('#')[0];
  const ext = clean.split('.').pop().toLowerCase();
  const map = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
  return map[ext] || 'image/jpeg';
}

/* ── Busca produtos ativos direto do Supabase (fonte real do catálogo).
   Só os campos realmente usados na página (name/price/description/
   image_url) — local_id/category/badges/updated_at não entram na geração
   hoje, por isso ficam fora do select. Quantidade é sempre dinâmica: nunca
   assume um número fixo de produtos. */
async function fetchActiveProducts() {
  const fields = ['id', 'name', 'price', 'description', 'image_url'].join(',');
  const url = `${SUPABASE_URL}/rest/v1/products?select=${fields}&active=eq.true&order=name.asc`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res;
  try {
    res = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) throw new Error(`Supabase respondeu HTTP ${res.status} ao buscar produtos`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Resposta do Supabase não é um array de produtos');
  if (data.length === 0) throw new Error('Supabase retornou 0 produtos ativos — abortando por segurança (não gera páginas vazias)');
  return data;
}

/* ── Monta o HTML de 1 página share/ a partir de um produto REAL do
   Supabase. Sem imagem: gera a página sem nenhuma tag og:image (nunca usa
   imagem de outro produto nem inventa um placeholder que não existe no
   projeto). */
function buildShareHtml(p) {
  const slug  = slugify(p.name);
  const title = `${p.name} — Day Lanches`;
  const desc  = p.description
    ? `${p.description} — R$ ${fmtPrice(p.price)}. Peça pelo cardápio online da Day Lanches em Luiz Alves/SC.`
    : `${p.name} por R$ ${fmtPrice(p.price)}. Peça pelo cardápio online da Day Lanches em Luiz Alves/SC.`;
  const ogUrl = `${SITE_URL}/share/${slug}.html`;
  const dest  = `${SITE_URL}/?produto=${p.id}`;
  const img   = p.image_url || '';

  const imageTags = img ? `
  <meta property="og:image"            content="${escapeHtml(img)}">
  <meta property="og:image:secure_url" content="${escapeHtml(img)}">
  <meta property="og:image:type"       content="${guessImageMime(img)}">
  <meta property="og:image:width"      content="1200">
  <meta property="og:image:height"     content="630">
  <meta name="twitter:card"  content="summary_large_image">
  <meta name="twitter:image" content="${escapeHtml(img)}">` : `
  <meta name="twitter:card"  content="summary">`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <meta property="og:type"        content="website">
  <meta property="og:site_name"   content="Day Lanches">
  <meta property="og:title"       content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(desc)}">${imageTags}
  <meta property="og:url"         content="${ogUrl}">
  <meta name="twitter:title"       content="${escapeHtml(title)}">
  <meta name="twitter:description" content="${escapeHtml(desc)}">
  <script>window.location.replace("${dest}");</script>
  <style>
    body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
         height:100vh;margin:0;background:#f5f5f5;color:#555}
  </style>
</head>
<body><p>Carregando…</p></body>
</html>`;

  return { slug, html, hasImage: !!img };
}

(async () => {
  let products;
  try {
    products = await fetchActiveProducts();
  } catch (err) {
    console.error('❌ Falha ao buscar produtos do Supabase:', err.message);
    console.error('   Nenhum arquivo em share/ foi alterado.');
    process.exit(1);
  }

  console.log(`✓ ${products.length} produtos ativos recebidos do Supabase.\n`);

  const shareDir = path.join(__dirname, 'share');
  if (!fs.existsSync(shareDir)) fs.mkdirSync(shareDir);

  const noImageProducts = [];
  const generatedFiles  = new Set();
  let count = 0;

  for (const p of products) {
    const { slug, html, hasImage } = buildShareHtml(p);
    if (!hasImage) noImageProducts.push(p.name);
    fs.writeFileSync(path.join(shareDir, `${slug}.html`), html, 'utf8');
    generatedFiles.add(`${slug}.html`);
    console.log(`  ✓ share/${slug}.html`);
    count++;
  }

  console.log(`\n✅ ${count} páginas geradas em share/ a partir do Supabase.`);

  if (noImageProducts.length) {
    console.log(`\n⚠️  ${noImageProducts.length} produto(s) sem image_url — página gerada sem og:image:`);
    noImageProducts.forEach((n) => console.log(`   - ${n}`));
  }

  /* Páginas antigas sem produto ativo correspondente — só relatório, nunca
     apaga automaticamente (decisão de remoção fica com o usuário). */
  const existingFiles = fs.readdirSync(shareDir).filter((f) => f.endsWith('.html'));
  const orphaned = existingFiles.filter((f) => !generatedFiles.has(f));
  if (orphaned.length) {
    console.log(`\nℹ️  ${orphaned.length} página(s) em share/ não correspondem a nenhum produto ativo atual (NÃO apagadas):`);
    orphaned.forEach((f) => console.log(`   - share/${f}`));
  }
})();
