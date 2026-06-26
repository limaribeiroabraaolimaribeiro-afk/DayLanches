-- Migration: Adiciona suporte ao Print Agent
-- Coluna printed_at para controlar impressão automática de comandas

ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS printed_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
