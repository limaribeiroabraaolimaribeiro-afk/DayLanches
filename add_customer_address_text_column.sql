-- Executar manualmente no Supabase SQL Editor.
--
-- Adiciona a coluna que guarda o endereço aproximado (rua, bairro,
-- cidade - estado) obtido via reverse geocoding a partir da localização
-- enviada pelo cliente no checkout. Usado na comanda impressa da Gestão.
--
-- É seguro rodar mais de uma vez: "if not exists" evita erro caso a
-- coluna já tenha sido criada antes.

alter table public.orders
add column if not exists customer_address_text text;
