-- Executar no Supabase SQL Editor
-- Adiciona colunas de pagamento e rastreio à tabela orders

-- Pagamento
alter table orders add column if not exists payment_provider text;
alter table orders add column if not exists payment_url      text;
alter table orders add column if not exists paid_amount      numeric(10,2);
alter table orders add column if not exists capture_method   text;
alter table orders add column if not exists transaction_nsu  text;
alter table orders add column if not exists receipt_url      text;
alter table orders add column if not exists paid_at          timestamptz;
alter table orders add column if not exists updated_at       timestamptz;

-- Rastreio e notificação WhatsApp
alter table orders add column if not exists tracking_token              uuid        default gen_random_uuid();
alter table orders add column if not exists whatsapp_opt_in             boolean     default false;
alter table orders add column if not exists customer_notified_at        timestamptz;
alter table orders add column if not exists customer_notification_error text;
