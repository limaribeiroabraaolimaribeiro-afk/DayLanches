-- ============================================================
-- Day Lanches — Segunda camada de segurança (senha administrativa)
-- Execute este SQL no Supabase (SQL Editor)
-- ============================================================
--
-- NÃO SUBSTITUI o login da Gestão (e-mail + senha do Supabase Auth).
-- Adiciona uma segunda senha (PIN administrativo) exigida para abrir
-- as áreas: Vendas, Relatórios, Configurações, Despesas, Estoque e
-- Acessos. Produtos, Pedidos, Balcão e Caixa continuam livres.
--
-- Segue o MESMO padrão já estabelecido neste projeto em
-- add_print_agent_activation.sql e migration_activation_code.sql:
--   * RLS ligado + ZERO policies + REVOKE de anon/authenticated nas
--     tabelas — nenhum acesso direto via PostgREST, só pelas funções
--     SECURITY DEFINER abaixo;
--   * senha nunca fica em texto puro — hash bcrypt via pgcrypto
--     (crypt/gen_salt), e o hash NUNCA é retornado ao navegador;
--   * autorização decidida no servidor, cruzando auth.uid() com
--     public.profiles.role — nunca confiando em dado vindo do cliente;
--   * search_path travado e schema-qualificado em toda função
--     SECURITY DEFINER, pra não ficar exposto a sequestro de search_path
--     (ver "hardening" abaixo);
--   * privilégio mínimo explícito: PUBLIC e anon são bloqueados por
--     REVOKE explícito em toda função — não basta "não conceder a
--     anon", porque o Postgres concede EXECUTE a PUBLIC por padrão
--     toda vez que uma função é criada.
--
-- Autorização para CRIAR/TROCAR a senha administrativa:
--   profiles.role IN ('admin', 'owner') AND profiles.is_active.
--   'admin' é o valor usado hoje em add_print_agent_activation.sql
--   para checar administrador. 'owner' é o valor gravado no signup
--   do primeiro acesso da loja (ver handleCreateAccount em gestao.js)
--   e NUNCA é migrado automaticamente para 'admin' — não existe hoje
--   nenhum fluxo que troque isso sozinho. Incluir os dois evita
--   travar a própria dona para fora do próprio recurso por causa
--   dessa inconsistência pré-existente de roles (ver relatório).
--   Cargos operacionais (gerente, caixa, atendente, cozinha,
--   entregador, funcionario) NUNCA se qualificam.
--
--   ATENÇÃO — pré-condição de segurança que este arquivo NÃO garante:
--   esta checagem só é confiável se profiles.role não puder ser
--   autoalterado por um usuário comum via UPDATE direto (RLS da
--   própria tabela profiles, que este projeto não versiona em SQL
--   nenhum — foi criada direto no painel do Supabase). Se a policy de
--   UPDATE de profiles permitir que authenticated altere a própria
--   role/is_active, um funcionário poderia se autopromover e depois
--   criar/trocar o PIN. Ver relatório de auditoria mais recente para
--   o resultado dessa verificação — ela é pré-requisito para publicar
--   este recurso, e este arquivo sozinho não resolve isso.
--
-- Idempotente: pode rodar mais de uma vez sem duplicar dados.
-- NÃO insere nenhuma senha real — a tabela começa vazia (0 linhas),
-- e só passa a existir hash quando a administradora autorizada criar
-- a senha pela própria tela de Configurações > Segurança.

create extension if not exists pgcrypto;

-- ── Tabelas ──────────────────────────────────────────────────

-- Linha única (id sempre = 1). Sem hash = "ainda não configurada".
create table if not exists public.management_pin (
  id                smallint primary key default 1,
  pin_hash          text,
  updated_at        timestamptz,
  updated_by_email  text,
  constraint management_pin_singleton check (id = 1)
);

-- Contador de tentativas por usuário (não por tentativa individual):
-- uma linha por auth.uid(), com o estado atual do rate limit. Chave é
-- auth.uid(), não IP: diferente do Print Agent, aqui quem chama já
-- está autenticado na Gestão, então auth.uid() é confiável e não pode
-- ser falsificado pelo navegador.
create table if not exists public.management_pin_attempts (
  user_id         uuid primary key,
  failed_attempts integer not null default 0,
  locked_until    timestamptz,
  updated_at      timestamptz not null default now()
);

-- ── Trava de acesso — só via funções abaixo, nunca via REST direto ──

alter table public.management_pin           enable row level security;
alter table public.management_pin_attempts  enable row level security;

revoke all on public.management_pin           from anon, authenticated;
revoke all on public.management_pin_attempts  from anon, authenticated;
-- (tabelas não recebem EXECUTE/PUBLIC por padrão como funções recebem,
-- mas o projeto Supabase concede privilégios de schema a anon/authenticated
-- por padrão ao criar tabelas em public — por isso o REVOKE explícito acima,
-- mesmo com RLS ligado e zero policies.)

-- ============================================================
-- FUNÇÕES
-- ============================================================
-- Hardening comum às três funções abaixo:
--   * SECURITY DEFINER + SET search_path = public, pg_temp — trava a
--     resolução de nomes num search_path fixo e seguro (public pros
--     objetos deste projeto, pg_temp por último só pra tabelas
--     temporárias da própria sessão). Isso fecha o vetor clássico de
--     "search_path hijack": alguém criar um objeto malicioso num
--     schema que a função acabaria resolvendo antes do certo. Toda
--     referência a tabela/extensão dentro delas já é schema-
--     qualificada (public.*, extensions.*), então nada depende
--     implicitamente do search_path pra resolver corretamente — o
--     SET aqui é defesa em profundidade, não a única linha de defesa.
--   * REVOKE ALL ... FROM PUBLIC e FROM anon, explícitos, ANTES do
--     GRANT ... TO authenticated. Necessário porque CREATE FUNCTION
--     concede EXECUTE a PUBLIC automaticamente no Postgres (diferente
--     de tabelas) — só não fazer o GRANT pra anon não bastava.

-- ── 1) Estado atual (Gestão, qualquer usuário autenticado) ─────
-- Não vaza o hash nem dado de outros usuários: "can_manage" é
-- calculado sempre em cima do auth.uid() de quem está chamando.
-- Existe pra resolver o problema circular de Configurações ser uma
-- área protegida: o front usa isso pra saber se deve abrir o fluxo
-- de "criar senha" (primeiro setup) em vez do fluxo normal de
-- "digitar senha".
create or replace function public.get_management_pin_state()
returns table(is_configured boolean, can_manage boolean)
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
      );
end;
$$;

revoke all on function public.get_management_pin_state() from public;
revoke all on function public.get_management_pin_state() from anon;
grant execute on function public.get_management_pin_state() to authenticated;

-- ── 2) Criar/trocar a senha administrativa (Gestão, admin autorizado) ──
-- Mesma função para o primeiro setup e para trocas depois — a regra
-- de autorização é idêntica nos dois casos (ver comentário acima).
-- Nunca confia em nada vindo do cliente além do PIN em si.
create or replace function public.set_management_pin(input_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text := coalesce(auth.jwt() ->> 'email', '');
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'owner')
      and coalesce(p.is_active, true) = true
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if input_pin is null or length(trim(input_pin)) < 6 then
    raise exception 'weak_pin' using errcode = '22023';
  end if;

  insert into public.management_pin (id, pin_hash, updated_at, updated_by_email)
  values (1, extensions.crypt(trim(input_pin), extensions.gen_salt('bf')), now(), v_email)
  on conflict (id) do update
    set pin_hash         = excluded.pin_hash,
        updated_at       = excluded.updated_at,
        updated_by_email = excluded.updated_by_email;

  return true;
end;
$$;

revoke all on function public.set_management_pin(text) from public;
revoke all on function public.set_management_pin(text) from anon;
grant execute on function public.set_management_pin(text) to authenticated;

-- ── 3) Verificar a senha administrativa (Gestão, autenticado) ──────
-- Retorna SOMENTE true/false — nunca o hash, nunca um motivo
-- diferenciável de falha. Senha errada e bloqueio por força bruta
-- retornam o mesmo `false`, de propósito: o cliente não tem como
-- distinguir "errei a senha" de "estou bloqueado agora".
--
-- Rate limit é por auth.uid(), persistente (não por janela de tempo
-- somando linhas) e a AUTORIDADE fica inteiramente aqui — o cooldown
-- do frontend é só conveniência de UX, chamar esta RPC direto pelo
-- console não contorna nada.
--
-- Concorrência: a linha de contagem do usuário é travada com
-- `SELECT ... FOR UPDATE` antes de ler/incrementar — o MESMO padrão
-- já usado em activate_print_agent_device()
-- (add_print_agent_activation.sql): se duas chamadas do mesmo usuário
-- chegarem em paralelo, a segunda só prossegue depois que a primeira
-- commitar (cada chamada de função RPC é sua própria transação), então
-- elas nunca leem o mesmo `failed_attempts` desatualizado nem pisam
-- uma na contagem da outra.
create or replace function public.verify_management_pin(input_pin text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_hash text;
  v_failed int;
  v_locked_until timestamptz;
  matched boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- Garante que existe uma linha de controle pra este usuário, sem
  -- pisar em uma que já exista (concorrência segura via ON CONFLICT).
  insert into public.management_pin_attempts (user_id, failed_attempts, locked_until, updated_at)
  values (v_uid, 0, null, now())
  on conflict (user_id) do nothing;

  -- Trava a linha deste usuário até o fim desta transação.
  select failed_attempts, locked_until
    into v_failed, v_locked_until
  from public.management_pin_attempts
  where user_id = v_uid
  for update;

  if v_locked_until is not null and v_locked_until > now() then
    return false;
  end if;

  select pin_hash into v_hash from public.management_pin where id = 1;

  if v_hash is not null then
    matched := (v_hash = extensions.crypt(trim(input_pin), v_hash));
  end if;

  if matched then
    update public.management_pin_attempts
      set failed_attempts = 0,
          locked_until = null,
          updated_at = now()
      where user_id = v_uid;
    return true;
  end if;

  v_failed := v_failed + 1;

  update public.management_pin_attempts
    set failed_attempts = v_failed,
        locked_until = case when v_failed >= 5 then now() + interval '30 seconds' else locked_until end,
        updated_at = now()
    where user_id = v_uid;

  return false;
end;
$$;

revoke all on function public.verify_management_pin(text) from public;
revoke all on function public.verify_management_pin(text) from anon;
grant execute on function public.verify_management_pin(text) to authenticated;

notify pgrst, 'reload schema';
