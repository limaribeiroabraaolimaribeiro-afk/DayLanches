-- ============================================================
-- Day Lanches — Módulos Empresariais
-- Execute este SQL no Supabase (SQL Editor)
-- ============================================================

-- ══════════════════════════════════════
-- 1. FECHAMENTO DE CAIXA
-- ══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.cash_closings (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opened_at             timestamptz DEFAULT now(),
  closed_at             timestamptz,
  opened_by_user_id     uuid,
  opened_by_email       text,
  closed_by_user_id     uuid,
  closed_by_email       text,
  opening_amount        numeric DEFAULT 0,
  cash_sales_total      numeric DEFAULT 0,
  pix_sales_total       numeric DEFAULT 0,
  card_sales_total      numeric DEFAULT 0,
  online_sales_total    numeric DEFAULT 0,
  delivery_fee_total    numeric DEFAULT 0,
  expenses_total        numeric DEFAULT 0,
  withdrawals_total     numeric DEFAULT 0,
  supplies_total        numeric DEFAULT 0,
  expected_cash_amount  numeric DEFAULT 0,
  counted_cash_amount   numeric,
  difference_amount     numeric,
  status                text DEFAULT 'aberto',
  notes                 text,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE public.cash_closings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage cash_closings" ON public.cash_closings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════
-- 2. DESPESAS
-- ══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.expenses (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date        date DEFAULT current_date,
  category            text NOT NULL,
  description         text NOT NULL,
  amount              numeric NOT NULL DEFAULT 0,
  payment_method      text,
  status              text DEFAULT 'ativo',
  cancelled_reason    text,
  created_by_user_id  uuid,
  created_by_email    text,
  notes               text,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage expenses" ON public.expenses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════
-- 3. ESTOQUE
-- ══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.inventory_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,
  category            text,
  unit                text DEFAULT 'un',
  current_quantity    numeric DEFAULT 0,
  minimum_quantity    numeric DEFAULT 0,
  cost_price          numeric DEFAULT 0,
  linked_product_id   uuid,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage inventory_items" ON public.inventory_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.inventory_movements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id   uuid REFERENCES public.inventory_items(id),
  movement_type       text NOT NULL,
  quantity            numeric NOT NULL,
  reason              text,
  related_order_id    uuid,
  created_by_user_id  uuid,
  created_by_email    text,
  created_at          timestamptz DEFAULT now(),
  metadata            jsonb DEFAULT '{}'
);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage inventory_movements" ON public.inventory_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════
-- 4. ENTREGADORES
-- ══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.delivery_drivers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  phone       text,
  is_active   boolean DEFAULT true,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.delivery_drivers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage delivery_drivers" ON public.delivery_drivers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════
-- 5. LOGS DE EXPORTAÇÃO
-- ══════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.export_logs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  export_type         text NOT NULL,
  exported_by_user_id uuid,
  exported_by_email   text,
  created_at          timestamptz DEFAULT now(),
  metadata            jsonb DEFAULT '{}'
);

ALTER TABLE public.export_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users manage export_logs" ON public.export_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ══════════════════════════════════════
-- 6. COLUNAS EXTRAS EM ORDERS
-- ══════════════════════════════════════

-- Descontos, estornos e cortesias
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount      numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_reason      text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_by_user_id  uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_by_email    text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_at          timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_by_user_id  uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_by_email    text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_amount        numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_reason        text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courtesy_amount      numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courtesy_reason      text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courtesy_by_user_id  uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS courtesy_by_email    text;

-- Tempo de atendimento
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS accepted_at          timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS preparing_at         timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS ready_at             timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS out_for_delivery_at  timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivered_at         timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS finished_at          timestamptz;

-- Entregador
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS driver_id            uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS driver_name          text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_started_at  timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_completed_at timestamptz;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS driver_fee           numeric DEFAULT 0;

-- ══════════════════════════════════════
-- 7. COLUNAS EXTRAS EM PROFILES
-- ══════════════════════════════════════
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role      text DEFAULT 'funcionario';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- ══════════════════════════════════════
-- 8. AUDITORIA AVANÇADA
-- ══════════════════════════════════════
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS source     text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS ip_address text;
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS user_agent text;
