/*
 * Service worker do Garçom Day Lanches.
 * Escopo real (definido no registro em garcom.html via {scope:'/garcom.html'},
 * não só no manifest): SOMENTE a página /garcom.html. Nunca controla
 * index.html, gestao.html, obrigado.html, acompanhar.html ou qualquer outra
 * rota do site — narrowing de escopo não precisa de header especial no
 * servidor (só ampliar escopo além do diretório do script exigiria isso).
 *
 * Cacheia só a casca do app (garcom.html/css/js, manifest, ícones) via
 * stale-while-revalidate — serve rápido/offline e atualiza em segundo
 * plano a cada carregamento, sem travar em versão antiga pra sempre.
 * NUNCA intercepta nem cacheia Supabase, APIs externas ou qualquer request
 * que não seja GET same-origin da lista abaixo — pedidos, mesas, produtos e
 * autenticação sempre vão direto pra rede.
 */

const CACHE_NAME = 'garcom-v1';

const SHELL_URLS = [
  '/garcom.html',
  '/garcom.css?v=2',
  '/garcom.js?v=2',
  '/garcom-manifest.webmanifest',
  '/assets/icons/day-lanches-gestao-192.png',
  '/assets/icons/day-lanches-gestao-512.png',
  '/assets/icons/apple-touch-icon.png',
  '/assets/icons/favicon-32.png',
];

// Chave de cache normalizada (sem query string) — evita acumular uma entrada
// nova a cada bump de "?v=" e mantém sempre só a versão mais recente de cada
// arquivo da casca.
function shellKey(url) {
  return new Request(url.origin + url.pathname);
}

function isShellPath(pathname) {
  return SHELL_URLS.some((u) => u.split('?')[0] === pathname);
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.all(SHELL_URLS.map((u) =>
        fetch(u).then((res) => (res.ok ? cache.put(shellKey(new URL(u, self.location.origin)), res) : null)).catch(() => {})
      )))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((n) => n.startsWith('garcom-') && n !== CACHE_NAME).map((n) => caches.delete(n))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só GET, só mesma origem, só a casca do Garçom listada acima — tudo o
  // resto (Supabase, CDNs, fontes, qualquer POST/PATCH) passa direto pra
  // rede, sem o Service Worker tocar em nada.
  if (req.method !== 'GET' || url.origin !== self.location.origin || !isShellPath(url.pathname)) {
    return;
  }

  const key = shellKey(url);
  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(key);
      const network = fetch(req)
        .then((res) => { if (res.ok) cache.put(key, res.clone()); return res; })
        .catch(() => cached);
      return cached || network;
    })
  );
});
