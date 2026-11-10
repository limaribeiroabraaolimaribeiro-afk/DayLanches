-- Day Lanches: caixa operacional para funcionários, financeiro exclusivo de admin/owner.
-- Aplicar antes de publicar a nova gestao.js. Banco é a autoridade: não confiar no PIN visual.
-- Não altera perfis, pedidos ou lançamentos existentes.

-- Perfis são mantidos pela gestão; user_metadata nunca serve de autorização.
create or replace function public.cash_can_operate()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.is_active, true)
      and p.role in ('owner', 'admin', 'gerente', 'funcionario', 'caixa', 'atendente')
  );
$$;

create or replace function public.cash_can_view_financials()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and coalesce(p.is_active, true)
      and p.role in ('owner', 'admin')
  );
$$;

revoke all on function public.cash_can_operate() from public, anon;
revoke all on function public.cash_can_view_financials() from public, anon;
grant execute on function public.cash_can_operate() to authenticated;
grant execute on function public.cash_can_view_financials() to authenticated;

-- Os totais históricos nunca podem ser lidos/modificados pelo login operacional.
-- INSERT/UPDATE/DELETE passam exclusivamente pelas funções verificadas abaixo.
alter table public.cash_closings enable row level security;
drop policy if exists "Auth users manage cash_closings" on public.cash_closings;
drop policy if exists "Cash managers read financials" on public.cash_closings;
create policy "Cash managers read financials"
on public.cash_closings for select to authenticated
using ((select public.cash_can_view_financials()));

-- Bloqueia aberturas duplas mesmo sob cliques simultâneos.
create unique index if not exists cash_closings_one_open_index
on public.cash_closings ((true)) where status = 'aberto';

-- Oculta também os metadados de caixa gravados no histórico de auditoria antigo.
drop policy if exists "Authenticated users can read audit logs" on public.audit_logs;
drop policy if exists "Cash activity visible only to managers" on public.audit_logs;
create policy "Cash activity visible only to managers"
on public.audit_logs for select to authenticated
using (
  (
    action is distinct from 'open_cash_register'
    and action is distinct from 'close_cash_register'
    and entity_type is distinct from 'cash'
  ) or (select public.cash_can_view_financials())
);

-- Contrato mínimo: retorna apenas status, operador e permissão.
-- Nenhum total de vendas, troco, esperado, apurado ou diferença para funcionário.
create or replace function public.get_cash_register_state()
returns table(
  id uuid,
  opened_at timestamptz,
  opened_by_email text,
  can_view_financials boolean,
  bypass_pin boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.cash_can_operate() then
    raise exception 'Acesso ao caixa não autorizado' using errcode = '42501';
  end if;

  return query
    select c.id, c.opened_at, c.opened_by_email,
      public.cash_can_view_financials(),
      exists (
        select 1 from public.profiles p
        where p.id = (select auth.uid())
          and p.role = 'owner'
          and coalesce(p.is_active, true)
      )
    from (select true as singleton) x
    left join lateral (
      select cc.id, cc.opened_at, cc.opened_by_email
      from public.cash_closings cc
      where cc.status = 'aberto'
      order by cc.opened_at desc
      limit 1
    ) c on true;
end;
$$;

create or replace function public.open_cash_register(
  input_opening_amount numeric,
  input_notes text default null
)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  new_id uuid;
begin
  if not public.cash_can_operate() then
    raise exception 'Acesso ao caixa não autorizado' using errcode = '42501';
  end if;
  if input_opening_amount is null
     or input_opening_amount < 0 or input_opening_amount > 10000000
     or input_opening_amount::text = 'NaN' then
    raise exception 'Valor inicial inválido' using errcode = '22023';
  end if;
  if length(coalesce(input_notes,'')) > 1000 then
    raise exception 'Observação muito longa' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(86173652);
  if exists (select 1 from public.cash_closings where status = 'aberto') then
    raise exception 'Já existe um caixa aberto' using errcode = '23505';
  end if;

  insert into public.cash_closings (
    opening_amount, status, notes, opened_by_user_id, opened_by_email
  ) values (
    round(input_opening_amount, 2), 'aberto', nullif(btrim(input_notes), ''),
    auth.uid(), (select u.email from auth.users u where u.id = auth.uid())
  )
  returning public.cash_closings.id into new_id;
  return new_id;
end;
$$;

-- Recalcula os totais no servidor: nenhum "expectedCash" é aceito do cliente.
-- A função retorna só sucesso; nunca a diferença ou os totais ao funcionário.
create or replace function public.close_cash_register(
  input_cash_id uuid,
  input_counted_amount numeric,
  input_notes text default null
)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  register_row public.cash_closings%rowtype;
  closed_time timestamptz := pg_catalog.now();
  paid_cash numeric := 0;
  paid_pix numeric := 0;
  paid_card numeric := 0;
  paid_online numeric := 0;
  paid_fees numeric := 0;
  expected_amount numeric := 0;
begin
  if not public.cash_can_operate() then
    raise exception 'Acesso ao caixa não autorizado' using errcode = '42501';
  end if;
  if input_cash_id is null then
    raise exception 'Caixa inválido' using errcode = '22023';
  end if;
  if input_counted_amount is null
     or input_counted_amount < 0 or input_counted_amount > 10000000
     or input_counted_amount::text = 'NaN' then
    raise exception 'Valor contado inválido' using errcode = '22023';
  end if;
  if length(coalesce(input_notes,'')) > 1000 then
    raise exception 'Observação muito longa' using errcode = '22023';
  end if;

  select * into register_row
  from public.cash_closings
  where id = input_cash_id and status = 'aberto'
  for update;
  if not found then
    raise exception 'Caixa não está aberto' using errcode = '22023';
  end if;

  select
    coalesce(sum(o.total) filter (where o.payment_method = 'dinheiro'), 0),
    coalesce(sum(o.total) filter (where o.payment_method = 'pix_loja'), 0),
    coalesce(sum(o.total) filter (where o.payment_method = 'cartao_maquininha'), 0),
    coalesce(sum(o.total) filter (
      where o.payment_method not in ('pix_loja', 'cartao_maquininha')
        and (
          o.payment_provider = 'infinitepay'
          or o.capture_method is not null and o.capture_method <> ''
          or lower(coalesce(o.payment_method,'')) like '%pix%'
          or lower(coalesce(o.payment_method,'')) like '%card%'
          or lower(coalesce(o.payment_method,'')) like '%online%'
        )
    ), 0),
    coalesce(sum(o.delivery_fee), 0)
  into paid_cash, paid_pix, paid_card, paid_online, paid_fees
  from public.orders o
  where o.status is distinct from 'cancelado'
    and o.paid_at between register_row.opened_at and closed_time;

  expected_amount := coalesce(register_row.opening_amount,0) + paid_cash;

  update public.cash_closings
  set closed_at = closed_time, status = 'fechado',
      closed_by_user_id = auth.uid(),
      closed_by_email = (select u.email from auth.users u where u.id = auth.uid()),
      cash_sales_total = paid_cash, pix_sales_total = paid_pix,
      card_sales_total = paid_card, online_sales_total = paid_online,
      delivery_fee_total = paid_fees,
      expected_cash_amount = expected_amount,
      counted_cash_amount = round(input_counted_amount,2),
      difference_amount = round(input_counted_amount,2) - expected_amount,
      notes = nullif(btrim(input_notes),''),
      updated_at = closed_time
  where id = register_row.id;

  return true;
end;
$$;

revoke all on function public.get_cash_register_state() from public, anon;
revoke all on function public.open_cash_register(numeric,text) from public, anon;
revoke all on function public.close_cash_register(uuid,numeric,text) from public, anon;
grant execute on function public.get_cash_register_state() to authenticated;
grant execute on function public.open_cash_register(numeric,text) to authenticated;
grant execute on function public.close_cash_register(uuid,numeric,text) to authenticated;

notify pgrst, 'reload schema';
