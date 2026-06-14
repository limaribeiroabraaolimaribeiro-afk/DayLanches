-- Executar manualmente no Supabase SQL Editor.
--
-- Adiciona a coluna usada para marcar quando a comanda de um pedido
-- foi impressa pela última vez (Gestão > Pedidos > "Imprimir comanda").
--
-- É seguro rodar mais de uma vez: "if not exists" evita erro caso a
-- coluna já tenha sido criada antes.

alter table public.orders
add column if not exists printed_at timestamptz;
