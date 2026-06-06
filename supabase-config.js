/* ──────────────────────────────────────────
   Day Lanches — Configuração Supabase
   Preencha com os dados do seu projeto.
   Acesse: https://supabase.com → Project Settings → API
────────────────────────────────────────── */

const SUPABASE_URL      = "sb_publishable_SE5dXWKNqt0ABlnzantPrA_Jtns5Cvn";
const SUPABASE_ANON_KEY = "COLOCAR_SUPABASE_ANON_KEY_AQUI";

/* Código para criar novo acesso da loja */
const ACTIVATION_CODE = "DAY-LANCHES-2026";

/* Acesso de teste — criar em: Supabase > Authentication > Users > Add user
   Email: teste@daylanches.com.br
   Senha: DayTeste123! */

/* Inicializa o cliente Supabase */
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
