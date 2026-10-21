// Сетевая игра: клиент релея и «удалённый бой» для гостя.
// Хост — авторитет: у него настоящий движок Battle, он рассылает снапшоты.
// Гость — тонкий клиент: рисует снапшоты и шлёт намерения высадки.
// Системы координат: вид гостя = вид хоста, повёрнутый на 180° (x,y) → (−x,−y);
// команды хоста 'player' у гостя отображаются как 'ai' и наоборот.

import { ARENA } from './game/engine.js';

// ————— транспорт —————

export class NetClient {
  constructor(url) {
    this.url = String(url || '').replace(/\/+$/, '');
    this.sid = null;
    this.ws = null;
    this.mode = null; // 'ws' | 'poll'
    this.closed = false;
    this.onMessage = () => {};
    this.onPeer = () => {};      // (true|false) — соперник пришёл/ушёл
    this.onStatus = () => {};    // ('ws'|'poll'|'lost')
    this._pollAbort = null;
    this._queue = [];
  }

  wsUrl() {
    return this.url.replace(/^http/i, 'ws') + '/';
  }

  async connect(timeoutMs = 4000) {
    // 1) пробуем WebSocket
    try {
      await this._tryWs(timeoutMs);
      this.mode = 'ws';
      this.onStatus('ws');
      return;
    } catch { /* фолбэк на long-poll */ }
    // 2) long-poll через обычный HTTP
    const r = await this._api({ t: 'ping' });
    if (!r || r.t !== 'pong') throw new Error('Сервер недоступен: ' + this.url);
    this.mode = 'poll';
    this.onStatus('poll');
  }

  _tryWs(timeoutMs) {
    return new Promise((resolve, reject) => {
      let ws;
      try {
        ws = new WebSocket(this.wsUrl());
      } catch (e) {
        return reject(e);
      }
      const timer = setTimeout(() => {
        try { ws.close(); } catch { /* ignore */ }
        reject(new Error('WS timeout'));
      }, timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        this.ws = ws;
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error('WS error'));
      };
      ws.onmessage = (ev) => this._onEnvelope(ev.data);
      ws.onclose = () => {
        if (this.ws === ws && !this.closed) {
          this.closed = true;
          this.onStatus('lost');
          this.onPeer(false);
        }
      };
    });
  }

  _onEnvelope(data) {
    let env;
    try {
      env = JSON.parse(typeof data === 'string' ? data : String(data));
    } catch {
      return;
    }
    if (!env || typeof env !== 'object') return;
    if (env.t === 'created' || env.t === 'joined') this.sid = env.sid;
    if (env.t === 'msg') this.onMessage(env.msg);
    else if (env.t === 'peer') this.onPeer(true);
    else if (env.t === 'peer-left') {
      this.onPeer(false);
      this.onStatus('lost');
    }
  }

  async _api(body) {
    try {
      const res = await fetch(this.url + '/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return await res.json();
    } catch {
      return null;
    }
  }

  async _pollLoop() {
    while (!this.closed && this.mode === 'poll') {
      if (!this.sid) {
        await new Promise((res) => setTimeout(res, 200));
        continue;
      }
      const r = await this._api({ t: 'poll', sid: this.sid });
      if (this.closed) return;
      if (!r) {
        // сеть мигнула — повтор через паузу
        await new Promise((res) => setTimeout(res, 1500));
        continue;
      }
      if (r.t === 'msgs') {
        for (const env of r.msgs) this._onEnvelope(JSON.stringify(env));
      } else if (r.t === 'error') {
        // временная ошибка (например, сессия ещё не создана) — не умираем
        await new Promise((res) => setTimeout(res, 700));
      }
    }
  }

  _startPollLoop() {
    if (this.mode === 'poll' && !this._polling) {
      this._polling = true;
      this._pollLoop();
    }
  }

  async createRoom() {
    const r = this.mode === 'ws'
      ? await this._wsCall({ t: 'create' })
      : await this._api({ t: 'create' });
    if (!r || r.t !== 'created') throw new Error((r && r.error) || 'Не удалось создать комнату');
    this.sid = r.sid;
    this._startPollLoop();
    return r.code;
  }

  async joinRoom(code) {
    const r = this.mode === 'ws'
      ? await this._wsCall({ t: 'join', code })
      : await this._api({ t: 'join', code });
    if (!r || r.t !== 'joined') throw new Error((r && r.error) || 'Не удалось войти');
    this.sid = r.sid;
    this._startPollLoop();
    return true;
  }

  _wsCall(obj) {
    return new Promise((resolve, reject) => {
      const ws = this.ws;
      if (!ws) return reject(new Error('WS не подключён'));
      const timer = setTimeout(() => reject(new Error('Таймаут сервера')), 8000);
      const onMsg = (ev) => {
        let env;
        try {
          env = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (env.t === 'created' || env.t === 'joined' || env.t === 'error') {
          clearTimeout(timer);
          ws.removeEventListener('message', onMsg);
          resolve(env);
        }
      };
      ws.addEventListener('message', onMsg);
      ws.send(JSON.stringify(obj));
    });
  }

  send(msg) {
    if (this.closed) return;
    if (this.mode === 'ws' && this.ws && this.ws.readyState === 1) {
      try {
        this.ws.send(JSON.stringify({ t: 'send', msg }));
        return;
      } catch { /* упал — пробуем poll */ }
    }
    if (this.mode === 'poll' && this.sid) {
      // огонь без ожидания
      fetch(this.url + '/api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ t: 'send', sid: this.sid, msg })
      }).catch(() => {});
    }
  }

  close() {
    this.closed = true;
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
    if (this.sid) {
      this._api({ t: 'leave', sid: this.sid }).catch(() => {});
      this.sid = null;
    }
  }
}

// ————— хост-снапшот и применение намерений (общий код UI и тестов) —————

// Упаковка состояния движка для гостя (координаты/команды — в системе хоста).
export function buildHostSnapshot(battle, events) {
  const r1 = (v) => Math.round(v * 10) / 10;
  const units = battle.units.filter((u) => u.alive).map((u) => [
    u.id,
    u.cardId || (u.card && u.card.id) || '',
    u.team,
    r1(u.x), r1(u.y),
    Math.round(u.hp), Math.round(u.maxHp),
    (u.flying ? 1 : 0) | (u.isBuilding ? 2 : 0) |
    ((u.shieldMax > 0 && u.shieldHp > 0) ? 4 : 0) |
    (battle.time < u.frozenUntil ? 8 : 0) | (battle.time < u.rageUntil ? 16 : 0)
  ]);
  const towers = battle.towers.map((t) => [
    t.id, t.team, t.kind, r1(t.x), r1(t.y), Math.round(t.hp), Math.round(t.maxHp), t.alive ? 1 : 0
  ]);
  return {
    t: 'snap',
    time: battle.time,
    finished: battle.finished,
    result: battle.result,
    rules: battle.rules || null,
    crowns: { player: battle.crowns.player, ai: battle.crowns.ai },
    elixir: [battle.teams.player.elixir, battle.teams.ai.elixir],
    hands: [battle.teams.player.hand.slice(), battle.teams.ai.hand.slice()],
    units,
    towers,
    events: events || []
  };
}

// Намерение гостя → высадка на хосте за команду 'ai'.
export function applyIntentToBattle(battle, msg, cardsById) {
  if (!msg || msg.t !== 'intent' || !battle || battle.finished) return false;
  const c = cardsById.get(msg.cardId);
  if (!c) return false;
  if (!battle.canPlaceAt(msg.x, msg.y, 'ai')) return false;
  if (!battle.canDeploy('ai', msg.cardId)) return false;
  battle.deploy(msg.cardId, msg.x, msg.y, 'ai');
  return true;
}

// ————— геометрия между видами хоста и гостя —————

export function rotate180(x, y) {
  return { x: -x, y: -y };
}

export function swapTeam(t) {
  return t === 'player' ? 'ai' : 'player';
}

function transformEvent(e) {
  // снапшот событий хоста → вид гостя
  const out = { ...e };
  if (typeof out.team === 'string') out.team = swapTeam(out.team);
  if (typeof out.x === 'number' && typeof out.y === 'number') {
    const p = rotate180(out.x, out.y);
    out.x = p.x;
    out.y = p.y;
  }
  if (typeof out.tx === 'number' && typeof out.ty === 'number') {
    const p = rotate180(out.tx, out.ty);
    out.tx = p.x;
    out.ty = p.y;
  }
  return out;
}

// ————— удалённый бой (сторона гостя) —————

export class RemoteBattle {
  /**
   * opts: { cardsById: Map, sendIntent: (msg)=>void }
   */
  constructor(opts = {}) {
    this.cardsById = opts.cardsById || new Map();
    this.sendIntent = opts.sendIntent || (() => {});
    this.units = [];
    this.towers = [];
    this.teams = {
      player: { hand: [], elixir: 5, queue: [] },
      ai: { hand: [], elixir: 5, queue: [] }
    };
    this.crowns = { player: 0, ai: 0 };
    this.time = 0;
    this.finished = false;
    this.result = null;
    this._unitMap = new Map();
    this._events = [];
    this._everGotSnapshot = false;
    this.lastSnapshotAt = 0;
    this.rules = { matchTime: 180, doubleElixirAt: 120, suddenDeath: false };
  }

  card(id) {
    return this.cardsById.get(id) || null;
  }

  // снапшот хоста (координаты и команды в СИСТЕМЕ ХОСТА) → локальный вид
  applySnapshot(s) {
    this._everGotSnapshot = true;
    this.lastSnapshotAt = Date.now();
    this.time = s.time || 0;
    if (s.rules) this.rules = s.rules;
    this.finished = !!s.finished;
    this.result = s.result
      ? { winner: swapTeam(s.result.winner), reason: s.result.reason }
      : null;
    this.crowns = {
      player: (s.crowns && (s.crowns.ai ?? 0)) || 0,
      ai: (s.crowns && (s.crowns.player ?? 0)) || 0
    };
    if (s.elixir) {
      this.teams.player.elixir = s.elixir[1] ?? 0; // хост ai → мой player
      this.teams.ai.elixir = s.elixir[0] ?? 0;
    }
    if (s.hands) {
      this.teams.player.hand = (s.hands[1] || []).slice();
      this.teams.ai.hand = (s.hands[0] || []).slice();
    }

    // юниты: обновляем/создаём объекты с плавным сглаживанием
    const seen = new Set();
    for (const row of s.units || []) {
      const [id, cardId, hostTeam, x, y, hp, maxHp, flags] = row;
      seen.add(id);
      const p = rotate180(x, y);
      const team = swapTeam(hostTeam);
      let u = this._unitMap.get(id);
      if (!u) {
        u = {
          id, alive: true, x: p.x, y: p.y, tx: p.x, ty: p.y,
          team, hp, maxHp,
          flying: !!(flags & 1),
          isBuilding: !!(flags & 2),
          shieldMax: !!(flags & 4) ? 1 : 0,
          shieldHp: !!(flags & 4) ? 1 : 0,
          speed: 1,
          frozenUntil: (flags & 8) ? (this.time + 1) : 0,
          rageUntil: (flags & 16) ? (this.time + 1) : 0,
          card: this.cardsById.get(cardId) || {
            id: cardId, name: '?', hp: maxHp, count: 1,
            model: { parts: [{ shape: 'box', pos: [0, 0.8, 0], rot: [0, 0, 0], scale: [0.6, 0.6, 0.6], color: '#888', emissive: '#000' }] }
          }
        };
        this._unitMap.set(id, u);
      } else {
        u.tx = p.x;
        u.ty = p.y;
        u.hp = hp;
        u.maxHp = maxHp;
        u.team = team;
        u.alive = true;
        u.frozenUntil = (flags & 8) ? (this.time + 1) : 0;
        u.rageUntil = (flags & 16) ? (this.time + 1) : 0;
        if (flags & 4) { u.shieldMax = 1; u.shieldHp = 1; } else { u.shieldMax = 0; u.shieldHp = 0; }
      }
    }
    for (const [id, u] of this._unitMap) {
      if (!seen.has(id)) {
        u.alive = false;
        this._unitMap.delete(id);
      }
    }
    this.units = [...this._unitMap.values()];

    // башни
    this.towers = (s.towers || []).map((row) => {
      const [id, hostTeam, kind, x, y, hp, maxHp, alive] = row;
      const p = rotate180(x, y);
      return {
        id, team: swapTeam(hostTeam), kind,
        x: p.x, y: p.y, hp, maxHp,
        alive: alive !== 0 && hp > 0
      };
    });

    for (const e of s.events || []) this._events.push(transformEvent(e));
  }

  // сглаживание движения между снапшотами
  update(dt) {
    const k = Math.min(1, dt * 14);
    for (const u of this.units) {
      u.x += (u.tx - u.x) * k;
      u.y += (u.ty - u.y) * k;
    }
  }

  drainEvents() {
    const out = this._events;
    this._events = [];
    return out;
  }

  canPlaceAt(x, y, team) {
    if (Math.abs(x) > ARENA.halfW - 0.2) return false;
    if (Math.abs(y) > ARENA.halfH - 0.2) return false;
    const sideOk = team === 'player' ? y <= -ARENA.riverY : y >= ARENA.riverY;
    return sideOk;
  }

  canDeploy(team, cardId) {
    const c = this.card(cardId);
    if (!c || this.finished) return false;
    return (this.teams[team]?.elixir ?? 0) >= c.cost;
  }

  deploy(cardId, x, y, team) {
    // гость отправляет намерение; хост решает, засчитывать ли
    if (this.finished || team !== 'player') return null;
    const p = rotate180(x, y); // в координаты хоста
    this.sendIntent({ t: 'intent', cardId, x: p.x, y: p.y });
    return null;
  }
}
