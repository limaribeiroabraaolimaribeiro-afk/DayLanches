-- Colunas necessárias para o módulo Balcão (pedido presencial + mesas)
-- Execute este SQL no Supabase SQL Editor antes de usar o Balcão

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS order_source TEXT DEFAULT 'site';

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS table_number INTEGER;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ;

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS customer_address_text TEXT;

NOTIFY pgrst, 'reload schema';
