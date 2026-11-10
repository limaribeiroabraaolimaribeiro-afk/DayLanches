-- Day Lanches — categoria Conveniência e disponibilidade por forma de atendimento.
-- Não altera a categoria nem a disponibilidade de nenhum produto existente.
alter table public.products
  add column if not exists delivery_available boolean not null default true;

comment on column public.products.delivery_available is
  'true: entrega e retirada/balcão; false: somente retirada/balcão no local.';

-- A validação no banco impede pedidos novos de entrega com itens exclusivos
-- da loja, mesmo em versões antigas do cardápio ou requisições manuais.
create or replace function public.validate_order_delivery_availability()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  item jsonb;
  item_id text;
  item_name text;
  matched_product record;
begin
  if new.delivery_type is distinct from 'delivery' then
    return new; -- balcão e retirada funcionam normalmente
  end if;

  if new.items is null or jsonb_typeof(new.items) is distinct from 'array' then
    raise exception 'Itens do pedido inválidos.' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(new.items)
  loop
    item_id := nullif(btrim(item->>'id'), '');
    item_name := nullif(btrim(item->>'name'), '');

    if item_id is not null then
      select p.id, p.name, p.delivery_available into matched_product
      from public.products p
      where p.id::text = item_id or p.local_id = item_id
      order by (p.id::text = item_id) desc
      limit 1;
    else
      -- Compatibilidade com pedidos legados: quando o item não traz ID,
      -- procura pelo nome. Só aceita nomes conhecidos do catálogo.
      select p.id, p.name, p.delivery_available into matched_product
      from public.products p where p.name = item_name
      order by p.active desc, p.created_at desc
      limit 1;
    end if;

    if not found or matched_product.id is null then
      -- Não interrompe vendas legadas que usam nomes/IDs de itens já removidos
      -- do catálogo. Produtos atuais marcados sem entrega continuam bloqueados
      -- por ID ou nome; para autenticação forte de todos os itens, é preciso
      -- migrar também os catálogos legados para IDs estáveis.
      continue;
    end if;

    if matched_product.delivery_available is false then
      raise exception 'Produto disponível somente no local: %', matched_product.name
        using errcode = '23514';
    end if;

    -- O nome deve concordar com o produto para evitar um pedido que
    -- declare o UUID de um item entregável mas o nome de outro restrito.
    if item_name is distinct from matched_product.name then
      raise exception 'Dados do produto divergentes: %', coalesce(item_name, 'sem nome')
        using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists orders_validate_delivery_availability on public.orders;
create trigger orders_validate_delivery_availability
before insert or update of items, delivery_type on public.orders
for each row execute function public.validate_order_delivery_availability();

-- Trigger não é uma API pública.
revoke all on function public.validate_order_delivery_availability() from public, anon, authenticated;
