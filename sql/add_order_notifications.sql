-- ============================================================
-- Day Lanches — Notificações de status do pedido
-- Execute este SQL no Supabase (SQL Editor)
-- ============================================================

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notified_preparing_at         timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notified_out_for_delivery_at  timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notified_ready_at             timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS notified_cancelled_at         timestamptz;
