-- ============================================================
-- Day Lanches — Timeout configurável do bloqueio administrativo
-- Execute este SQL no Supabase (SQL Editor), depois de
-- add_management_pin_security.sql já estar aplicado.
-- ============================================================
--
-- Hoje o desbloqueio das áreas administrativas (Vendas, Relatórios,
-- Configurações, Despesas, Estoque, Acessos) expira num tempo FIXO,
-- hardcoded no frontend (ADMIN_UNLOCK_MS em gestao.js). Esta migration
-- move esse valor para o banco como uma preferência administrativa —
-- "bloquear automaticamente após 15/30/60/120 minutos de inatividade" —
-- e reaproveita a MESMA tabela do PIN (public.management_pin), não uma
-- tabela nova, porque:
--   * o valor não é sigiloso, mas a ESCRITA precisa do mesmo gate de
--     "só admin/owner ativo" que já protege set_management_pin();
--   * management_pin já está com RLS ligado, zero policies e REVOKE de
--     anon/authenticated — reaproveitar essa estrutura evita depender
--     de uma policy de outra tabela (ex.: store_settings) que este
--     projeto não versiona em SQL nenhum;
--   * é a MESMA leitura (get_management_pin_state) que o frontend já
--     busca antes de abrir qualquer área protegida — não precisa de
--     uma segunda chamada de rede.
--
-- Transacional: TODO o arquivo roda dentro de BEGIN/COMMIT. DDL no
-- Postgres é transacional — se qualquer statement falhar (inclusive o
-- DROP FUNCTION mais abaixo), o ROLLBACK automático desfaz tudo: nunca
-- fica uma versão pela metade nem get_management_pin_state() ausente.
--
-- Idempotente: pode rodar mais de uma vez sem duplicar dados nem quebrar
-- se a coluna/constraint/função já existir (checado explicitamente pra
-- cada objeto, ver comentários abaixo). NÃO cria PIN nenhum e NÃO toca em
-- pin_hash/updated_at/updated_by_email — se já existir uma senha
-- configurada (linha id=1 com hash), ela é preservada intacta; se a
-- tabela ainda estiver vazia, continua vazia depois de rodar este
-- arquivo.
--
-- Sem CASCADE em lugar nenhum. O único DROP é do
-- get_management_pin_state() antigo (obrigatório porque o Postgres não
-- permite CREATE OR REPLACE mudar o RETURNS TABLE de uma função
-- existente) — verificado neste repositório que nenhuma view, trigger,
-- default de coluna ou outra função depende dela (só é chamada via RPC
-- pelo cliente). Se o Supabase acusar alguma dependência não versionada
-- aqui (ex.: algo criado direto no painel), o DROP falha e a transação
-- inteira sofre ROLLBACK sozinha — nada fica pela metade; nesse caso,
-- pare e reporte antes de tentar de novo.

begin;

-- ── 1) Nova coluna em management_pin ──────────────────────────
-- ADD COLUMN IF NOT EXISTS: idempotente por natureza. DEFAULT 30 num
-- INTEGER é metadata-only no Postgres moderno (sem reescrever a tabela)
-- e preenche sozinho o valor pra uma eventual linha id=1 já existente,
-- sem tocar em nenhuma outra coluna dela (pin_hash, updated_at,
-- updated_by_email continuam exatamente como estavam).
alter table public.management_pin
  add column if not exists auto_lock_minutes integer not null default 30;

-- Constraint de valores válidos — checa pg_constraint antes de criar,
-- em vez de DROP+ADD a cada execução: numa segunda rodada, se a
-- constraint já existir, este bloco não faz nada (sem recriar, sem
-- duplicar, sem sequer uma janela — por menor que fosse — sem a
-- constraint no meio da migration).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'management_pin_auto_lock_minutes_check'
      and conrelid = 'public.management_pin'::regclass
  ) then
    alter table public.management_pin
      add constraint management_pin_auto_lock_minutes_check
      check (auto_lock_minutes in (15, 30, 60, 120));
  end if;
end $$;

-- Nada a fazer com a linha id=1 aqui: se ela ainda não existir (PIN nunca
-- configurado), a coluna nem existe até alguém inserir a linha — e quando
-- isso acontecer (set_management_pin ou set_management_pin_auto_lock),
-- o DEFAULT 30 já entra sozinho. Se ela JÁ existir com pin_hash
-- preenchido, o ADD COLUMN acima só ganha o novo campo com valor 30 —
-- pin_hash/updated_at/updated_by_email não são lidos nem escritos por
-- nenhum statement deste arquivo.

-- ============================================================
-- 2) get_management_pin_state() — adiciona auto_lock_minutes
-- ============================================================
-- ATENÇÃO: Postgres não permite CREATE OR REPLACE mudar a assinatura de
-- retorno (RETURNS TABLE) de uma função existente — por isso o DROP
-- explícito antes do CREATE (sem CASCADE — ver nota de dependências no
-- cabeçalho do arquivo). IF EXISTS torna isto idempotente: numa segunda
-- execução a função já foi trocada pela versão nova, o DROP IF EXISTS
-- não falha por não achar a versão antiga, e o CREATE recria a mesma
-- definição de novo (no-op funcional). Mantém EXATAMENTE o mesmo
-- hardening da versão anterior (SECURITY DEFINER, search_path travado,
-- REVOKE de PUBLIC/anon, GRANT só para authenticated) e o mesmo
-- comportamento para is_configured/can_manage — só acrescenta o
-- terceiro campo.
drop function if exists public.get_management_pin_state();

create function public.get_management_pin_state()
returns table(is_configured boolean, can_manage boolean, auto_lock_minutes integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
    select
      exists(select 1 from public.management_pin where id = 1 and pin_hash is not null),
      exists(
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('admin', 'owner')
          and coalesce(p.is_active, true) = true
      ),
      -- Tabela pode não ter linha nenhuma ainda (PIN nunca configurado) —
      -- nesse caso o subselect não retorna linha e coalesce cai no
      -- default 30, nunca NULL.
      coalesce((select mp.auto_lock_minutes from public.management_pin mp where mp.id = 1), 30);
end;
$$;

revoke all on function public.get_management_pin_state() from public;
revoke all on function public.get_management_pin_state() from anon;
grant execute on function public.get_management_pin_state() to authenticated;

-- ============================================================
-- 3) set_management_pin_auto_lock() — trocar o timeout
-- ============================================================
-- Mesma checagem de autorização de set_management_pin(): só quem já pode
-- criar/trocar a senha administrativa pode mudar por quanto tempo ela
-- fica válida sem precisar ser digitada de novo. Funcionário comum
-- (gerente, caixa, atendente, cozinha, entregador, funcionario) nunca se
-- qualifica — igual ao PIN em si. CREATE OR REPLACE é seguro aqui (sem
-- DROP) porque a assinatura desta função é nova nesta migration, nunca
-- existiu com outro retorno antes.
create or replace function public.set_management_pin_auto_lock(input_minutes integer)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'owner')
      and coalesce(p.is_active, true) = true
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if input_minutes is null or input_minutes not in (15, 30, 60, 120) then
    raise exception 'invalid_minutes' using errcode = '22023';
  end if;

  -- Upsert: a linha id=1 pode ainda não existir (PIN nunca configurado).
  -- Isso é intencional — a administradora pode ajustar essa preferência
  -- antes mesmo de criar a senha; o valor só passa a valer de verdade
  -- quando a primeira senha for criada e a área for desbloqueada. O SET
  -- do ON CONFLICT toca SÓ em auto_lock_minutes — pin_hash, updated_at e
  -- updated_by_email de uma linha já existente nunca são alterados por
  -- esta função.
  insert into public.management_pin (id, auto_lock_minutes)
  values (1, input_minutes)
  on conflict (id) do update
    set auto_lock_minutes = excluded.auto_lock_minutes;

  return true;
end;
$$;

revoke all on function public.set_management_pin_auto_lock(integer) from public;
revoke all on function public.set_management_pin_auto_lock(integer) from anon;
grant execute on function public.set_management_pin_auto_lock(integer) to authenticated;

-- NOTIFY dentro de transação fica enfileirado pelo Postgres e só é
-- entregue ao PostgREST DEPOIS do COMMIT — não recarrega o schema cache
-- prematuramente com o DDL ainda não confirmado.
notify pgrst, 'reload schema';

commit;
