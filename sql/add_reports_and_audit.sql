-- ============================================================
-- Day Lanches — Relatórios e Auditoria
-- Execute este SQL no Supabase (SQL Editor)
-- ============================================================

-- 1. Tabela de auditoria
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id   uuid,
  actor_email     text,
  actor_name      text,
  action          text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       text,
  entity_label    text,
  reason          text,
  metadata        jsonb DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at    ON public.audit_logs (created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_user_id ON public.audit_logs (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_email   ON public.audit_logs (actor_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action        ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type   ON public.audit_logs (entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_id     ON public.audit_logs (entity_id);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can read audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (true);

-- 2. Colunas de cancelamento na tabela orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_at          timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_by_user_id  uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancelled_by_email    text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cancel_reason         text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deleted_at            timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deleted_by_user_id    uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deleted_by_email      text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delete_reason         text;

-- 3. Colunas de rastreamento de quem fez o quê
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_by_user_id   uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_by_email     text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_by_user_id      uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_by_email        text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS handled_by_user_id   uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS handled_by_email     text;
