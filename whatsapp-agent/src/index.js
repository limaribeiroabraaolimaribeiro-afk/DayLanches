'use strict';

const http = require('http');
const path = require('path');

const config = require('./config');
const EvolutionClient = require('./evolution-client');
const parseEvolutionMessage = require('./parse-evolution-message');
const ChatBotService = require('./chat-bot-service');
const makeOrderLookup = require('./order-lookup');

const MAX_BODY_BYTES = 1024 * 1024; /* 1MB — mensagem de texto nao chega perto disso */

function log(tag, msg) {
  const time = new Date().toLocaleTimeString('pt-BR');
  console.log(`[${time}] [${tag}] ${msg}`);
}

const evolution = new EvolutionClient({
  apiUrl: config.evolutionApiUrl,
  apiKey: config.evolutionApiKey,
  instance: config.evolutionInstance,
});

const fetchOrderFromWorker = makeOrderLookup({
  workerUrl: config.workerUrl,
  agentToken: config.agentToken,
});

const chatBot = new ChatBotService(
  path.resolve(config.sessionsFile),
  () => ({
    botEnabled: config.botEnabled,
    botBusinessHours: config.botBusinessHours,
    botMenuExpireHours: config.botMenuExpireHours,
    botHandoffPauseHours: config.botHandoffPauseHours,
  }),
  fetchOrderFromWorker
);

chatBot.on('log', (msg, level) => log('BOT', `${level === 'error' ? '⚠ ' : ''}${msg}`));

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('payload_too_large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

/* ── POST /webhook/evolution ──
   Recebe eventos da Evolution API (configurados via infra/evolution/scripts/set-webhook.sh).
   Responde 200 rapido sempre que possivel para evitar retries em cascata da Evolution;
   qualquer erro fica restrito ao processamento da mensagem, nunca derruba o servidor. */
async function handleWebhook(req, res) {
  let payload;
  try {
    payload = await readJsonBody(req);
  } catch (err) {
    log('WHATSAPP', `Webhook com corpo invalido: ${err.message}`);
    return sendJson(res, 400, { error: 'invalid_body' });
  }

  /* Nao validamos payload.apikey aqui: em producao a Evolution (v2.3.7) envia nesse
     campo um valor diferente de EVOLUTION_API_KEY, o que rejeitava mensagens legitimas
     ("Webhook rejeitado: apikey nao confere"). A protecao do endpoint fica por conta do
     firewall (porta 3001 liberada so para a subnet do Docker — ver whatsapp-agent/README.md). */

  if (payload.instance && payload.instance !== config.evolutionInstance) {
    /* Evento de outra instancia (nao deveria acontecer nesta VPS) — ignora sem erro. */
    return sendJson(res, 200, { ok: true, ignored: 'other_instance' });
  }

  /* Responde imediatamente; processa a mensagem depois, sem bloquear a Evolution. */
  sendJson(res, 200, { ok: true });

  /* A Evolution API usa "MESSAGES_UPSERT" (v2, maiusculo com underscore) mas
     alguns proxies/versoes reencaminham como "messages.upsert" — aceita ambos. */
  const event = payload.event || '';
  if (!/messages[._]?upsert/i.test(event)) return;

  const items = Array.isArray(payload.data) ? payload.data : [payload.data];

  for (const item of items) {
    try {
      const parsed = parseEvolutionMessage(item);
      if (!parsed) continue;

      log('PEDIDO', `Mensagem recebida de ${EvolutionClient.jidToNumber(parsed.from)}.`);

      const reply = await chatBot.handleMessage(parsed);
      if (reply) {
        await evolution.sendText(reply.jid, reply.text);
        log('PEDIDO', `Resposta enviada para ${EvolutionClient.jidToNumber(reply.jid)}.`);
      }
    } catch (err) {
      /* Falha em UMA mensagem nao derruba o processo nem afeta as demais. */
      log('WHATSAPP', `Erro ao processar mensagem: ${err.message}`);
    }
  }
}

async function handleHealth(req, res) {
  sendJson(res, 200, {
    ok: true,
    service: 'day-lanches-whatsapp-agent',
    botEnabled: config.botEnabled,
    stats: chatBot.getStats(),
  });
}

async function handleHealthEvolution(req, res) {
  try {
    const state = await evolution.getConnectionState();
    sendJson(res, 200, { ok: true, instance: config.evolutionInstance, ...state });
  } catch (err) {
    sendJson(res, 200, { ok: false, error: err.message });
  }
}

const server = http.createServer((req, res) => {
  const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && pathname === '/health') {
    return handleHealth(req, res);
  }
  if (req.method === 'GET' && pathname === '/health/evolution') {
    return handleHealthEvolution(req, res);
  }
  if (req.method === 'POST' && pathname === '/webhook/evolution') {
    return handleWebhook(req, res).catch((err) => {
      log('WHATSAPP', `Erro inesperado no webhook: ${err.message}`);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal_error' });
    });
  }

  sendJson(res, 404, { error: 'not_found' });
});

server.on('error', (err) => {
  log('AGENT', `Erro no servidor HTTP: ${err.message}`);
});

server.listen(config.port, config.host, () => {
  log('AGENT', `Day Lanches WhatsApp Agent ouvindo em ${config.host}:${config.port}`);
  log('AGENT', `Instancia Evolution: ${config.evolutionInstance} | Robô: ${config.botEnabled ? 'ativo' : 'desativado'}`);
});

/* Nao derruba o processo por erro isolado — deixa o PM2 cuidar de crashes reais */
process.on('unhandledRejection', (err) => {
  log('AGENT', `unhandledRejection: ${err?.message || err}`);
});
process.on('uncaughtException', (err) => {
  log('AGENT', `uncaughtException: ${err?.message || err}`);
});
