// Тесты: релей (WS + long-poll), NetClient, RemoteBattle.
import http from 'node:http';
import { startRelay } from '../tools/net/relay.mjs';

const errors = [];
const step = (name, fn) => {
  try { fn(); console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); errors.push(name + ': ' + e.message); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// localStorage-заглушка (accounts не тянем, но net.js может понадобиться)
global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const relay = await startRelay(0, '127.0.0.1');
const BASE = `http://127.0.0.1:${relay.port}`;
console.log('— релей на порту', relay.port, '—');

// простой WS-клиент через библиотеку ws
const { WebSocket } = await import('ws');

function wsClient() {
  const ws = new WebSocket(BASE.replace('http', 'ws') + '/');
  const queue = [];
  const waiters = [];
  ws.on('message', (data) => {
    const env = JSON.parse(String(data));
    if (waiters.length) waiters.shift()(env);
    else queue.push(env);
  });
  return {
    ws,
    send: (obj) => ws.send(JSON.stringify(obj)),
    next(timeout = 3000) {
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('таймаут сообщения')), timeout);
        const got = (env) => { clearTimeout(t); resolve(env); };
        if (queue.length) got(queue.shift());
        else waiters.push(got);
      });
    },
    open: () => new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    }),
    close: () => ws.close()
  };
}

const { NetClient, RemoteBattle, rotate180, swapTeam } = await import('../src/net.js');

// ——— релей ———

const host = wsClient();
await host.open();
host.send({ t: 'create' });
const created = await host.next();
step('создание комнаты по WS', () => {
  if (created.t !== 'created') throw new Error(JSON.stringify(created));
  if (!/^[A-Z0-9]{6}$/.test(created.code)) throw new Error('код: ' + created.code);
});

const guest = wsClient();
await guest.open();
guest.send({ t: 'join', code: created.code });
const joined = await guest.next();
const peerMsg = await host.next();
step('вход гостя и уведомление хоста', () => {
  if (joined.t !== 'joined') throw new Error(JSON.stringify(joined));
  if (peerMsg.t !== 'peer') throw new Error('хост не получил peer: ' + JSON.stringify(peerMsg));
});

host.send({ t: 'send', msg: { t: 'hello', n: 1 } });
const relayed = await guest.next();
step('пересылка сообщений хост → гость', () => {
  if (relayed.t !== 'msg' || relayed.msg.t !== 'hello') throw new Error(JSON.stringify(relayed));
});

guest.send({ t: 'send', msg: { t: 'intent', cardId: 'knight', x: 1, y: 2 } });
const back = await host.next();
step('пересылка сообщений гость → хост', () => {
  if (back.t !== 'msg' || back.msg.t !== 'intent') throw new Error(JSON.stringify(back));
});

// третий игрок не должен попасть в занятую комнату
const third = wsClient();
await third.open();
third.send({ t: 'join', code: created.code });
const thirdReply = await third.next();
step('занятая комната отклоняет третьего', () => {
  if (thirdReply.t !== 'error') throw new Error('третий вошёл: ' + JSON.stringify(thirdReply));
});
third.close();

// long-poll фолбэк
const { NetClient: NC } = await import('../src/net.js');
const pollClient = new NC(BASE);
let pollMode = null;
pollClient.onStatus = (s) => { pollMode = s; };
// ломаем WS-подключение: подменим URL на http-only (ws упадёт → фолбэк)
const pollOnly = new NC(BASE);
pollOnly._tryWs = () => Promise.reject(new Error('ws off'));
await pollOnly.connect();
const pollCode = await pollOnly.createRoom();

const pollHost = new NC(BASE);
pollHost._tryWs = () => Promise.reject(new Error('ws off'));
await pollHost.connect();
await pollHost.joinRoom(pollCode);

const gotMsg = new Promise((resolve) => {
  pollHost.onMessage = (m) => resolve(m);
});
pollOnly.send({ t: 'hello', via: 'poll' });
const pm = await Promise.race([gotMsg, sleep(3000).then(() => null)]);
step('long-poll: создание/вход/пересылка', () => {
  if (pollOnly.mode !== 'poll') throw new Error('не выбрался poll-режим: ' + pollOnly.mode);
  if (!pm || pm.via !== 'poll') throw new Error('сообщение не дошло по long-poll');
});

// ——— геометрия и RemoteBattle ———

step('поворот 180° обратим', () => {
  const p = rotate180(3.5, -7.25);
  if (p.x !== -3.5 || p.y !== 7.25) throw new Error('поворот неверен');
  const q = rotate180(p.x, p.y);
  if (q.x !== 3.5 || q.y !== -7.25) throw new Error('не обратим');
});

step('смена команды', () => {
  if (swapTeam('player') !== 'ai' || swapTeam('ai') !== 'player') throw new Error('swap сломан');
});

step('RemoteBattle: снапшот, команды, координаты', () => {
  const intents = [];
  const rb = new RemoteBattle({
    cardsById: new Map([['knight', { id: 'knight', name: 'Рыцарь', cost: 3, hp: 1450, count: 1, model: { parts: [] } }]]),
    sendIntent: (m) => intents.push(m)
  });
  rb.applySnapshot({
    t: 'snap', time: 12.5, finished: false, result: null,
    crowns: { player: 1, ai: 0 }, // хост: player=1
    elixir: [8.5, 4.2],            // хост: [player, ai]
    hands: [['knight'], ['arrows', 'zap']],
    units: [[7, 'knight', 'ai', 2, 9, 100, 200, 1]], // юнит хоста 'ai' в (2,9)
    towers: [['t1', 'player', 'king', 0, -13.6, 4000, 4200, 1]]
  });
  // гость: хостовский 'ai' — это мой 'player'
  const u = rb.units[0];
  if (u.team !== 'player') throw new Error('команда не перевёрнута: ' + u.team);
  if (Math.abs(u.x - -2) > 0.01 || Math.abs(u.y - -9) > 0.01) throw new Error('координаты не перевёрнуты: ' + u.x + ',' + u.y);
  if (rb.teams.player.elixir !== 4.2) throw new Error('эликсир не тот: ' + rb.teams.player.elixir);
  if (rb.teams.player.hand[0] !== 'arrows') throw new Error('рука не та');
  if (rb.crowns.player !== 0 || rb.crowns.ai !== 1) throw new Error('короны не перевёрнуты');
  if (rb.towers[0].y !== 13.6) throw new Error('башня не перевёрнута');
  // высадка: уходит в координатах хоста
  rb.deploy('knight', -1, -5, 'player');
  if (intents.length !== 1) throw new Error('intent не ушёл');
  if (intents[0].x !== 1 || intents[0].y !== 5) throw new Error('intent в неверных координатах: ' + JSON.stringify(intents[0]));
  // сглаживание
  rb.applySnapshot({
    t: 'snap', time: 13, finished: false, result: null,
    crowns: { player: 1, ai: 0 }, elixir: [8, 4], hands: [[], []],
    units: [[7, 'knight', 'ai', 3, 10, 100, 200, 0]],
    towers: []
  });
  rb.update(0.5);
  if (Math.abs(rb.units[0].x - -2) < 0.3) throw new Error('юнит не сглаживается к цели');
});

step('RemoteBattle: canPlaceAt повторяет правила арены', () => {
  const rb = new RemoteBattle({});
  if (!rb.canPlaceAt(0, -8, 'player')) throw new Error('своя половина не принимается');
  if (rb.canPlaceAt(0, 8, 'player')) throw new Error('вражеская половина принимается');
  if (!rb.canPlaceAt(0, 8, 'ai')) throw new Error('ai-половина не принимается');
  if (rb.canPlaceAt(20, -8, 'player')) throw new Error('вне арены принимается');
});

step('RemoteBattle: разрядка событий', () => {
  const rb = new RemoteBattle({});
  rb.applySnapshot({
    t: 'snap', time: 1, finished: false, result: null,
    crowns: { player: 0, ai: 0 }, elixir: [5, 5], hands: [[], []],
    units: [], towers: [],
    events: [{ type: 'towerShot', team: 'player', x: 1, y: 2, tx: 3, ty: 4 }]
  });
  const ev = rb.drainEvents();
  if (ev.length !== 1) throw new Error('события не доехали');
  if (ev[0].team !== 'ai') throw new Error('команда события не перевёрнута');
  if (Math.abs(ev[0].x - -1) > 0.01 || Math.abs(ev[0].ty - -4) > 0.01) throw new Error('координаты события не перевёрнуты');
  if (rb.drainEvents().length !== 0) throw new Error('drain не очищает');
});

// ——— интеграция: настоящий движок хоста ↔ RemoteBattle гостя ———

const { Battle } = await import('../src/game/engine.js');
const { getCard, withCustom } = await import('../src/data/cards.js');
const { buildHostSnapshot, applyIntentToBattle } = await import('../src/net.js');

const cardsById = new Map(withCustom([]).map((c) => [c.id, c]));
const hostBattle = new Battle({
  playerDeck: ['knight', 'archers', 'goblins', 'fireball', 'musketeer', 'giant', 'arrows', 'cannon'],
  enemyDeck: ['knight', 'archers', 'goblins', 'fireball', 'musketeer', 'giant', 'arrows', 'cannon'],
  cardsById
});
hostBattle.teams.player.elixir = 10;
hostBattle.deploy('knight', 1, -6, 'player'); // юнит хоста на своей половине

const intents = [];
const guestBattle = new RemoteBattle({ cardsById, sendIntent: (m) => intents.push(m) });

// несколько тиков хоста → снапшоты гостю
for (let i = 0; i < 5; i++) hostBattle.update(0.1);
guestBattle.applySnapshot(buildHostSnapshot(hostBattle, hostBattle.drainEvents()));

step('интеграция: гость видит юнитов и башни хоста', () => {
  if (!guestBattle.units.length) throw new Error('юнит хоста не виден гостю');
  const u = guestBattle.units[0];
  if (u.team !== 'ai') throw new Error('юнит хоста у гостя должен быть «ai»: ' + u.team);
  if (u.y < 0) throw new Error('юнит хоста должен быть в верхней половине гостя: y=' + u.y);
  if (guestBattle.towers.length !== 6) throw new Error('башни не доехали: ' + guestBattle.towers.length);
  if (guestBattle.teams.player.hand.length !== 4) throw new Error('рука гостя (хостовская ai) не доехала: ' + guestBattle.teams.player.hand.length);
});

step('интеграция: высадка гостя появляется у хоста', () => {
  hostBattle.teams.ai.elixir = 10;
  guestBattle.deploy('goblins', -2, -7, 'player'); // в координатах гостя
  if (intents.length !== 1) throw new Error('intent не создан');
  const applied = applyIntentToBattle(hostBattle, intents[0], cardsById);
  if (!applied) throw new Error('intent не применился: ' + JSON.stringify(intents[0]));
  const enemyUnits = hostBattle.units.filter((u) => u.team === 'ai' && u.alive);
  if (!enemyUnits.length) throw new Error('юнит гостя не появился на хосте');
  const u = enemyUnits[0];
  if (u.y < 0) throw new Error('юнит гостя должен быть на верхней половине хоста: y=' + u.y);
  if (Math.abs(u.x - 2) > 1.5) throw new Error('x не совпал (ожидался поворот): ' + u.x);
});

step('интеграция: запретная высадка гостя отклоняется', () => {
  hostBattle.teams.ai.elixir = 10;
  // «своя» половина гостя — это половина хоста → для 'ai' запрещена
  const applied = applyIntentToBattle(hostBattle, { t: 'intent', cardId: 'knight', x: 0, y: -8 }, cardsById);
  if (applied) throw new Error('высадка на чужую половину прошла');
});

// завершение
host.close();
guest.close();
pollOnly.close();
pollHost.close();
await relay.close();

console.log('— итог —');
if (errors.length) {
  console.error('ОШИБКИ (' + errors.length + '):');
  for (const e of errors) console.error(' •', e);
  process.exit(1);
}
console.log('все сценарии прошли');
process.exit(0);
