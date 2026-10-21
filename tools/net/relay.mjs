#!/usr/bin/env node
// Релей-сервер сетевых боёв «Королевские Схватки».
// Держит комнаты и пересылает сообщения между двумя игроками.
// Транспорты: WebSocket (основной) + HTTP long-poll (фолбэк для строгих прокси).
//
// Запуск:  node tools/net/relay.mjs [--port 8787]
// Своё устройство:  node tools/net/relay.mjs --port 8787 --host 0.0.0.0
// В игре укажите адрес: http://<ваш-ip>:8787  (или https://… за обратным прокси)

import http from 'node:http';
import { WebSocketServer } from 'ws';
import { randomBytes } from 'node:crypto';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL = 30 * 60 * 1000;      // комната живёт 30 минут
const SESSION_TTL = 90 * 1000;        // long-poll сессия без опросов
const POLL_TIMEOUT = 25 * 1000;       // сколько long-poll ждёт сообщений
const MAX_MSG = 256 * 1024;

function makeCode() {
  let s = '';
  const buf = randomBytes(6);
  for (let i = 0; i < 6; i++) s += CODE_CHARS[buf[i] % CODE_CHARS.length];
  return s;
}

function makeSid() {
  return randomBytes(16).toString('hex');
}

export function startRelay(port = 8787, host = '0.0.0.0') {
  // ——— состояние ———
  const rooms = new Map();    // code -> { hostSid, guestSid, created }
  const sessions = new Map(); // sid -> { ws, queue, waiting, room, role, lastSeen }

  const sendTo = (sid, obj) => {
    const s = sessions.get(sid);
    if (!s) return;
    const data = JSON.stringify(obj);
    if (s.ws && s.ws.readyState === 1) {
      try { s.ws.send(data); } catch { /* сокет умирает */ }
    } else {
      s.queue.push(obj);
      if (s.waiting) {
        const w = s.waiting;
        s.waiting = null;
        try {
          w.res.writeHead(200, corsHeaders());
          w.res.end(JSON.stringify({ t: 'msgs', msgs: s.queue.splice(0) }));
        } catch { /* клиент отвалился */ }
      }
    }
  };

  const peerOf = (sid) => {
    const s = sessions.get(sid);
    if (!s || !s.room) return null;
    const room = rooms.get(s.room);
    if (!room) return null;
    return room.hostSid === sid ? room.guestSid : room.hostSid;
  };

  const destroyRoom = (code) => {
    const room = rooms.get(code);
    if (!room) return;
    rooms.delete(code);
    for (const sid of [room.hostSid, room.guestSid]) {
      const s = sessions.get(sid);
      if (s && s.room === code) {
        s.room = null;
        s.role = null;
      }
    }
  };

  const leaveSession = (sid, notify = true) => {
    const s = sessions.get(sid);
    if (!s) return;
    const peer = peerOf(sid);
    const roomCode = s.room;
    sessions.delete(sid);
    if (notify && peer) sendTo(peer, { t: 'peer-left' });
    if (roomCode) {
      const room = rooms.get(roomCode);
      if (room && (room.hostSid === sid || room.guestSid === sid)) destroyRoom(roomCode);
    }
  };

  // ——— обработка команд ———
  const handle = (sid, msg) => {
    const s = sid ? sessions.get(sid) : null;
    if (s) s.lastSeen = Date.now();
    switch (msg.t) {
      case 'create': {
        if (s) return { t: 'error', error: 'уже подключены' };
        let code = makeCode();
        while (rooms.has(code)) code = makeCode();
        const newSid = makeSid();
        sessions.set(newSid, { ws: msg._ws, queue: [], waiting: null, room: code, role: 'host', lastSeen: Date.now() });
        rooms.set(code, { hostSid: newSid, guestSid: null, created: Date.now() });
        return { t: 'created', code, sid: newSid };
      }
      case 'join': {
        if (s) return { t: 'error', error: 'уже подключены' };
        const code = String(msg.code || '').trim().toUpperCase();
        const room = rooms.get(code);
        if (!room) return { t: 'error', error: 'Комната не найдена' };
        if (room.guestSid) return { t: 'error', error: 'Комната занята' };
        const newSid = makeSid();
        sessions.set(newSid, { ws: msg._ws, queue: [], waiting: null, room: code, role: 'guest', lastSeen: Date.now() });
        room.guestSid = newSid;
        sendTo(room.hostSid, { t: 'peer' });
        return { t: 'joined', sid: newSid };
      }
      case 'send': {
        if (!s) return { t: 'error', error: 'нет сессии' };
        const peer = peerOf(sid);
        if (!peer) return { t: 'error', error: 'соперник не подключён' };
        sendTo(peer, { t: 'msg', msg: msg.msg });
        return null;
      }
      case 'poll': {
        if (!s) return { t: 'error', error: 'нет сессии' };
        if (s.queue.length) return { t: 'msgs', msgs: s.queue.splice(0) };
        // держим запрос открытым до сообщений или таймаута
        return { _wait: true };
      }
      case 'leave': {
        if (sid) leaveSession(sid);
        return { t: 'left' };
      }
      case 'ping':
        return { t: 'pong' };
      default:
        return { t: 'error', error: 'неизвестная команда' };
    }
  };

  // ——— HTTP (long-poll + статус) ———
  const corsHeaders = () => ({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store'
  });

  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, corsHeaders());
      return res.end();
    }
    if (req.method === 'GET' && (req.url === '/' || req.url === '/status')) {
      res.writeHead(200, { ...corsHeaders(), 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ ok: true, rooms: rooms.size, sessions: sessions.size, service: 'battle-cards-relay' }));
    }
    if (req.method === 'POST' && req.url === '/api') {
      let body = '';
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_MSG) {
          try { req.destroy(); } catch { /* ignore */ }
          return;
        }
        body += chunk;
      });
      req.on('end', () => {
        let msg;
        try {
          msg = JSON.parse(body || '{}');
        } catch {
          res.writeHead(400, corsHeaders());
          return res.end(JSON.stringify({ t: 'error', error: 'битый JSON' }));
        }
        const sid = msg.sid || null;
        const result = handle(sid, msg);
        if (result && result._wait) {
          const s = sessions.get(sid);
          if (!s) {
            res.writeHead(200, corsHeaders());
            return res.end(JSON.stringify({ t: 'msgs', msgs: [] }));
          }
          s.waiting = { res };
          setTimeout(() => {
            if (s.waiting && s.waiting.res === res) {
              s.waiting = null;
              try {
                res.writeHead(200, corsHeaders());
                res.end(JSON.stringify({ t: 'msgs', msgs: s.queue.splice(0) }));
              } catch { /* ignore */ }
            }
          }, POLL_TIMEOUT);
          return;
        }
        res.writeHead(200, corsHeaders());
        res.end(JSON.stringify(result || { t: 'ok' }));
      });
      return;
    }
    res.writeHead(404, corsHeaders());
    res.end(JSON.stringify({ t: 'error', error: 'not found' }));
  });

  // ——— WebSocket ———
  const wss = new WebSocketServer({ server, maxPayload: MAX_MSG });
  wss.on('connection', (ws) => {
    let sid = null;
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(String(data));
      } catch {
        return ws.send(JSON.stringify({ t: 'error', error: 'битый JSON' }));
      }
      // первый create/join привязывает сессию к сокету
      if (!sid && (msg.t === 'create' || msg.t === 'join')) {
        msg._ws = ws;
        const result = handle(null, msg);
        if (result && result.sid) sid = result.sid;
        if (result) ws.send(JSON.stringify(result));
        return;
      }
      const result = handle(sid, msg);
      if (result && !result._wait) ws.send(JSON.stringify(result));
    });
    ws.on('close', () => {
      if (sid) leaveSession(sid);
    });
    ws.on('error', () => {
      if (sid) leaveSession(sid);
    });
  });

  // ——— уборка ———
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
      if (now - room.created > ROOM_TTL) destroyRoom(code);
    }
    for (const [sid, s] of sessions) {
      if (!s.ws && now - s.lastSeen > SESSION_TTL) leaveSession(sid);
    }
  }, 30 * 1000);
  sweep.unref?.();

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const actualPort = server.address().port;
      resolve({
        server,
        wss,
        port: actualPort,
        rooms,
        sessions,
        close: () => new Promise((res2) => {
          clearInterval(sweep);
          for (const [, s] of sessions) {
            if (s.waiting) {
              try {
                s.waiting.res.writeHead(200, corsHeaders());
                s.waiting.res.end(JSON.stringify({ t: 'msgs', msgs: [] }));
              } catch { /* ignore */ }
              s.waiting = null;
            }
            if (s.ws) try { s.ws.close(); } catch { /* ignore */ }
          }
          wss.close();
          server.close(() => res2());
        })
      });
    });
  });
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('relay.mjs')) {
  const args = process.argv.slice(2);
  const portArg = args.indexOf('--port');
  const hostArg = args.indexOf('--host');
  const port = portArg >= 0 ? parseInt(args[portArg + 1], 10) : 8787;
  const host = hostArg >= 0 ? args[hostArg + 1] : '0.0.0.0';
  startRelay(port, host).then(({ port: p }) => {
    console.log(`Релей боёв запущен: http://${host}:${p}  (WebSocket + long-poll)`);
    console.log('В игре: Настройки → «Сетевой сервер» укажите этот адрес.');
  });
}
