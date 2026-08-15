'use strict';

require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`[AGENT] Variavel de ambiente obrigatoria ausente: ${name}. Configure o .env (veja .env.example).`);
    process.exit(1);
  }
  return value;
}

const config = {
  port: Number(process.env.PORT || 3001),
  host: process.env.HOST || '0.0.0.0',

  evolutionApiUrl: required('EVOLUTION_API_URL').replace(/\/+$/, ''),
  evolutionApiKey: required('EVOLUTION_API_KEY'),
  evolutionInstance: required('EVOLUTION_INSTANCE'),

  workerUrl: required('WORKER_URL').replace(/\/+$/, ''),
  agentToken: required('DAYLANCHES_AGENT_TOKEN'),

  botEnabled: process.env.BOT_ENABLED !== 'false',
  botBusinessHours: process.env.BOT_BUSINESS_HOURS || 'Quarta a domingo, das 17h30 as 23h',
  botMenuExpireHours: Number(process.env.BOT_MENU_EXPIRE_HOURS || 12),
  botHandoffPauseHours: Number(process.env.BOT_HANDOFF_PAUSE_HOURS || 4),

  sessionsFile: process.env.SESSIONS_FILE || './data/bot-sessions.json',
};

module.exports = config;
