-- Adiciona coluna table_number para controle de mesas no balcão
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS table_number INTEGER;

NOTIFY pgrst, 'reload schema';
