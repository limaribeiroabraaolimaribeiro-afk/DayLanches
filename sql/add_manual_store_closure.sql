-- Fechamento manual da loja por um dia (Gestão → "Fechar loja hoje").
--
-- Reaproveita a tabela store_settings já existente (linha única id='store',
-- já lida publicamente pelo site e editada pela Gestão autenticada) em vez
-- de criar tabela nova. manual_closed_date guarda só o DIA (date, sem hora)
-- em que a loja foi fechada manualmente; quando a data de hoje (America/
-- Sao_Paulo) bate com manual_closed_date, o site trata a loja como fechada,
-- com prioridade sobre o horário semanal normal. Não precisa ser limpo à
-- meia-noite — basta parar de ter efeito fora daquele dia (a comparação de
-- data já garante isso). Reabrir/fechar de novo apenas sobrescreve os
-- valores.
--
-- ADD COLUMN IF NOT EXISTS é suficiente aqui (sem necessidade de bloco DO $$
-- com backfill, como em outras migrations deste projeto) porque os valores
-- default como NULL já representam corretamente "nenhum fechamento manual
-- ativo" — não há dado existente para transformar.
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS manual_closed_date date,
  ADD COLUMN IF NOT EXISTS manual_closed_message text,
  ADD COLUMN IF NOT EXISTS manual_closed_at timestamptz;

NOTIFY pgrst, 'reload schema';
