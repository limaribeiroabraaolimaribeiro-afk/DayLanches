'use strict';

/* Adaptado de print-agent/src/chat-bot-service.js — mesma logica de
   atendimento (menu, consulta de pedido, handoff humano), agora rodando
   como processo standalone na VPS em vez de dentro do Electron local.
   Mantido intencionalmente igual para nao mudar o comportamento que a
   loja ja conhece. */

const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

const MENU = `Olá! Seja bem-vindo ao Day Lanches 🍔\n\nDigite uma opção:\n\n1 - Ver cardápio\n2 - Acompanhar meu pedido\n3 - Horário de atendimento\n4 - Formas de pagamento\n5 - Falar com atendente`;

class ChatBotService extends EventEmitter {
  /**
   * @param {string} sessionsFile  - caminho para bot-sessions.json em disco
   * @param {() => object} getConfig - retorna configuracoes atuais
   * @param {(orderNum: string) => Promise<{order_number,status}|null>} fetchOrder
   */
  constructor(sessionsFile, getConfig, fetchOrder) {
    super();
    this.sessionsFile = sessionsFile;
    this.getConfig = getConfig;
    this.fetchOrder = fetchOrder;
    this.sessions = {};
    this.stats = { total: 0, lastReceivedAt: null };
    this._loadSessions();
  }

  /* ── Session persistence ── */

  _loadSessions() {
    try {
      if (fs.existsSync(this.sessionsFile)) {
        this.sessions = JSON.parse(fs.readFileSync(this.sessionsFile, 'utf8'));
      }
    } catch (_) {
      this.sessions = {};
    }
  }

  _saveSessions() {
    try {
      const dir = path.dirname(this.sessionsFile);
      if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.sessionsFile, JSON.stringify(this.sessions, null, 2), 'utf8');
    } catch (err) {
      console.error('[BOT] Erro ao salvar sessoes:', err.message);
    }
  }

  _getSession(phone) {
    if (!this.sessions[phone]) {
      const now = new Date().toISOString();
      this.sessions[phone] = {
        last_message_at: null,
        last_menu_sent_at: null,
        bot_paused_until: null,
        awaiting_order_number: false,
        created_at: now,
        updated_at: now,
      };
    }
    return this.sessions[phone];
  }

  _touchSession(phone, updates) {
    const s = this._getSession(phone);
    Object.assign(s, { ...updates, updated_at: new Date().toISOString() });
    this._saveSessions();
  }

  /* ── Main message handler ── */

  async handleMessage({ from, body, isGroup, isFromMe }) {
    const cfg = this.getConfig();

    if (!cfg.botEnabled) return null;
    if (isGroup || isFromMe) return null;
    if (from === 'status@broadcast') return null;

    const phone = from.replace('@s.whatsapp.net', '');
    const now = new Date();

    this.stats.total++;
    this.stats.lastReceivedAt = now.toISOString();

    this._touchSession(phone, { last_message_at: now.toISOString() });
    const session = this._getSession(phone);

    /* Robô pausado para esse contato (human takeover) */
    if (session.bot_paused_until) {
      if (new Date(session.bot_paused_until) > now) {
        this._log(`Mensagem de ${phone} ignorada (atendente assumiu).`, 'info');
        return null;
      }
      /* Pausa expirou → reativar robô */
      this._touchSession(phone, { bot_paused_until: null });
    }

    /* Expiração de sessão */
    const expireMs = (cfg.botMenuExpireHours || 12) * 3600000;
    const expired =
      !session.last_menu_sent_at ||
      now - new Date(session.last_menu_sent_at) >= expireMs;

    /* Aguardando número do pedido (opção 2 já foi escolhida) */
    if (session.awaiting_order_number && !expired) {
      const orderNum = (body || '').trim().toUpperCase();
      this._touchSession(phone, { awaiting_order_number: false });
      const reply = await this._lookupOrder(orderNum);
      this._log(`Consulta de pedido "${orderNum}" por ${phone}.`, 'info');
      return { jid: from, text: reply };
    }

    /* Sessão nova ou expirada → enviar menu */
    if (expired) {
      this._touchSession(phone, {
        last_menu_sent_at: now.toISOString(),
        awaiting_order_number: false,
      });
      this._log(`Menu inicial enviado para ${phone}.`, 'success');
      return { jid: from, text: MENU };
    }

    /* Processar escolha do menu */
    const choice = (body || '').trim();
    let reply;

    switch (choice) {
      case '1':
        reply =
          `Aqui está nosso cardápio 🍔\n` +
          `https://www.daylanches.com.br\n\n` +
          `Faça seu pedido pelo site e envie sua localização para calcular a entrega.`;
        break;

      case '2':
        reply =
          `Para acompanhar seu pedido, envie o número do pedido.\n\n` +
          `Exemplo:\nDL-12345`;
        this._touchSession(phone, { awaiting_order_number: true });
        break;

      case '3': {
        const hours = cfg.botBusinessHours || 'Quarta a domingo, das 17h30 às 23h';
        reply = `Nosso horário de atendimento é:\n${hours}.`;
        break;
      }

      case '4':
        reply =
          `Aceitamos Pix, cartão e dinheiro.\n\n` +
          `No pedido pelo site você consegue escolher a forma de pagamento disponível.`;
        break;

      case '5': {
        const pauseH = cfg.botHandoffPauseHours || 4;
        const until = new Date(now.getTime() + pauseH * 3600000);
        this._touchSession(phone, { bot_paused_until: until.toISOString() });
        reply = `Certo, vou chamar um atendente para te ajudar 😊`;
        this._log(
          `Robô pausado para ${phone} até ${until.toLocaleTimeString('pt-BR')} (${pauseH}h).`,
          'warn'
        );
        break;
      }

      default:
        reply = `Não entendi. Digite uma opção de 1 a 5.`;
    }

    this._log(`Opção "${choice}" de ${phone} → respondido.`, 'info');
    return { jid: from, text: reply };
  }

  /* ── Order lookup (opção 2) ── */

  async _lookupOrder(orderNum) {
    if (!orderNum) {
      return `Número de pedido não identificado. Envie no formato DL-12345.`;
    }

    if (!this.fetchOrder) {
      return (
        `Acompanhe o pedido ${orderNum} em:\n` +
        `https://www.daylanches.com.br`
      );
    }

    try {
      const data = await this.fetchOrder(orderNum);
      if (!data) {
        return `Pedido ${orderNum} não encontrado. Verifique o número e tente novamente.`;
      }

      const labels = {
        novo:                'Novo — aguardando preparo',
        aguardando_pagamento: 'Aguardando pagamento',
        em_preparo:          'Em preparo 🍳',
        saiu_para_entrega:   'Saiu para entrega 🛵',
        pronto:              'Pronto para retirada ✅',
        finalizado:          'Finalizado ✅',
        cancelado:           'Cancelado ❌',
      };

      const label = labels[data.status] || data.status;
      return `Pedido *${data.order_number}*\nStatus: ${label}`;
    } catch (_) {
      return `Não consegui consultar agora. Tente novamente em instantes.`;
    }
  }

  /* ── Public API ── */

  getStats() {
    const activeSessions = Object.values(this.sessions).filter(s => {
      if (!s.last_message_at) return false;
      const ms = Date.now() - new Date(s.last_message_at).getTime();
      return ms < 24 * 3600000;
    }).length;

    return {
      total: this.stats.total,
      lastReceivedAt: this.stats.lastReceivedAt,
      sessionCount: activeSessions,
    };
  }

  clearSessions() {
    this.sessions = {};
    this._saveSessions();
    this._log('Sessões do robô limpas.', 'warn');
  }

  /* ── Internal ── */

  _log(msg, level) {
    this.emit('log', msg, level || 'info');
  }
}

module.exports = ChatBotService;
