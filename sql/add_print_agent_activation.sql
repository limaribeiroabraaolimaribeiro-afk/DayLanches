-- ============================================================
-- Day Lanches — Ativação segura do Print Agent (código de ativação)
-- Execute este SQL no Supabase (SQL Editor)
-- ============================================================
--
-- Substitui o fluxo antigo (Worker URL + PRINT_AGENT_TOKEN colados
-- manualmente no app) por um código curto, de uso único e com
-- expiração, trocado por uma credencial própria do dispositivo.
--
-- Segue o MESMO padrão já usado em migration_activation_code.sql
-- (RLS ligado + zero policies + REVOKE de anon/authenticated +
-- funções SECURITY DEFINER com GRANT explícito) — a forma mais
-- restritiva já estabelecida neste projeto.
--
-- Nada aqui é lido em texto puro: os códigos usam hash bcrypt
-- (igual ao admin_activation_codes existente) e os tokens de
-- dispositivo usam hash SHA-256 (apropriado para segredos de alta
-- entropia gerados pelo servidor, com verificação rápida a cada
-- poll do Print Agent).

create extension if not exists pgcrypto;

-- ── Tabelas ──────────────────────────────────────────────────

-- Um dispositivo = uma instalação ativada do Print Agent.
create table if not exists public.print_agent_devices (
  id                 uuid primary key default gen_random_uuid(),
  device_token_hash  text not null unique,   -- sha256 hex; o token bruto NUNCA é salvo
  label              text,                    -- nome amigavel, ex: "Computador da loja"
  activated_at       timestamptz not null default now(),
  revoked_at         timestamptz,
  last_seen_at       timestamptz,
  created_by_email   text
);

-- Códigos curtos, de uso único e com expiração, gerados pela Gestão.
create table if not exists public.print_agent_activation_codes (
  id               uuid primary key default gen_random_uuid(),
  code_hash        text not null unique,     -- bcrypt hash; o código bruto NUNCA é salvo
  label            text,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  used_at          timestamptz,
  device_id        uuid references public.print_agent_devices(id),
  created_by_email text
);

-- Rate limit da rota de ativação — uma linha por tentativa (valida ou não).
create table if not exists public.print_agent_activation_attempts (
  id           uuid primary key default gen_random_uuid(),
  ip_address   text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_paa_ip_time
  on public.print_agent_activation_attempts (ip_address, attempted_at);

create index if not exists idx_pad_hash_active
  on public.print_agent_devices (device_token_hash)
  where revoked_at is null;

-- ── Trava de acesso — só via funções abaixo, nunca via REST direto ──

alter table public.print_agent_devices              enable row level security;
alter table public.print_agent_activation_codes      enable row level security;
alter table public.print_agent_activation_attempts   enable row level security;

revoke all on public.print_agent_devices             from anon, authenticated;
revoke all on public.print_agent_activation_codes     from anon, authenticated;
revoke all on public.print_agent_activation_attempts  from anon, authenticated;

-- ============================================================
-- FUNÇÕES
-- ============================================================

-- Gera uma string curta e legível (8 caracteres, sem 0/O/1/I/L
-- pra evitar erro de digitação), formatada "XXXX-XXXX".
-- No Supabase, pgcrypto fica instalado no schema `extensions` (não em
-- `public`). Como estas funções travam search_path=public, toda chamada
-- pgcrypto precisa ser explicitamente qualificada com `extensions.` —
-- nunca depender do search_path pra resolver gen_random_bytes/crypt/
-- gen_salt/digest.
create or replace function public._print_agent_random_code()
returns text
language plpgsql
set search_path = public
as $$
declare
  chars text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  raw   text := '';
  i     int;
begin
  for i in 1..8 loop
    raw := raw || substr(chars, 1 + (get_byte(extensions.gen_random_bytes(1), 0) % length(chars)), 1);
  end loop;
  return substr(raw, 1, 4) || '-' || substr(raw, 5, 4);
end;
$$;

-- ── 1) Gerar código de ativação (Gestão, autenticada) ──────────
-- Retorna o código em texto puro APENAS nesta chamada — depois
-- disso só o hash bcrypt fica salvo, ninguém consegue recuperá-lo.
create or replace function public.generate_print_agent_activation_code(
  input_label     text default null,
  input_email     text default null,
  expires_in_min  int  default 30
)
returns table(code text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code text;
  new_expiry timestamptz := now() + make_interval(mins => greatest(expires_in_min, 1));
begin
  -- Autorização server-side: só admin ativo pode gerar código. Nunca
  -- confiar em input_email (vem do navegador) pra isso — email fica
  -- só como dado de auditoria. auth.uid() vem do JWT validado pelo
  -- PostgREST, cross-referenciado com public.profiles.role.
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  new_code := public._print_agent_random_code();

  insert into public.print_agent_activation_codes (code_hash, label, expires_at, created_by_email)
  values (extensions.crypt(new_code, extensions.gen_salt('bf')), input_label, new_expiry, input_email);

  return query select new_code, new_expiry;
end;
$$;

grant execute on function public.generate_print_agent_activation_code(text, text, int) to authenticated;

-- ── 2) Ativar um dispositivo (Print Agent → Worker → aqui) ─────
-- NÃO é concedida a anon/authenticated: só o service_role (ou
-- seja, só o Worker) consegue chamar esta função. Único ponto de
-- entrada para trocar um código por uma credencial de dispositivo.
--
-- Atômica: todo o resgate (rate limit, validação, geração do
-- token, marcação do código como usado) roda numa única
-- transação de função — ou tudo acontece, ou nada acontece.
create or replace function public.activate_print_agent_device(
  input_code text,
  input_ip           text default 'unknown',
  input_device_label text default null
)
returns table(device_token text, error_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_attempts int;
  matched_code record;
  new_token text;
  new_device_id uuid;
  final_label text;
begin
  -- Sempre registra a tentativa primeiro, mesmo que seja recusada depois.
  insert into public.print_agent_activation_attempts (ip_address) values (input_ip);

  select count(*) into recent_attempts
  from public.print_agent_activation_attempts
  where ip_address = input_ip
    and attempted_at > now() - interval '15 minutes';

  if recent_attempts > 5 then
    return query select null::text, 'rate_limited';
    return;
  end if;

  if input_code is null or length(trim(input_code)) = 0 then
    return query select null::text, 'invalid';
    return;
  end if;

  -- Busca por hash bcrypt entre os códigos ainda não usados (used_at is null).
  -- Não filtra por expires_at aqui pra podermos distinguir "expirado" de "invalido/ja usado" abaixo.
  -- FOR UPDATE trava a linha: se duas requisições disputarem o mesmo código
  -- ao mesmo tempo, a segunda só prossegue depois que a primeira commita —
  -- e nesse momento o WHERE (used_at is null) já não bate mais, então a
  -- segunda simplesmente não encontra nada e recebe 'invalid'.
  select * into matched_code
  from public.print_agent_activation_codes
  where used_at is null
    and code_hash = extensions.crypt(trim(input_code), code_hash)
  limit 1
  for update;

  if matched_code.id is null then
    return query select null::text, 'invalid';
    return;
  end if;

  if matched_code.expires_at < now() then
    return query select null::text, 'expired';
    return;
  end if;

  -- Gera a credencial do dispositivo: 32 bytes aleatorios (256 bits), hex.
  new_token := encode(extensions.gen_random_bytes(32), 'hex');

  -- Prioriza o nome sugerido pelo proprio computador (ex: hostname do Windows,
  -- mais util pra identificar na lista) e cai pro rotulo definido na geracao
  -- do codigo se o dispositivo nao mandar nada.
  final_label := coalesce(nullif(trim(input_device_label), ''), matched_code.label);

  insert into public.print_agent_devices (device_token_hash, label, created_by_email)
  values (encode(extensions.digest(new_token, 'sha256'), 'hex'), final_label, matched_code.created_by_email)
  returning id into new_device_id;

  update public.print_agent_activation_codes
  set used_at = now(), device_id = new_device_id
  where id = matched_code.id;

  return query select new_token, null::text;
end;
$$;

-- Sem GRANT para anon/authenticated — só service_role (o Worker) chama esta funcao.

-- ── 3) Listar dispositivos (Gestão, autenticada + admin) ────────
-- NUNCA retorna device_token_hash. Convertida de "language sql" para
-- "language plpgsql" só para permitir a checagem de autorização abaixo.
create or replace function public.list_print_agent_devices()
returns table(
  id uuid, label text, activated_at timestamptz,
  revoked_at timestamptz, last_seen_at timestamptz, created_by_email text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  return query
    select d.id, d.label, d.activated_at, d.revoked_at, d.last_seen_at, d.created_by_email
    from public.print_agent_devices d
    order by d.activated_at desc;
end;
$$;

grant execute on function public.list_print_agent_devices() to authenticated;

-- ── 4) Revogar dispositivo (Gestão, autenticada + admin) ────────
create or replace function public.revoke_print_agent_device(input_device_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and coalesce(p.is_active, true) = true
  ) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.print_agent_devices
  set revoked_at = now()
  where id = input_device_id and revoked_at is null;

  return found;
end;
$$;

grant execute on function public.revoke_print_agent_device(uuid) to authenticated;

notify pgrst, 'reload schema';
