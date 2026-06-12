-- Executar no Supabase SQL Editor
-- Código de segurança para liberar a criação do primeiro acesso da loja.
-- O código real NUNCA é salvo em texto puro nem exposto ao frontend.

create extension if not exists pgcrypto;

create table if not exists admin_activation_codes (
  id            uuid primary key default gen_random_uuid(),
  code_hash     text not null,
  is_active     boolean not null default true,
  used_at       timestamptz,
  used_by_email text,
  created_at    timestamptz not null default now()
);

-- RLS habilitado e sem nenhuma policy: anon/authenticated não conseguem
-- SELECT/INSERT/UPDATE/DELETE direto nessa tabela via PostgREST.
alter table admin_activation_codes enable row level security;
revoke all on admin_activation_codes from anon, authenticated;

-- Cadastra o código de ativação da loja (rode uma vez).
-- Troque 'DAY-LANCHES-2026' pelo código real antes de executar.
insert into admin_activation_codes (code_hash)
values (crypt('DAY-LANCHES-2026', gen_salt('bf')));

-- Verifica se o código digitado é válido e está ativo.
-- Não retorna o código nem o hash, apenas true/false.
create or replace function validate_admin_activation_code(input_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1
    from admin_activation_codes
    where is_active = true
      and code_hash = crypt(input_code, code_hash)
  );
end;
$$;

-- Marca o código como usado (uso único). Deve ser chamada somente
-- após o auth.signUp ter sido concluído com sucesso.
create or replace function consume_admin_activation_code(input_code text, input_email text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id
  from admin_activation_codes
  where is_active = true
    and code_hash = crypt(input_code, code_hash)
  limit 1;

  if v_id is null then
    return false;
  end if;

  update admin_activation_codes
  set is_active = false,
      used_at = now(),
      used_by_email = input_email
  where id = v_id;

  return true;
end;
$$;

grant execute on function validate_admin_activation_code(text) to anon, authenticated;
grant execute on function consume_admin_activation_code(text, text) to anon, authenticated;
