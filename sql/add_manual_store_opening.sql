-- Abertura manual excepcional da loja por um dia (Gestão → "Abrir loja
-- hoje") — contraparte de add_manual_store_closure.sql.
--
-- Reaproveita a MESMA linha única de store_settings (id='store', já lida
-- publicamente pelo site e editada pela Gestão autenticada) em vez de criar
-- tabela nova — mesmo padrão já usado pelo fechamento manual. manual_open_date
-- guarda só o DIA (date, sem hora) em que a Dayane decidiu abrir
-- excepcionalmente; manual_open_from/manual_open_to guardam o horário daquela
-- abertura (independente do horário semanal salvo em store_settings.schedule,
-- que não é alterado por isto). Quando a data de hoje (America/Sao_Paulo)
-- bate com manual_open_date, o site usa esse intervalo em vez do horário
-- semanal para decidir se está aberto — com prioridade MENOR que
-- manual_closed_date (fechamento manual sempre vence, ver isStoreOpenNow()
-- em script.js). Não precisa ser limpo à meia-noite — basta parar de ter
-- efeito fora daquele dia (a comparação de data já garante isso). Abrir de
-- novo apenas sobrescreve os valores; cancelar limpa as 5 colunas.
--
-- ADD COLUMN IF NOT EXISTS é suficiente aqui (sem necessidade de bloco DO $$
-- com backfill, como em outras migrations deste projeto) porque os valores
-- default como NULL já representam corretamente "nenhuma abertura manual
-- ativa" — não há dado existente para transformar.
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS manual_open_date date,
  ADD COLUMN IF NOT EXISTS manual_open_from time,
  ADD COLUMN IF NOT EXISTS manual_open_to time,
  ADD COLUMN IF NOT EXISTS manual_open_message text,
  ADD COLUMN IF NOT EXISTS manual_open_at timestamptz;

NOTIFY pgrst, 'reload schema';
