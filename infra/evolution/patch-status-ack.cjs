'use strict';

// Patch provisório da Evolution API 2.3.7 (Baileys 7.0.0-rc.9).
// https://github.com/evolution-foundation/evolution-api/issues/2778
// https://github.com/WhiskeySockets/Baileys/pull/2866
//
// Acknowledges top-level <status> stanzas. Without this, WhatsApp can close
// the stream with "stream errored out" / ack class="status", leaving the
// instance displayed as "open" but not receiving inbound messages.
//
// Fail closed on unexpected Baileys versions or code layout.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const baileysDir = process.argv[2] || '/evolution/node_modules/baileys';
const packageJson = JSON.parse(fs.readFileSync(path.join(baileysDir, 'package.json'), 'utf8'));
assert.equal(packageJson.version, '7.0.0-rc.9',
  'A versão do Baileys mudou. Não aplicar este patch sem revisão.');

const target = path.join(baileysDir, 'lib/Socket/messages-recv.js');
const source = fs.readFileSync(target, 'utf8');
assert(source.includes('sendMessageAck(') && source.includes('onUnexpectedError('),
  'Funções esperadas não existem no arquivo de destino.');
assert(source.includes("CB:notification"),
  'Evento CB:notification ausente; layout incompatível.');
assert(!source.includes("CB:status"),
  'CB:status já existe; remova o patch antes de atualizar.');
const anchor = /^(\s*)ws\.on\('CB:ack,class:message',/gm;
const matches = [...source.matchAll(anchor)];
assert.equal(matches.length, 1,
  'Ancora do handler CB:ack,class:message não é única; abortando.');
const match = matches[0];
const indent = match[1].replace(/\n/g, '');
const newHandler = [
  indent + "// Acknowledge top-level status stanzas (Baileys PR #2866).",
  indent + "ws.on('CB:status', (node) => {",
  indent + "    sendMessageAck(node).catch(error => onUnexpectedError(error, 'acking status'));",
  indent + "});",
  ''
].join('\n');
const updated = source.slice(0, match.index) + newHandler + source.slice(match.index);
fs.writeFileSync(target, updated, 'utf8');
console.log('Status ack patch aplicado em ' + target);
