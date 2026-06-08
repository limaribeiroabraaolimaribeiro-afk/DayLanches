-- Executar no Supabase SQL Editor
-- Adiciona colunas de pagamento à tabela orders

alter table orders add column if not exists payment_provider text;
alter table orders add column if not exists payment_url      text;
alter table orders add column if not exists paid_amount      numeric(10,2);
alter table orders add column if not exists capture_method   text;
alter table orders add column if not exists transaction_nsu  text;
alter table orders add column if not exists receipt_url      text;
alter table orders add column if not exists paid_at          timestamptz;
alter table orders add column if not exists updated_at       timestamptz;
