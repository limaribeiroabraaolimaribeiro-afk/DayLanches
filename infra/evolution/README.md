# Day Lanches — Evolution API (WhatsApp Automático)

Infraestrutura Docker para rodar a Evolution API em VPS própria, com HTTPS automático via Caddy.

A Evolution API envia mensagens automáticas de WhatsApp quando o status do pedido muda (em preparo, saiu para entrega, finalizado, cancelado).

## Arquitetura

```
Cliente WhatsApp ← Evolution API ← Worker Cloudflare ← Gestão Day Lanches
                   (VPS Docker)    (chama Evolution)    (altera status)
```

- **Gestão** altera o status do pedido
- **Worker** recebe a mudança e chama a Evolution API
- **Evolution API** envia a mensagem via WhatsApp
- A Gestão **nunca** chama a Evolution API diretamente

## Requisitos

- VPS Ubuntu 22.04 ou 24.04
- Mínimo 1 vCPU e 2 GB RAM
- Acesso SSH (root ou sudo)
- Domínio/subdomínio apontando para a VPS
- Portas 80 e 443 liberadas no firewall

## Passo 1 — DNS

No painel do seu DNS (Cloudflare, Registro.br, etc.), crie o registro:

| Tipo | Nome        | Valor        | Proxy               |
|------|-------------|--------------|----------------------|
| A    | evolution   | IP_DA_VPS    | DNS Only (recomendado) |

O subdomínio padrão é `evolution.daylanches.com.br`. Pode ser alterado na variável `DOMAIN`.

> **Cloudflare:** use DNS Only (nuvem cinza) inicialmente. O proxy (nuvem laranja) pode interferir com WebSocket e QR Code. Depois de tudo funcionando, teste ativar o proxy se quiser.

## Passo 2 — Acessar a VPS

```bash
ssh root@IP_DA_VPS
```

## Passo 3 — Clonar o projeto e instalar Docker

```bash
git clone https://github.com/limaribeiroabraaolimaribeiro-afk/DayLanches.git
cd DayLanches/infra/evolution

chmod +x scripts/*.sh
sudo ./scripts/install-docker.sh
```

## Passo 4 — Configurar .env

```bash
cp .env.example .env
nano .env
```

Preencha:

| Variável              | O que colocar                          |
|-----------------------|----------------------------------------|
| `DOMAIN`              | Seu subdomínio (ex: `evolution.daylanches.com.br`) |
| `EVOLUTION_API_KEY`   | Chave aleatória longa — gere com `openssl rand -base64 32` |
| `POSTGRES_PASSWORD`   | Senha forte — gere com `openssl rand -base64 24` |
| `REDIS_PASSWORD`      | Senha forte — gere com `openssl rand -base64 24` |
| `INSTANCE_NAME`       | Nome da instância (padrão: `daylanches`) |

**Nunca commite o arquivo `.env` real.**

## Passo 5 — Subir a stack

```bash
docker compose up -d
```

Ou use o script:

```bash
./scripts/deploy.sh
```

Aguarde ~30 segundos para tudo iniciar.

## Passo 6 — Verificar logs

```bash
docker compose logs -f evolution-api
```

Ou:

```bash
./scripts/logs.sh
```

Procure por `HTTP server running` para confirmar que está online.

## Passo 7 — Testar URL

Abra no navegador:

```
https://evolution.daylanches.com.br
```

Se o HTTPS funcionar e a API responder, está tudo certo.

## Passo 8 — Criar e conectar instância

A instância padrão será: `daylanches`

### Criar instância

```bash
curl -X POST https://evolution.daylanches.com.br/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: SUA_EVOLUTION_API_KEY" \
  -d '{
    "instanceName": "daylanches",
    "integration": "WHATSAPP-BAILEYS",
    "qrcode": true
  }'
```

### Obter QR Code para conectar

```bash
curl https://evolution.daylanches.com.br/instance/connect/daylanches \
  -H "apikey: SUA_EVOLUTION_API_KEY"
```

A resposta contém o QR Code em base64. Escaneie com o WhatsApp da loja (WhatsApp > Aparelhos conectados > Conectar aparelho).

> Você também pode usar o painel da Gestão Day Lanches (Configurações > WhatsApp Automático) para gerar o QR Code.

## Passo 9 — Configurar o Worker

Com a Evolution API online, configure os secrets no Worker:

```bash
cd worker

npx wrangler secret put EVOLUTION_API_URL
# valor: https://evolution.daylanches.com.br

npx wrangler secret put EVOLUTION_API_KEY
# valor: a chave que você configurou no .env

npx wrangler secret put EVOLUTION_INSTANCE
# valor: daylanches

npx wrangler deploy
```

## Passo 10 — Testar no Day Lanches

1. Crie um pedido com telefone válido
2. Na Gestão, altere o status para **Em preparo**
3. Confirme que a mensagem chegou no WhatsApp do cliente
4. Altere para **Saiu para entrega** — confirme segunda mensagem
5. Altere novamente para **Saiu para entrega** — confirme que **não** envia duplicado
6. Cancele um pedido com motivo — confirme mensagem de cancelamento
7. Verifique `audit_logs` no Supabase

## Scripts disponíveis

| Script                  | O que faz                                    |
|-------------------------|----------------------------------------------|
| `scripts/install-docker.sh` | Instala Docker e Docker Compose          |
| `scripts/deploy.sh`    | Atualiza imagens e reinicia containers        |
| `scripts/logs.sh`      | Mostra logs da Evolution API em tempo real    |
| `scripts/restart.sh`   | Reinicia todos os containers                  |
| `scripts/backup.sh`    | Backup do banco PostgreSQL e configurações    |

## Checklist de testes

### Teste da Evolution API

- [ ] Containers rodando (`docker compose ps`)
- [ ] URL HTTPS acessível
- [ ] Instância criada
- [ ] QR Code gerado
- [ ] WhatsApp escaneado e conectado
- [ ] Mensagem de teste enviada pela Evolution

### Teste do Worker

- [ ] Secrets configurados (`EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`)
- [ ] Worker deployed (`npx wrangler deploy`)
- [ ] Rota `/whatsapp/status` retorna status
- [ ] Rota `/whatsapp/test-message` envia mensagem
- [ ] Logs do Worker: `wrangler tail`

### Teste completo Day Lanches

- [ ] Pedido criado com telefone válido
- [ ] Status "Em preparo" → mensagem enviada
- [ ] Status "Saiu para entrega" → mensagem enviada
- [ ] Status "Saiu para entrega" repetido → não duplica
- [ ] Status "Finalizado" → mensagem enviada
- [ ] Cancelamento com motivo → mensagem enviada
- [ ] `audit_logs` registra envios
- [ ] Painel WhatsApp Automático mostra "Conectado"

## Segurança e cuidados

- **Nunca commite** `.env` ou chaves de API no repositório
- **Nunca exponha** a `EVOLUTION_API_KEY` no frontend ou na Gestão
- **PostgreSQL e Redis** não têm portas expostas — só acessíveis internamente
- **Caddy** gera e renova certificados SSL automaticamente
- Se a chave vazar, troque `EVOLUTION_API_KEY` no `.env` e atualize o secret do Worker
- Se o WhatsApp desconectar, gere novo QR Code pelo painel ou API
- Mantenha a VPS atualizada: `apt update && apt upgrade -y`
- Faça backup periódico: `./scripts/backup.sh`
- Logs não contêm secrets — seguro para debug

## Ajuste de versão da Evolution API

Se a API mudar o endpoint de envio de mensagens em versões futuras, ajuste no arquivo `worker/index.js` a função `sendWhatsAppMessage()`. O endpoint atual é:

```
POST /message/sendText/{instanceName}
```

Body:
```json
{
  "number": "5547999999999",
  "text": "Mensagem aqui"
}
```

Header:
```
apikey: SUA_EVOLUTION_API_KEY
```
