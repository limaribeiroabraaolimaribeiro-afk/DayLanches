'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { IncomingMessageGuard, timestampMs } = require('../src/incoming-message-guard');

const NOW = 1793908800000;

function message(id, time = Math.floor(NOW / 1000), jid = '5547999999999@s.whatsapp.net') {
  return {
    key: { id, remoteJid: jid, fromMe: false },
    message: { conversation: '1' },
    messageTimestamp: time,
  };
}

test('evento atual e aceito e o mesmo ID reenviado nao e processado outra vez', () => {
  const guard = new IncomingMessageGuard();
  assert.equal(guard.check(message('abc'), NOW).accept, true);
  assert.deepEqual(guard.check(message('abc'), NOW), { accept: false, reason: 'duplicate' });
});

test('cada novo envio de 1 ou 2 continua aceito mesmo com o mesmo texto', () => {
  const guard = new IncomingMessageGuard();
  assert.equal(guard.check(message('abc'), NOW).accept, true);
  assert.equal(guard.check(message('def'), NOW).accept, true);
  assert.equal(guard.check(message('ghi'), NOW).accept, true);
});

test('mensagem velha de mais de 15 minutos nao dispara respostas', () => {
  const guard = new IncomingMessageGuard();
  assert.deepEqual(guard.check(message('old', Math.floor(NOW / 1000) - 3600), NOW),
    { accept: false, reason: 'old_message' });
  assert.equal(guard.check(message('fresh', Math.floor(NOW / 1000) - 60), NOW).accept, true);
});

test('aceita timestamps Unix em segundos, milissegundos, string e Long JSON', () => {
  const sec = Math.floor(NOW / 1000);
  assert.equal(timestampMs(sec), NOW);
  assert.equal(timestampMs(NOW), NOW);
  assert.equal(timestampMs(String(sec)), NOW);
  assert.equal(timestampMs({ low: sec, high: 0 }), NOW);
  assert.equal(timestampMs(new Date(NOW).toISOString()), NOW);
});

test('timestamp no futuro distante e rejeitado sem responder', () => {
  const guard = new IncomingMessageGuard();
  const future = Math.floor(NOW / 1000) + 3600;
  assert.deepEqual(guard.check(message('future', future), NOW),
    { accept: false, reason: 'future_message' });
});

test('ID igual de contatos diferentes nao e tratado como duplicado', () => {
  const guard = new IncomingMessageGuard();
  assert.equal(guard.check(message('abc'), NOW).accept, true);
  assert.equal(guard.check(message('abc', NOW / 1000, '5547888888888@s.whatsapp.net'), NOW).accept, true);
});

test('evento de teste sem ID/timestamp continua aceito', () => {
  const guard = new IncomingMessageGuard();
  assert.equal(guard.check({ key: { remoteJid: '123@s.whatsapp.net' } }, NOW).accept, true);
});
