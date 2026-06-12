/*
 * Service worker mínimo da Gestão Day Lanches.
 * Único objetivo: habilitar o botão "Instalar app" no Chrome/Edge.
 * Não armazena nada em cache — login, pedidos e respostas do Supabase
 * sempre vão direto para a rede (o painel exige internet).
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
