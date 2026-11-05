'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ChatBotService = require('../src/chat-bot-service');

const JID = '5547000000001@s.whatsapp.net';

function setup(t, fetchOrder = async (number) => ({
  order_number: number,
  status: 'em_preparo',
})) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'day-lanches-bot-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const bot = new ChatBotService(
    path.join(dir, 'sessions.json'),
    () => ({
      botEnabled: true,
      botMenuExpireHours: 12,
      botHandoffPauseHours: 4,
      botBusinessHours: 'Quarta a domingo, 17h30 às 23h',
    }),
    fetchOrder
  );
  const send = (body, overrides = {}) => bot.handleMessage({
    from: JID,
    body,
    isGroup: false,
    isFromMe: false,
    ...overrides,
  });
  return { bot, send };
}

test('opcoes 1, 2, 3, 4 e repeticoes respondem sem exigir novo menu', async (t) => {
  const { send } = setup(t);
  assert.match((await send('Oi')).text, /Digite uma opção/);
  assert.match((await send('1')).text, /cardápio/i);
  assert.match((await send('3')).text, /horário/i);
  assert.match((await send('4')).text, /Pix/);
  assert.match((await send('1')).text, /cardápio/i);
  assert.match((await send('2')).text, /número do pedido/i);
  assert.match((await send('4')).text, /Pix/);
});

test('primeiro contato pode escolher uma opcao sem precisar enviar Oi', async (t) => {
  const { send } = setup(t);
  assert.match((await send('1')).text, /cardápio/i);
  assert.match((await send('2')).text, /número do pedido/i);
  assert.match((await send('DL-12345')).text, /Pedido \*DL-12345\*/);
  assert.match((await send('3')).text, /horário/i);
});

test('nova opcao substitui consulta de pedido em andamento', async (t) => {
  const { bot, send } = setup(t);
  await send('2');
  assert.equal(bot._getSession('5547000000001').awaiting_order_number, true);
  assert.match((await send('3')).text, /horário/i);
  assert.equal(bot._getSession('5547000000001').awaiting_order_number, false);
  assert.match((await send('2')).text, /número do pedido/i);
  assert.match((await send('1')).text, /cardápio/i);
  assert.equal(bot._getSession('5547000000001').awaiting_order_number, false);
});

test('uma nova escolha numerica reativa o robo apos opcao 5', async (t) => {
  const { bot, send } = setup(t);
  assert.match((await send('5')).text, /atendente/);
  assert.equal(await send('Ola'), null);
  assert.match((await send('1')).text, /cardápio/i);
  assert.equal(bot._getSession('5547000000001').bot_paused_until, null);
  assert.match((await send('5')).text, /atendente/);
  assert.match((await send('3')).text, /horário/i);
});

test('sessao antiga permite escolha 2 seguida de consulta real', async (t) => {
  const { bot, send } = setup(t);
  bot._touchSession('5547000000001', {
    last_menu_sent_at: new Date(Date.now() - 24 * 3600000).toISOString(),
  });
  assert.match((await send('2')).text, /número do pedido/i);
  assert.match((await send('DL-54321')).text, /Pedido \*DL-54321\*/);
});

test('mensagens da loja e grupos continuam ignorados', async (t) => {
  const { send } = setup(t);
  assert.equal(await send('1', { isFromMe: true }), null);
  assert.equal(await send('2', { isGroup: true }), null);
});
