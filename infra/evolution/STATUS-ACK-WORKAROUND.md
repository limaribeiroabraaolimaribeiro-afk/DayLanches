# Workaround de recebimento — Evolution API 2.3.7

**Status:** experimental. Preparado em uma branch isolada. Não é ativado pelo `docker-compose.yml` padrão.

## Por quê

Na v2.3.7, o Baileys 7.0.0-rc.9 pode não reconhecer/confirmar stanzas
`<status>`. O servidor encerra a conexão com `stream errored out` e
`ack class="status"`, enquanto a instância pode continuar exibindo
`state=open` e não emite `MESSAGES_UPSERT`. O caso foi relatado em
https://github.com/evolution-foundation/evolution-api/issues/2778
e a correção de origem está em
https://github.com/WhiskeySockets/Baileys/pull/2866

Este patch replica **somente** o registro do handler de ACK. A criação
de imagem falha caso a versão ou as âncoras do código não correspondam.

## Deploy controlado (somente em janela autorizada)

1. Faça backup dos dados da Evolution e confirme que a sessão está conectada.
   Preserve o backup do webhook e as credenciais sem colocá-los no Git.
2. Na pasta `infra/evolution`, valide o arquivo de composição antes de subir:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.status-ack.yml config --quiet
   docker compose -f docker-compose.yml -f docker-compose.status-ack.yml build evolution-api
   ```

   Se a compilação falhar, **não** reinicie o serviço nem force o patch.
3. Com autorização para uma breve interrupção do WhatsApp, use:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.status-ack.yml up -d --no-deps evolution-api
   ```

   Não rode `down -v`, não exclua a instância e não apague volumes.
4. Confirme a conexão `state=open`, webhook ativado e evento
   `MESSAGES_UPSERT`. Envie **Oi**, **1**, **2**, **3**, **1** de um celular
   externo; confira o recebimento e a resposta nos logs.
5. Acompanhe eventuais ocorrências de `stream errored out` com
   `ack class=status` durante o funcionamento.

## Rollback

Se o comportamento piorar, restabeleça a imagem original:

```bash
docker compose -f docker-compose.yml up -d --no-deps evolution-api
```

Os volumes da Evolution ficam preservados. A conexão poderá interromper
temporariamente no deploy ou rollback; valide `state=open` e o webhook.
Não use `docker compose down -v`.

## Limites

Isso não substitui o diagnóstico de todas as causas de webhook ausente.
Se o `node --check` ou as verificações de versão falharem, revise a
compatibilidade antes de modificar a imagem. Troque o workaround por
uma versão oficial corrigida do Baileys/Evolution quando estiver disponível
e testada.
