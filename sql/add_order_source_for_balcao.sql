-- Adiciona coluna order_source para diferenciar pedidos do site e do balcão
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS order_source TEXT DEFAULT 'site';

-- Pedidos existentes são do site
-- Pedidos presenciais usarão order_source = 'balcao'
