'use strict';

/* Extrai corpo de texto de um evento MESSAGES_UPSERT da Evolution API.
   O campo `data` do webhook espelha o formato bruto do Baileys ({key, message, ...}),
   entao a logica e a mesma usada no agente local (print-agent/src/whatsapp-service.js). */
function parseEvolutionMessage(data) {
  const jid = data?.key?.remoteJid || '';
  if (!jid || jid === 'status@broadcast') return null;

  const isGroup = jid.endsWith('@g.us');
  const isFromMe = !!data.key.fromMe;

  let m = data.message;
  if (!m) return null;

  /* Desempacotar ephemeral / viewOnce */
  m = m.ephemeralMessage?.message
    || m.viewOnceMessage?.message
    || m.viewOnceMessageV2?.message
    || m;

  let body = '';
  let type = 'unknown';

  if (m.conversation)                   { body = m.conversation;               type = 'text';     }
  else if (m.extendedTextMessage?.text) { body = m.extendedTextMessage.text;   type = 'text';     }
  else if (m.imageMessage)              { body = m.imageMessage.caption || ''; type = 'image';    }
  else if (m.videoMessage)              { body = m.videoMessage.caption || ''; type = 'video';    }
  else if (m.audioMessage)              {                                       type = 'audio';    }
  else if (m.documentMessage)           {                                       type = 'document'; }
  else if (m.stickerMessage)            {                                       type = 'sticker';  }

  return { from: jid, body, type, isGroup, isFromMe };
}

module.exports = parseEvolutionMessage;
