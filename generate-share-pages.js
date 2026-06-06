'use strict';
const fs   = require('fs');
const path = require('path');

const SITE_URL = 'https://limaribeiroabraaolimaribeiro-afk.github.io/DayLanches';

/* ── Extrai PRODUCTS do script.js ── */
const src   = fs.readFileSync(path.join(__dirname, 'script.js'), 'utf8');
const start = src.indexOf('const PRODUCTS = [');
if (start === -1) { console.error('PRODUCTS não encontrado'); process.exit(1); }

const arrStart = src.indexOf('[', start);
let depth = 0, arrEnd = arrStart;
for (let i = arrStart; i < src.length; i++) {
  if (src[i] === '[') depth++;
  else if (src[i] === ']') { depth--; if (depth === 0) { arrEnd = i; break; } }
}

// eslint-disable-next-line no-eval
const PRODUCTS = eval(src.slice(arrStart, arrEnd + 1));

/* ── Helpers ── */
function slugify(text) {
  return text.toString()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function resolveImg(img) {
  if (!img) return `${SITE_URL}/images/placeholder.png`;
  if (img.startsWith('http')) return img;
  return `${SITE_URL}/${img.replace(/^\//, '')}`;
}

function fmtPrice(n) {
  return n.toFixed(2).replace('.', ',');
}

/* ── Cria pasta share/ ── */
const shareDir = path.join(__dirname, 'share');
if (!fs.existsSync(shareDir)) fs.mkdirSync(shareDir);

/* ── Gera páginas ── */
let count = 0;
for (const p of PRODUCTS) {
  if (p.isAddon) continue;

  const slug  = p.slug || slugify(p.name);
  const title = `${p.name} — Day Lanches`;
  const desc  = `${p.name} por R$ ${fmtPrice(p.price)}. Peça pelo cardápio online da Day Lanches em Luiz Alves/SC.`;
  const img   = resolveImg(p.img);
  const ogUrl = `${SITE_URL}/share/${slug}.html`;
  const dest  = `${SITE_URL}/?produto=${p.id}`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${title}</title>
  <meta property="og:type"             content="website">
  <meta property="og:site_name"        content="Day Lanches">
  <meta property="og:title"            content="${title}">
  <meta property="og:description"      content="${desc}">
  <meta property="og:image"            content="${img}">
  <meta property="og:image:secure_url" content="${img}">
  <meta property="og:image:type"       content="image/jpeg">
  <meta property="og:image:width"      content="1200">
  <meta property="og:image:height"     content="630">
  <meta property="og:url"              content="${ogUrl}">
  <meta name="twitter:card"        content="summary_large_image">
  <meta name="twitter:title"       content="${title}">
  <meta name="twitter:description" content="${desc}">
  <meta name="twitter:image"       content="${img}">
  <script>window.location.replace("${dest}");</script>
  <style>
    body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;
         height:100vh;margin:0;background:#f5f5f5;color:#555}
  </style>
</head>
<body><p>Carregando…</p></body>
</html>`;

  fs.writeFileSync(path.join(shareDir, `${slug}.html`), html, 'utf8');
  console.log(`  ✓ share/${slug}.html`);
  count++;
}

console.log(`\n✅ ${count} páginas geradas em share/`);
