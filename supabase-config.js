const SUPABASE_URL      = "https://gbrdjnbrstnqgarefcdm.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_SE5dXWKNqt0ABlnzantPrA_Jtns5Cvn";

const ACTIVATION_CODE = "DAY-LANCHES-2026";

if (!window.supabase) {
  console.error("[Day Lanches] SDK Supabase não carregou. Verifique o script CDN no gestao.html.");
} else {
  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log("[Day Lanches] Supabase conectado:", window.supabaseClient);
}
