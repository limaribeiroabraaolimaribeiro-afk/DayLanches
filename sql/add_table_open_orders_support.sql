-- Suporte a "comanda aberta" por mesa no Balcão (Gestão > Balcão).
-- Execute manualmente no Supabase SQL Editor antes de usar a nova
-- versão do Balcão.
--
-- IMPORTANTE: antes de rodar este arquivo, rode a consulta de
-- pré-checagem de duplicidade (fornecida à parte, só leitura). Se ela
-- retornar alguma linha, pare e resolva a duplicidade manualmente antes
-- de continuar — o CREATE UNIQUE INDEX abaixo vai falhar (com erro
-- claro, sem corromper nada) se já existir mais de uma comanda aberta
-- na mesma mesa.

-- Quantos itens do array `items` já foram enviados para impressão
-- (impressão manual em Pedidos ou automática via Print Agent). Serve
-- como ponteiro pra imprimir só os itens novos quando alguém adiciona
-- mais produtos a uma comanda de mesa já impressa — assume que `items`
-- só recebe itens no final (nunca é reordenado/editado depois de criado).
--
-- Envolvido num DO $$ que só cria a coluna e faz o backfill se a coluna
-- AINDA NÃO existir — assim o arquivo pode ser rodado de novo com
-- segurança a qualquer momento (inclusive depois que mesas já tiverem
-- itens adicionados pela funcionalidade nova) sem nunca refazer o
-- backfill e sem nunca fazer um item recém-adicionado, ainda não
-- impresso, parecer "já impresso".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'printed_items_count'
  ) THEN
    ALTER TABLE public.orders ADD COLUMN printed_items_count INTEGER NOT NULL DEFAULT 0;

    -- Backfill único: pedidos já impressos antes desta coluna existir não
    -- devem parecer "com itens pendentes de impressão" assim que ela surge.
    UPDATE public.orders
    SET printed_items_count = jsonb_array_length(COALESCE(items, '[]'::jsonb))
    WHERE printed_at IS NOT NULL;
  END IF;
END $$;

-- Garante, no banco, que só existe 1 comanda aberta (não paga, não
-- cancelada) por mesa — protege contra duplo clique / duas requisições
-- concorrentes tentando abrir a mesma mesa ao mesmo tempo. IS DISTINCT
-- FROM (em vez de <>/=) trata NULL como "diferente de", então pedidos
-- antigos com status ou payment_status NULL também contam como comanda
-- aberta (se ainda não estiverem pagos) em vez de escapar da checagem.
CREATE UNIQUE INDEX IF NOT EXISTS orders_one_open_table
  ON public.orders (table_number)
  WHERE order_source = 'balcao'
    AND table_number IS NOT NULL
    AND status IS DISTINCT FROM 'cancelado'
    AND payment_status IS DISTINCT FROM 'pago';

NOTIFY pgrst, 'reload schema';
