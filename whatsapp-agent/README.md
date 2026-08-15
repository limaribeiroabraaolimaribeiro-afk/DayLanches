# Day Lanches — WhatsApp Agent

Processo Node.js que roda 24h na VPS (via PM2) e cuida do **atendimento
automático por menu** (opções 1-5, consulta de pedido, transferência para
atendente humano).

## O que este processo NÃO faz

- **Não abre conexão WhatsApp própria.** A sessão WhatsApp (QR Code,
  reconexão, persistência) é responsabilidade exclusiva do container
  `evolution-api` (veja [../infra/evolution/](../infra/evolution/)). Este
  agente só recebe webhooks da Evolution e responde via REST.
- **Não imprime comandas.** Isso continua sendo o [../print-agent/](../print-agent/),
  rodando no computador da loja — não foi alterado por este agente.
- **Não envia notificação de status de pedido** (em preparo/saiu/pronto). Isso
  já é feito diretamente pelo Worker Cloudflare quando a Evolution API está
  configurada nos secrets do Worker — ver `worker/index.js`.

Ou seja: este processo cobre especificamente a parte que hoje só funciona com
o computador da loja ligado — o robô de atendimento (`chat-bot-service.js`
dentro do `print-agent`).

## Pré-requisitos na VPS

- Ubuntu 24.04
- Node.js 22 e npm
- PM2 instalado globalmente (`npm install -g pm2`)
- Evolution API já rodando (ver [../infra/evolution/README.md](../infra/evolution/README.md), passos 1-8)

## Instalação

```bash
cd ~/DayLanches/whatsapp-agent
cp .env.example .env
nano .env
```

Preencha no `.env`:

| Variável | Onde encontrar |
|---|---|
| `EVOLUTION_API_URL` | mesma URL do `infra/evolution` (ex: `https://evolution.daylanches.com.br`) |
| `EVOLUTION_API_KEY` | mesma chave gerada em `infra/evolution/.env` |
| `EVOLUTION_INSTANCE` | mesmo `INSTANCE_NAME` do `infra/evolution/.env` |
| `WORKER_URL` | URL do Worker Cloudflare (já usada pelo print-agent) |
| `DAYLANCHES_AGENT_TOKEN` | **o mesmo valor** já configurado como `PRINT_AGENT_TOKEN` no Worker (`wrangler secret put PRINT_AGENT_TOKEN`) — não é um token novo |

```bash
npm install --omit=dev
```

## Rodar com PM2

Este projeto já tem `ecosystem.config.js` pronto. Os comandos abaixo só afetam
o processo `day-lanches-agent` — **nunca** rode `pm2 kill` ou mexa em outros
apps que já existam na VPS.

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup     # siga a instrução impressa (comando com sudo) para o PM2
                 # sobreviver a reinicializações da VPS
```

Verificar que subiu:

```bash
pm2 list
# deve mostrar: day-lanches-agent   online

pm2 logs day-lanches-agent --lines 50
```

## Firewall (obrigatório)

O agente escuta na porta `3001` (configurável em `.env`) em `0.0.0.0`, porque o
container Docker da Evolution precisa alcançá-lo via `host.docker.internal`.
Isso significa que, sem firewall, a porta ficaria acessível pela internet.
Bloqueie o acesso externo, liberando apenas a rede interna do Docker:

```bash
# Descubra a subnet da rede do Docker usada pela Evolution:
docker network inspect evolution-net --format '{{(index .IPAM.Config 0).Subnet}}'
# Exemplo de saída: 172.20.0.0/16

sudo ufw allow from 172.20.0.0/16 to any port 3001 proto tcp
sudo ufw deny 3001/tcp
sudo ufw status
```

(Ajuste `172.20.0.0/16` para a subnet real retornada pelo comando acima.)

## Registrar o webhook na Evolution API

Depois que o agente estiver `online` no PM2 e o firewall configurado, registre
o webhook (a partir da pasta `infra/evolution`):

```bash
cd ~/DayLanches/infra/evolution
./scripts/set-webhook.sh
```

## Primeira autenticação do WhatsApp

A autenticação (QR Code) acontece **na Evolution API**, não neste agente:

1. No painel de Gestão do Day Lanches, vá em **Configurações > WhatsApp Automático**.
2. Clique em **Gerar QR Code**.
3. No celular da loja: WhatsApp > Aparelhos conectados > Conectar aparelho > escaneie.
4. Status muda para conectado.

Alternativa via terminal (sem precisar do painel):

```bash
curl https://evolution.daylanches.com.br/instance/connect/daylanches \
  -H "apikey: SUA_EVOLUTION_API_KEY"
```

## Verificar persistência da sessão

A sessão fica no Postgres/Redis da Evolution (containers Docker,
`restart: unless-stopped`), **não** neste processo PM2. Por isso:

```bash
pm2 restart day-lanches-agent   # não afeta a sessão do WhatsApp — este
                                  # processo não guarda credenciais de sessão
```

Para confirmar que a sessão sobrevive a um restart real da VPS:

```bash
sudo reboot
# aguarde a VPS voltar, depois:
docker compose -f ~/DayLanches/infra/evolution/docker-compose.yml ps
pm2 list
curl -s http://localhost:3001/health/evolution
# state deve voltar como "open" sem pedir novo QR Code
```

## Testar o agente

```bash
curl http://localhost:3001/health
curl http://localhost:3001/health/evolution
```

Teste de ponta a ponta: mande "oi" de um celular pessoal para o WhatsApp da
loja. Deve chegar o menu (opções 1-5). Acompanhe em tempo real:

```bash
pm2 logs day-lanches-agent
```

## Logs

O agente usa as tags `[AGENT]`, `[WHATSAPP]`, `[PEDIDO]` e `[BOT]`. Nenhum
log grava token completo, senha ou o corpo integral de mensagens de clientes
— apenas números de telefone (necessários para diagnosticar qual conversa
está em andamento) e metadados de evento.

## Atualizar o código

```bash
cd ~/DayLanches
git pull
cd whatsapp-agent
npm install --omit=dev
pm2 restart day-lanches-agent
```
