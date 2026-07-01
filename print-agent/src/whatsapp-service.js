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
    this._reconnectAttempts = 0;
    this._maxReconnectAttempts = 5;
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

  /* Encerra e desconecta o socket atual, removendo seus listeners para que eventos
     tardios (ex: 'close' disparado apos o .end()) nao disparem uma reconexao paralela */
  _teardownSocket() {
    if (!this.sock) return;
    try { this.sock.ev.removeAllListeners(); } catch (_) {}
    try { this.sock.end(undefined); } catch (_) {}
    this.sock = null;
  }

  /* Remove a sessao local salva do Baileys (nao pode ser reaproveitada apos logout/corrupcao) */
  async _clearSessionFiles() {
    try {
      if (fs.existsSync(this.authDir)) {
        fs.rmSync(this.authDir, { recursive: true, force: true });
      }
      fs.mkdirSync(this.authDir, { recursive: true });
    } catch (err) {
      this.emit('error', 'Erro ao limpar sessao local do WhatsApp: ' + err.message);
      throw err;
    }
  }

  /* forceNewQR: encerra a conexao atual, apaga a sessao salva e forca um novo QR Code */
  async connect({ forceNewQR = false } = {}) {
    if (!forceNewQR && (this.status === 'connecting' || this.status === 'connected')) return;

    clearTimeout(this._reconnectTimer);
    this._teardownSocket();

    if (forceNewQR) {
      try {
        await this._clearSessionFiles();
      } catch (_) {
        this._setStatus('disconnected');
        return;
      }
      this.qrDataUrl = null;
    }

    this._reconnectAttempts = 0;
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
            this.qrDataUrl = null;
            this._setStatus('disconnected');
            this.emit('error', 'Erro ao gerar QR Code: ' + err.message);
          }
        }

        if (connection === 'open') {
          this.qrDataUrl = null;
          this._reconnectAttempts = 0;
          this._setStatus('connected');
        }

        if (connection === 'close') {
          this.sock = null;
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          const loggedOut = statusCode === DisconnectReason.loggedOut;
          const restartRequired = statusCode === DisconnectReason.restartRequired;

          if (loggedOut) {
            /* Sessao invalidada pelo WhatsApp: limpa creds para permitir novo QR na proxima tentativa */
            await this._clearSessionFiles().catch(() => {});
            this._reconnectAttempts = 0;
            this._setStatus('disconnected');
            return;
          }

          if (restartRequired) {
            /* Parte normal do handshake apos escanear o QR: reconecta rapido, sem contar como falha */
            this._setStatus('reconnecting');
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = setTimeout(() => this.connect(), 300);
            return;
          }

          this._reconnectAttempts += 1;
          if (this._reconnectAttempts > this._maxReconnectAttempts) {
            this._reconnectAttempts = 0;
            this.emit('error', 'Nao foi possivel reconectar ao WhatsApp apos varias tentativas. Clique em "Gerar novo QR Code".');
            this._setStatus('disconnected');
            return;
          }

          this._setStatus('reconnecting');
          clearTimeout(this._reconnectTimer);
          this._reconnectTimer = setTimeout(() => this.connect(), 5000);
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
    this._reconnectAttempts = 0;
    if (this.sock) {
      try { await this.sock.logout(); } catch (_) {}
    }
    this._teardownSocket();
    await this._clearSessionFiles().catch(() => {});
    this.qrDataUrl = null;
    this._setStatus('disconnected');
  }

  /* Gera um novo QR Code: encerra a conexao atual e apaga a sessao para forcar novo pareamento */
  async generateNewQR() {
    return this.connect({ forceNewQR: true });
  }

  /* Reconecta do zero: encerra Baileys, limpa sessao local e inicia nova conexao com novo QR */
  async resetConnection() {
    return this.connect({ forceNewQR: true });
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
    this._teardownSocket();
    this.removeAllListeners();
  }

  _setStatus(s) {
    this.status = s;
    this.emit('status', s);
  }
}

module.exports = WhatsAppService;
