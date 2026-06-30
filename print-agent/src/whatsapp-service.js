'use strict';

const { EventEmitter } = require('events');
const path = require('path');
const fs = require('fs');

/* Extrai corpo de texto de uma mensagem Baileys */
function parseBaileysMessage(raw) {
  const jid = raw.key?.remoteJid || '';
  if (!jid || jid === 'status@broadcast') return null;

  const isGroup  = jid.endsWith('@g.us');
  const isFromMe = !!raw.key.fromMe;

  let m = raw.message;
  if (!m) return null;

  /* Desempacotar ephemeral / viewOnce */
  m = m.ephemeralMessage?.message
    || m.viewOnceMessage?.message
    || m.viewOnceMessageV2?.message
    || m;

  let body = '';
  let type = 'unknown';

  if (m.conversation)                  { body = m.conversation;              type = 'text';     }
  else if (m.extendedTextMessage?.text){ body = m.extendedTextMessage.text;  type = 'text';     }
  else if (m.imageMessage)             { body = m.imageMessage.caption || ''; type = 'image';   }
  else if (m.videoMessage)             { body = m.videoMessage.caption || ''; type = 'video';   }
  else if (m.audioMessage)             {                                       type = 'audio';   }
  else if (m.documentMessage)          {                                       type = 'document';}
  else if (m.stickerMessage)           {                                       type = 'sticker'; }

  return { from: jid, body, type, isGroup, isFromMe };
}

class WhatsAppService extends EventEmitter {
  constructor(authDir) {
    super();
    this.authDir = authDir;
    this.sock = null;
    this.status = 'disconnected';
    this.qrDataUrl = null;
    this._reconnectTimer = null;
    this._baileys = null;
    this._qrcode = null;
  }

  async _loadModules() {
    if (!this._baileys) {
      this._baileys = await import('@whiskeysockets/baileys');
    }
    if (!this._qrcode) {
      this._qrcode = require('qrcode');
    }
    return { baileys: this._baileys, QRCode: this._qrcode };
  }

  hasSession() {
    return fs.existsSync(path.join(this.authDir, 'creds.json'));
  }

  async connect() {
    if (this.status === 'connecting' || this.status === 'connected') return;

    this._setStatus('connecting');

    try {
      const { baileys, QRCode } = await this._loadModules();
      const {
        default: makeWASocket,
        useMultiFileAuthState,
        DisconnectReason,
        fetchLatestBaileysVersion,
        makeCacheableSignalKeyStore,
      } = baileys;

      if (!fs.existsSync(this.authDir)) {
        fs.mkdirSync(this.authDir, { recursive: true });
      }

      const { state, saveCreds } = await useMultiFileAuthState(this.authDir);

      let version;
      try {
        const v = await fetchLatestBaileysVersion();
        version = v.version;
      } catch (_) {
        version = [2, 3000, 1015901307];
      }

      const pino = require('pino');

      this.sock = makeWASocket({
        version,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore
            ? makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
            : state.keys,
        },
        printQRInTerminal: false,
        logger: pino({ level: 'silent' }),
        generateHighQualityLinkPreview: false,
        syncFullHistory: false,
      });

      this.sock.ev.on('creds.update', saveCreds);

      /* Mensagens recebidas → emite 'message' para o chatbot */
      this.sock.ev.on('messages.upsert', ({ messages, type }) => {
        if (type !== 'notify') return;
        for (const raw of messages) {
          const parsed = parseBaileysMessage(raw);
          if (parsed) this.emit('message', parsed);
        }
      });

      this.sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
          try {
            this.qrDataUrl = await QRCode.toDataURL(qr, { width: 280, margin: 2 });
            this._setStatus('qr_ready');
            this.emit('qr', this.qrDataUrl);
          } catch (err) {
            this.emit('error', 'Erro ao gerar QR Code: ' + err.message);
          }
        }

        if (connection === 'open') {
          this.qrDataUrl = null;
          this._setStatus('connected');
        }

        if (connection === 'close') {
          this.sock = null;
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;

          if (loggedOut) {
            this._setStatus('disconnected');
          } else {
            this._setStatus('reconnecting');
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = setTimeout(() => this.connect(), 5000);
          }
        }
      });
    } catch (err) {
      console.error('[WhatsApp] Connection error:', err);
      this.sock = null;
      this._setStatus('disconnected');
      this.emit('error', err.message);
    }
  }

  async disconnect() {
    clearTimeout(this._reconnectTimer);
    if (this.sock) {
      try { await this.sock.logout(); } catch (_) {}
      this.sock = null;
    }
    this.qrDataUrl = null;
    this._setStatus('disconnected');
  }

  async sendMessage(phone, text) {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp nao conectado');
    }

    const digits = String(phone).replace(/\D/g, '');
    if (!digits) throw new Error('Telefone invalido');

    const jid = digits + '@s.whatsapp.net';
    await this.sock.sendMessage(jid, { text });
  }

  /* Envia diretamente para um JID completo (uso interno do chatbot) */
  async sendMessageToJid(jid, text) {
    if (!this.sock || this.status !== 'connected') {
      throw new Error('WhatsApp nao conectado');
    }
    await this.sock.sendMessage(jid, { text });
  }

  getStatus() {
    return this.status;
  }

  getQR() {
    return this.qrDataUrl;
  }

  destroy() {
    clearTimeout(this._reconnectTimer);
    if (this.sock) {
      try { this.sock.end(undefined); } catch (_) {}
      this.sock = null;
    }
    this.removeAllListeners();
  }

  _setStatus(s) {
    this.status = s;
    this.emit('status', s);
  }
}

module.exports = WhatsAppService;
