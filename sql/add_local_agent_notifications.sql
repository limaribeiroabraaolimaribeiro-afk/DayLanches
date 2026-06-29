-- ============================================================
-- Day Lanches — Notificações para agente local (WhatsApp)
-- Execute este SQL no Supabase (SQL Editor)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.order_notifications (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          uuid        NOT NULL,
  order_number      text,
  customer_name     text,
  customer_phone    text,
  status            text        NOT NULL,
  message           text        NOT NULL,
  tracking_link     text,
  channel           text        DEFAULT 'whatsapp_local',
  status_send       text        DEFAULT 'pendente',
  attempts          integer     DEFAULT 0,
  sent_at           timestamptz,
  failed_at         timestamptz,
  error_message     text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_notifications_pending
  ON public.order_notifications (status_send)
  WHERE status_send = 'pendente';

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_notifications_no_dup
  ON public.order_notifications (order_id, status)
  WHERE status_send IN ('pendente', 'enviado');

ALTER TABLE public.order_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on order_notifications"
  ON public.order_notifications
  FOR ALL
  USING (true)
  WITH CHECK (true);
