-- ============================================================
-- Day Lanches — Bypass do PIN administrativo para role='owner'
-- Execute no Supabase (SQL Editor), depois de add_management_pin_security.sql
-- e add_management_pin_auto_lock.sql já estarem aplicados.
-- ============================================================
--
-- Regra de negócio: existem dois papéis administrativos hoje —
--   role='owner' → Abraão, dono/desenvolvedor do sistema.
--   role='admin' → Dayane, administradora da loja.
-- A segunda camada de senha (PIN) foi criada pensando na Dayane, que pode
-- deixar o Gestão aberto pra uma funcionária — ela continua exatamente como
-- está: digita o PIN, tem auto-lock, pode bloquear manualmente. O dono do
-- sistema não precisa dessa segunda camada pra ele mesmo: esta migration só
-- ensina get_management_pin_state() a informar, de forma segura (calculada
-- no servidor a partir de auth.uid() + public.profiles, igual is_configured/
-- can_manage já fazem), se quem está chamando é um owner ativo — o
-- front-end (gestao.js) decide o resto a partir dessa informação, mas a
-- decisão de QUEM é owner nunca sai do banco.
--
-- Não cria bypass por e-mail, não hardcoda ninguém: bypass_pin é só
-- `profiles.role = 'owner' AND coalesce(profiles.is_active, true)`.
--
-- Transacional: todo o arquivo roda dentro de BEGIN/COMMIT, mesmo padrão de
-- add_management_pin_auto_lock.sql — se o DROP FUNCTION ou o CREATE
-- falharem por qualquer motivo, o ROLLBACK automático desfaz tudo, nunca
-- fica uma versão pela metade nem get_management_pin_state() ausente.
--
-- Idempotente: pode rodar mais de uma vez sem duplicar nada e sem quebrar
-- se já tiver sido aplicada — o DROP FUNCTION IF EXISTS cobre a segunda
-- execução (a função já estará na versão nova, o CREATE recria a mesma
-- definição de novo, no-op funcional). NÃO cria migration_pin nenhum, não
-- insere/atualiza public.profiles — não promove ninguém a owner/admin
-- sozinha. Quem já é owner/admin no banco continua sendo; quem não é,
-- continua não sendo.
--
-- Sem CASCADE em lugar nenhum, mesma verificação de dependências já feita
-- em add_management_pin_auto_lock.sql: get_management_pin_state() só é
-- chamada via RPC pelo cliente, nenhuma view/trigger/default de coluna
-- depende dela.

begin;

-- ============================================================
-- get_management_pin_state() — adiciona bypass_pin
-- ============================================================
-- ATENÇÃO: Postgres não permite CREATE OR REPLACE mudar a assinatura de
-- retorno (RETURNS TABLE) de uma função existente — por isso o DROP
-- explícito antes do CREATE. IF EXISTS torna isto idempotente. Mantém
-- EXATAMENTE o mesmo hardening da versão anterior (SECURITY DEFINER,
-- search_path travado, REVOKE de PUBLIC/anon, GRANT só para authenticated)
-- e o mesmo comportamento para is_configured/can_manage/auto_lock_minutes —
-- só acrescenta o quarto campo, bypass_pin.
drop function if exists public.get_management_pin_state();

create function public.get_management_pin_state()
returns table(is_configured boolean, can_manage boolean, auto_lock_minutes integer, bypass_pin boolean)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
    select
      exists(select 1 from public.management_pin where id = 1 and pin_hash is not null),
      -- can_manage: quem pode CRIAR/TROCAR o PIN — continua admin OU owner,
      -- sem mudança nenhuma (item 6 do pedido: owner também pode configurar
      -- o PIN, mesmo não precisando dele pra si mesmo).
      exists(
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('admin', 'owner')
          and coalesce(p.is_active, true) = true
      ),
      -- Tabela pode não ter linha nenhuma ainda (PIN nunca configurado) —
      -- nesse caso o subselect não retorna linha e coalesce cai no
      -- default 30, nunca NULL.
      coalesce((select mp.auto_lock_minutes from public.management_pin mp where mp.id = 1), 30),
      -- bypass_pin: SÓ role='owner' ativo. admin (Dayane) e qualquer outro
      -- cargo operacional (funcionario, gerente, caixa, atendente, cozinha,
      -- entregador) sempre recebem false aqui — nunca precisam do PIN pra
      -- ver true, e o front-end (showSection() em gestao.js) só pula o
      -- modal quando este campo vier true diretamente desta função.
      exists(
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role = 'owner'
          and coalesce(p.is_active, true) = true
      );
end;
$$;

revoke all on function public.get_management_pin_state() from public;
revoke all on function public.get_management_pin_state() from anon;
grant execute on function public.get_management_pin_state() to authenticated;

-- NOTIFY dentro de transação fica enfileirado pelo Postgres e só é
-- entregue ao PostgREST DEPOIS do COMMIT — não recarrega o schema cache
-- prematuramente com o DDL ainda não confirmado.
notify pgrst, 'reload schema';

commit;
