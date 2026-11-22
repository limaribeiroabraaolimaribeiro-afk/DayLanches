
create table if not exists public.print_agent_dispatches (
 order_id uuid primary key references public.orders(id) on delete cascade,
 claim_id uuid not null unique default gen_random_uuid(),
 owner_hash text not null,
 start_count integer not null check (start_count>=0),
 end_count integer not null check (end_count>start_count),
 initial_print boolean not null,
 legacy boolean not null,
 claimed_at timestamptz not null default now(),
 confirmed_at timestamptz
);
alter table public.print_agent_dispatches enable row level security;
revoke all on public.print_agent_dispatches from public, anon, authenticated;
grant select,insert,update,delete on public.print_agent_dispatches to service_role;

create or replace function public.claim_daylanches_print(p_owner text,p_legacy boolean)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.orders%rowtype; d public.print_agent_dispatches%rowtype; n integer; first_print boolean; start_at integer; result jsonb; review_count integer;
begin
 select count(*) into review_count from public.print_agent_dispatches q join public.orders t on t.id=q.order_id
 where q.confirmed_at is null and q.claimed_at<now()-interval '2 minutes' and t.deleted_at is null and t.status<>'cancelado';
 select t.* into o from public.orders t
 where t.deleted_at is null and t.status<>'cancelado'
 and jsonb_typeof(t.items)='array' and jsonb_array_length(t.items)>0
 and (t.printed_at is null or (t.order_source='balcao' and t.table_number is not null and t.printed_at is not null and t.created_at>=now()-interval '24 hours' and jsonb_array_length(t.items)>coalesce(t.printed_items_count,0)))
 and not exists (select 1 from public.print_agent_dispatches q where q.order_id=t.id and q.confirmed_at is null and (not q.legacy or q.claimed_at>now()-interval '5 minutes'))
 order by t.created_at asc,t.id limit 1 for update of t skip locked;
 if not found then return jsonb_build_object('orders','[]'::jsonb,'review_count',review_count,'protocol',2); end if;
 first_print:=o.printed_at is null;
 start_at:=case when first_print then 0 else coalesce(o.printed_items_count,0) end;
 n:=jsonb_array_length(o.items);
 insert into public.print_agent_dispatches(order_id,owner_hash,start_count,end_count,initial_print,legacy)
 values(o.id,p_owner,start_at,n,first_print,p_legacy)
 on conflict(order_id) do update set claim_id=gen_random_uuid(),owner_hash=excluded.owner_hash,start_count=excluded.start_count,end_count=excluded.end_count,initial_print=excluded.initial_print,legacy=excluded.legacy,claimed_at=now(),confirmed_at=null
 where print_agent_dispatches.confirmed_at is not null or (print_agent_dispatches.legacy and print_agent_dispatches.claimed_at<=now()-interval '5 minutes')
 returning * into d;
 if not found then return jsonb_build_object('orders','[]'::jsonb,'review_count',review_count,'protocol',2); end if;
 result:=jsonb_build_object('id',o.id,'order_number',o.order_number,'created_at',o.created_at,'customer_name',o.customer_name,'customer_phone',o.customer_phone,'delivery_type',o.delivery_type,'order_source',o.order_source,'table_number',o.table_number,'payment_method',o.payment_method,'payment_status',o.payment_status,'paid_at',o.paid_at,'status',o.status,'subtotal',o.subtotal,'delivery_fee',o.delivery_fee,'total',o.total,'items',o.items,'notes',o.notes,'customer_address_text',o.customer_address_text,'location',o.location,'printed_at',o.printed_at,'printed_items_count',o.printed_items_count,'printed_items_count_before',start_at,'print_claim_id',d.claim_id,'is_addition',not first_print);
 if not first_print then
 select jsonb_set(result,'{items}',coalesce(jsonb_agg(e.value order by e.ordinality),'[]'::jsonb)) into result from jsonb_array_elements(o.items) with ordinality e where e.ordinality>start_at;
 end if;
 return jsonb_build_object('orders',jsonb_build_array(result),'review_count',review_count,'protocol',2);
end $$;

create or replace function public.confirm_daylanches_print(p_owner text,p_order uuid,p_end integer,p_claim uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare o public.orders%rowtype; d public.print_agent_dispatches%rowtype;
begin
 select * into o from public.orders where id=p_order for update;
 if not found then return jsonb_build_object('success',false,'error','order_not_found'); end if;
 select * into d from public.print_agent_dispatches where order_id=p_order for update;
 if not found then
  return jsonb_build_object('success',false,'error','claim_required');
 end if;
 if d.owner_hash<>p_owner or (not d.legacy and p_claim is distinct from d.claim_id) or (p_claim is not null and p_claim<>d.claim_id) or (p_end is not null and p_end<>d.end_count) then
  return jsonb_build_object('success',false,'error','claim_mismatch');
 end if;
 if d.confirmed_at is not null then return jsonb_build_object('success',true,'already_confirmed',true); end if;
 if jsonb_typeof(o.items)<>'array' or jsonb_array_length(o.items)<d.end_count then return jsonb_build_object('success',false,'error','items_changed'); end if;
 update public.orders set printed_at=now(),printed_items_count=greatest(coalesce(printed_items_count,0),d.end_count) where id=p_order;
 update public.print_agent_dispatches set confirmed_at=now() where order_id=p_order;
 return jsonb_build_object('success',true,'already_confirmed',false,'order_number',o.order_number);
end $$;
revoke all on function public.claim_daylanches_print(text,boolean) from public,anon,authenticated;
revoke all on function public.confirm_daylanches_print(text,uuid,integer,uuid) from public,anon,authenticated;
grant execute on function public.claim_daylanches_print(text,boolean) to service_role;
grant execute on function public.confirm_daylanches_print(text,uuid,integer,uuid) to service_role;
