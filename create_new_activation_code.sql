-- Executar manualmente no Supabase SQL Editor quando precisar liberar
-- um novo código de segurança para criação de acesso da loja.
--
-- Use isso quando, por exemplo:
--   * a dona perdeu o acesso e precisa criar a conta de novo
--   * precisa criar outro admin
--   * precisa liberar um acesso temporário
--
-- O código de ativação é de USO ÚNICO: depois que alguém criar uma
-- conta com ele, a função consume_admin_activation_code() marca
-- is_active = false e o código deixa de funcionar.
--
-- O código real NUNCA é salvo em texto puro — apenas o hash bcrypt.

-- 1) Troque o texto abaixo ('NOVO-CODIGO-AQUI') pelo novo código real
--    que será informado à pessoa que vai criar o acesso.
-- 2) Rode este comando no SQL Editor do Supabase.
-- 3) Apague/limpe o editor depois de rodar, para não deixar o código
--    real registrado em históricos ou logs.

insert into admin_activation_codes (code_hash, is_active, used_at, used_by_email)
values (crypt('NOVO-CODIGO-AQUI', gen_salt('bf')), true, null, null);
