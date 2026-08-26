-- Notificação automática de WhatsApp quando o pagamento online (InfinitePay)
-- é confirmado pelo webhook. Reaproveita o mesmo padrão das colunas
-- notified_preparing_at / notified_out_for_delivery_at / notified_ready_at /
-- notified_cancelled_at já existentes (add_order_notifications.sql) — serve
-- de proteção contra notificação duplicada (o mesmo pedido não recebe a
-- mensagem de "pagamento confirmado" duas vezes, mesmo que a InfinitePay
-- reenvie o mesmo webhook).
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS notified_payment_confirmed_at timestamptz;

NOTIFY pgrst, 'reload schema';
