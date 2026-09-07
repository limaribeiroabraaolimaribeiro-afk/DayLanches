-- ============================================================
-- Day Lanches — Diagnóstico e correção do acesso administrativo
-- Execute no Supabase (SQL Editor), como dona/administradora do projeto.
-- ============================================================
--
-- CAUSA-RAIZ ENCONTRADA (ver relatório da conversa para a análise completa):
--
--   1) sql/add_business_management_modules.sql roda:
--        ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text
--          DEFAULT 'funcionario';
--      No Postgres, ADD COLUMN ... DEFAULT preenche esse default também
--      para as linhas que já existiam ANTES da coluna existir — não só
--      para linhas novas. Qualquer profiles.id criado antes desta migration
--      (inclusive uma conta de dona/administradora já em uso) ficou com
--      role='funcionario', nunca 'owner'/'admin'.
--
--   2) gestao.js → handleCreateAccount() fazia (antes desta correção de
--      código, ver commit) um INSERT simples em profiles com role='owner'
--      dentro de um try/catch que ENGOLIA o erro em silêncio. Se este
--      projeto Supabase tiver um trigger em auth.users que já cria a linha
--      de profiles sozinho no signUp (comum em projetos Supabase, criado
--      direto no painel — não versionado em nenhum SQL deste repositório),
--      esse INSERT colide na chave primária, falha, e o catch escondia a
--      falha — a conta ficava com o role que o trigger tivesse usado
--      (nunca 'owner'), mesmo tendo sido criada pelo fluxo correto com
--      código de ativação. O código já foi corrigido para usar upsert (faz
--      a troca de role valer mesmo se a linha já existir) — mas isso só
--      vale para contas criadas A PARTIR DE AGORA. Uma conta que já existe
--      hoje com role errado continua errada até alguém rodar o UPDATE
--      manual abaixo.
--
--   Em ambos os casos, o sintoma é exatamente o relatado: o login no
--   Supabase Auth funciona normalmente (entra no Gestão), mas
--   get_management_pin_state().can_manage volta false pra essa conta —
--   então ela não consegue configurar o PIN administrativo (se ainda não
--   existir) nem trocar depois, e fica bloqueada para sempre em Vendas,
--   Relatórios, Configurações, Despesas, Estoque e Acessos.
--
--   IMPORTANTE — o que este arquivo NÃO faz: não promove ninguém
--   automaticamente. Promover a conta errada a 'owner'/'admin' seria uma
--   escalação de privilégio real; por isso os comandos abaixo são
--   comentados por padrão e pedem pra você confirmar o e-mail certo antes
--   de rodar.
--
-- ============================================================
-- PASSO 1 — Diagnóstico (seguro, só leitura)
-- ============================================================
-- Rode isto primeiro e confira o resultado antes de qualquer UPDATE.
-- "role" mostra o valor gravado hoje; "pode_gerenciar_pin" reproduz a MESMA
-- checagem usada por get_management_pin_state()/set_management_pin() —
-- se vier "false" para a sua conta, é exatamente o bug acima.
select
  p.id,
  p.email,
  p.name,
  p.role,
  coalesce(p.is_active, true) as is_active,
  (p.role in ('admin', 'owner') and coalesce(p.is_active, true) = true) as pode_gerenciar_pin
from public.profiles p
order by p.email;

-- ============================================================
-- PASSO 2 — Corrigir a SUA conta (edite o e-mail antes de rodar)
-- ============================================================
-- Substitua 'SEU_EMAIL_AQUI@exemplo.com' pelo e-mail exato (o mesmo do
-- login da Gestão) da conta que deveria ser dona/administradora. Rode SÓ
-- depois de confirmar no Passo 1 que essa é realmente a conta com o
-- problema (role diferente de admin/owner, ou role nulo).
--
-- update public.profiles
--   set role = 'owner',
--       is_active = true,
--       updated_at = now()
--   where email = 'SEU_EMAIL_AQUI@exemplo.com';

-- ============================================================
-- PASSO 3 (opcional) — Checar se profiles tem policy que deixa qualquer
-- usuário autenticado alterar o PRÓPRIO role (auto-promoção)
-- ============================================================
-- A tabela profiles não é versionada em SQL neste repositório (foi criada
-- direto no painel do Supabase — ver aviso já existente em
-- sql/add_management_pin_security.sql). Isto é só leitura: lista as
-- policies hoje ativas em profiles para você inspecionar manualmente. Se
-- existir uma policy de UPDATE "USING (auth.uid() = id)" SEM restringir as
-- colunas alteráveis, qualquer funcionário logado poderia se autopromover a
-- role='admin' direto pelo cliente e depois criar/trocar o PIN sozinho —
-- nesse caso, restrinja a policy (ex.: com WITH CHECK bloqueando mudança de
-- role/is_active) ou mova a alteração de role para uma função SECURITY
-- DEFINER como update_profile_role_admin_only(), no mesmo padrão de
-- set_management_pin() em add_management_pin_security.sql.
select
  polname   as policy_name,
  polcmd    as command,
  pg_get_expr(polqual, polrelid)      as using_expression,
  pg_get_expr(polwithcheck, polrelid) as with_check_expression
from pg_policy
where polrelid = 'public.profiles'::regclass;
