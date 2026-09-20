-- Autoriza admin/owner nas RPCs administrativas do Print Agent.
BEGIN;

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
  -- Autorização server-side: admin/owner ativo pode gerar código. Nunca
  -- confiar em input_email (vem do navegador) pra isso — email fica
  -- só como dado de auditoria. auth.uid() vem do JWT validado pelo
  -- PostgREST, cross-referenciado com public.profiles.role.
  if not exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'owner')
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

REVOKE ALL ON FUNCTION public.generate_print_agent_activation_code(text, text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_print_agent_activation_code(text, text, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_print_agent_activation_code(text, text, int) TO authenticated;

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
      and p.role in ('admin', 'owner')
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

REVOKE ALL ON FUNCTION public.list_print_agent_devices() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_print_agent_devices() FROM anon;
GRANT EXECUTE ON FUNCTION public.list_print_agent_devices() TO authenticated;

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
      and p.role in ('admin', 'owner')
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

REVOKE ALL ON FUNCTION public.revoke_print_agent_device(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.revoke_print_agent_device(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.revoke_print_agent_device(uuid) TO authenticated;

COMMIT;
