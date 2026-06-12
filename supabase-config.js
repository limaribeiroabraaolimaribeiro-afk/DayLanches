const SUPABASE_URL      = "https://gbrdjnbrstnqgarefcdm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SE5dXWKNqt0ABlnzantPrA_Jtns5Cvn";

/* URL do Cloudflare Worker (backend serverless) */
const WORKER_URL = "https://day-lanches-worker.limaribeiroabraaolimaribeiro.workers.dev";

if (!window.supabase) {
  console.error("[Day Lanches] SDK Supabase não carregou. Verifique o script CDN no gestao.html.");
} else {
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("[Day Lanches] Supabase conectado:", window.supabaseClient);
}
