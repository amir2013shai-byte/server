// Боевой движок: симуляция арены (башни, юниты, здания, заклинания, зоны).
// Арена: X ∈ [-9, 9], Y ∈ [-16, 16]. Игрок — снизу (y<0), ИИ — сверху (y>0).

export const ARENA = {
  halfW: 9,
  halfH: 16,
  riverY: 1.2,
  bridgeX: 5.2,
  bridgeHalfW: 1.6
};

export const MATCH_TIME = 180;      // секунд обычного времени
export const DOUBLE_ELIXIR_AT = 120; // после 2 минут — двойной эликсир

let uidCounter = 1;
function uid() {
  return uidCounter++;
}

function dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

function towerStats(team, kind) {
  if (kind === 'king') {
    return { hp: 4200, damage: 110, hitSpeed: 1.0, range: 7.2, radius: 1.75, sight: 7.2 };
  }
  return { hp: 2500, damage: 95, hitSpeed: 0.85, range: 7.5, radius: 1.45, sight: 7.5 };
}

export class Battle {
  /**
   * @param {object} opts
   * @param {Array} opts.playerDeck — массив id карт (8 шт.)
   * @param {Array} opts.enemyDeck
   * @param {Map|object} opts.cardsById
   */
  constructor(opts) {
    const map = opts.cardsById instanceof Map ? opts.cardsById : new Map(Object.entries(opts.cardsById || {}));
    this.cardsById = map;
    this.time = 0;
    this.finished = false;
    this.result = null; // { winner: 'player'|'ai'|'draw', reason }
    this.events = [];
    this.units = [];
    this.zones = [];
    this.towers = [];
    this.crowns = { player: 0, ai: 0 };

    // эликсир и руки
    this.teams = {
      player: { elixir: 5, deck: opts.playerDeck.slice(), hand: [], queue: [], drawn: [] },
      ai: { elixir: 5, deck: opts.enemyDeck.slice(), hand: [], queue: [], drawn: [] }
    };
    for (const team of ['player', 'ai']) {
      this._shuffle(this.teams[team].deck);
      const t = this.teams[team];
      t.hand = t.deck.splice(0, 4);
      t.queue = t.deck.slice();
    }

    this._buildTowers();

    // правила матча (режимы боя)
    this.rules = {
      matchTime: opts.matchTime || MATCH_TIME,
      doubleElixirAt: opts.doubleElixirAt !== undefined ? opts.doubleElixirAt : DOUBLE_ELIXIR_AT,
      suddenDeath: !!opts.suddenDeath
    };
  }

  _shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  _buildTowers() {
    for (const team of ['player', 'ai']) {
      const sign = team === 'player' ? -1 : 1;
      for (const kind of ['king', 'left', 'right']) {
        const s = towerStats(team, kind);
        const pos = kind === 'king'
          ? { x: 0, y: sign * 13.6 }
          : { x: (kind === 'left' ? -1 : 1) * 6.2, y: sign * 11.2 };
        this.towers.push({
          id: uid(),
          kind,
          team,
          x: pos.x,
          y: pos.y,
          z: 0,
          flying: false,
          hp: s.hp,
          maxHp: s.hp,
          damage: s.damage,
          hitSpeed: s.hitSpeed,
          range: s.range,
          radius: s.radius,
          sight: s.sight,
          cooldown: Math.random() * 0.5,
          alive: true,
          isTower: true,
          // главная башня спит, пока её не разбудят (урон или гибель боковой)
          activated: kind !== 'king',
          frozenUntil: 0,
          slowUntil: 0,
          slowFactor: 1
        });
      }
    }
  }

  emit(e) {
    this.events.push(e);
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  card(id) {
    return this.cardsById.get(id) || null;
  }

  // ——— состояние игры ———

  update(dt) {
    if (this.finished) return;
    dt = Math.min(dt, 0.05);
    this.time += dt;

    // эликсир
    const rate = (this.time >= this.rules.doubleElixirAt ? 1 / 1.4 : 1 / 2.8);
    for (const team of ['player', 'ai']) {
      const t = this.teams[team];
      t.elixir = Math.min(10, t.elixir + rate * dt);
    }

    // ауры усиления (buffAura): пересчитываем каждый тик
    for (const u of this.units) {
      u.buffDmgMul = 1;
      u.buffSpeedMul = 1;
    }
    for (const a of this.units) {
      if (!a.alive) continue;
      for (const ab of a.card.abilities || []) {
        if (ab.type !== 'buffAura') continue;
        const r2 = (ab.radius || 3) ** 2;
        for (const ally of this.units) {
          if (!ally.alive || ally.team !== a.team) continue;
          if (dist2(a.x, a.y, ally.x, ally.y) <= r2) {
            ally.buffDmgMul = Math.max(ally.buffDmgMul, ab.damageMul || 1.1);
            ally.buffSpeedMul = Math.max(ally.buffSpeedMul, ab.speedMul || 1.1);
          }
        }
      }
    }

    // зоны (ядовитые облака и т.п.)
    this._updateZones(dt);

    // юниты
    for (const u of this.units) {
      if (!u.alive) continue;
      this._updateUnit(u, dt);
    }

    // башни
    for (const tw of this.towers) {
      if (!tw.alive) continue;
      this._updateTower(tw, dt);
    }

    // разлипание
    this._separate(dt);

    // вода непроходима: возвращаем наземных в мосты/на берега
    for (const u of this.units) this._constrainToLand(u);

    // уборка трупов
    this.units = this.units.filter((u) => u.alive);

    // конец матча
    this._checkEnd();
  }

  _checkEnd() {
    const kingP = this.towers.find((t) => t.kind === 'king' && t.team === 'player');
    const kingA = this.towers.find((t) => t.kind === 'king' && t.team === 'ai');
    if (!kingP.alive) return this._finish('ai', 'king');
    if (!kingA.alive) return this._finish('player', 'king');
    // внезапная смерть: первая снесённая башня — сразу победа
    if (this.rules.suddenDeath && (this.crowns.player > 0 || this.crowns.ai > 0)) {
      return this._finish(this.crowns.player > 0 ? 'player' : 'ai', 'sudden');
    }
    if (this.time >= this.rules.matchTime) {
      if (this.crowns.player !== this.crowns.ai) {
        return this._finish(this.crowns.player > this.crowns.ai ? 'player' : 'ai', 'crowns');
      }
      const hpP = this._teamTowerHp('player');
      const hpA = this._teamTowerHp('ai');
      if (hpP !== hpA) return this._finish(hpP > hpA ? 'player' : 'ai', 'hp');
      return this._finish('draw', 'time');
    }
  }

  _teamTowerHp(team) {
    return this.towers.filter((t) => t.team === team && t.alive).reduce((s, t) => s + t.hp, 0);
  }

  _finish(winner, reason) {
    this.finished = true;
    this.result = { winner, reason };
    this.emit({ type: 'finish', winner, reason });
  }

  // ——— эликсир / рука ———

  canDeploy(team, cardId) {
    const c = this.card(cardId);
    if (!c) return false;
    return this.teams[team].elixir >= c.cost;
  }

  cycleHand(team, cardId) {
    const t = this.teams[team];
    const i = t.hand.indexOf(cardId);
    if (i < 0) return;
    const next = t.queue.shift();
    t.queue.push(cardId);
    if (next) t.hand[i] = next;
  }

  // ——— найм ———

  deploy(cardId, x, y, team, opts = {}) {
    const c = this.card(cardId);
    if (!c || this.finished) return null;
    const t = this.teams[team];
    if (!opts.free) {
      if (t.elixir < c.cost) return null;
      t.elixir -= c.cost;
    }
    x = clamp(x, -ARENA.halfW + 0.6, ARENA.halfW - 0.6);
    y = clamp(y, -ARENA.halfH + 0.6, ARENA.halfH - 0.6);

    if (c.type === 'spell') {
      this._castSpell(c, x, y, team);
      if (!opts.noCycle) this.cycleHand(team, cardId);
      this.emit({ type: 'spell', card: c.id, x, y, team });
      return null;
    }

    const count = c.type === 'troop' ? Math.max(1, c.count || 1) : 1;
    const spawned = [];
    const offsets = this._spreadOffsets(count);
    for (let i = 0; i < count; i++) {
      const u = this._makeUnit(c, team, x + offsets[i].x, y + offsets[i].y, opts);
      spawned.push(u);
    }

    // ауры при высадке (ярость и т.п. — через абилки карты)
    for (const ab of c.abilities || []) {
      if (ab.type === 'rageOnDeploy') {
        this._applyRage(x, y, ab.radius || 3, team, ab.duration || 6, ab.speedMul || 1.3, ab.attackMul || 1.3);
      }
    }

    if (!opts.noCycle) this.cycleHand(team, cardId);
    this.emit({ type: 'deploy', card: c.id, x, y, team, ids: spawned.map((u) => u.id) });
    return spawned[0];
  }

  _spreadOffsets(count) {
    if (count <= 1) return [{ x: 0, y: 0 }];
    const out = [];
    const ring = count <= 4 ? 0.85 : 1.25;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + 0.4;
      out.push({ x: Math.cos(a) * ring, y: Math.sin(a) * ring });
    }
    return out;
  }

  _makeUnit(c, team, x, y, opts = {}) {
    const u = {
      id: uid(),
      cardId: c.id,
      card: c,
      team,
      x, y,
      z: c.flying ? 1.35 : 0,
      flying: !!c.flying,
      hp: c.hp,
      maxHp: c.hp,
      shieldHp: 0,
      shieldMax: 0,
      damage: c.damage,
      hitSpeed: c.hitSpeed || 1,
      range: c.range || 1,
      speed: c.speed || 0,
      radius: 0.55 + Math.min(0.55, (c.hp || 500) / 8000),
      sight: c.sight || 5.5,
      splash: c.splash || 0,
      targets: c.targets || 'ground',
      buildingOnly: !!c.buildingOnly,
      isBuilding: c.type === 'building',
      alive: true,
      cooldown: 0.4 + Math.random() * 0.4,
      retargetIn: Math.random() * 0.3,
      targetId: null,
      frozenUntil: 0,
      slowUntil: 0,
      slowFactor: 1,
      rageUntil: 0,
      rageMul: 1,
      attackRageMul: 1,
      lifetime: c.building ? (c.building.lifetime || 30) : Infinity,
      spawnTimer: 2.5,
      summoned: !!opts.summoned,
      ownerBuildingId: opts.ownerBuildingId || null,
      deathSpawnDepth: opts.deathSpawnDepth || 0,
      chargeTimer: 0,
      charged: false,
      lastAttackMove: 0,
      deathDone: false
    };
    for (const ab of c.abilities || []) {
      if (ab.type === 'shield') {
        u.shieldHp = ab.hp;
        u.shieldMax = ab.hp;
      }
      if (ab.type === 'taunt') u.tauntRadius = ab.radius || 3;
    }
    u.buffDmgMul = 1;
    u.buffSpeedMul = 1;
    u.revived = false;
    this.units.push(u);
    this.emit({ type: 'spawn', id: u.id, card: c.id, x, y, team, flying: u.flying });
    return u;
  }

  // ——— заклинания ———

  _castSpell(c, x, y, team) {
    const sp = c.spell || {};
    const radius = sp.radius || 2.5;
    const enemyTeam = team === 'player' ? 'ai' : 'player';
    const isEnemy = (e) => e.team === enemyTeam && e.alive;
    const inRange = (e) => dist2(e.x, e.y, x, y) <= (radius + e.radius) ** 2;

    this.emit({ type: 'spellFx', card: c.id, x, y, radius, effect: sp.effect });

    switch (sp.effect) {
      case 'damage': {
        for (const u of this.units) {
          if (!isEnemy(u) || !inRange(u)) continue;
          if (u.flying && sp.targetsAir === false) continue;
          if (!u.flying && sp.targetsGround === false) continue;
          this._damage(u, sp.damage || 0, { source: c.id, team });
        }
        for (const tw of this.towers) {
          if (isEnemy(tw) && inRange(tw)) this._damage(tw, (sp.damage || 0) * 0.35, { source: c.id, team });
        }
        break;
      }
      case 'heal': {
        for (const u of this.units) {
          if (u.team !== team || !u.alive || !inRange(u)) continue;
          this._heal(u, sp.heal || 0);
        }
        break;
      }
      case 'freeze': {
        for (const e of [...this.units, ...this.towers]) {
          if (!isEnemy(e) || !inRange(e)) continue;
          e.frozenUntil = Math.max(e.frozenUntil, this.time + (sp.duration || 3));
          this.emit({ type: 'hit', id: e.id, kind: 'freeze' });
        }
        break;
      }
      case 'stun': {
        for (const u of this.units) {
          if (!isEnemy(u) || !inRange(u)) continue;
          if (u.flying && sp.targetsAir === false) continue;
          this._damage(u, sp.damage || 0, { source: c.id, team });
          u.frozenUntil = Math.max(u.frozenUntil, this.time + (sp.duration || 0.5));
        }
        for (const tw of this.towers) {
          if (isEnemy(tw) && inRange(tw)) {
            this._damage(tw, (sp.damage || 0) * 0.35, { source: c.id, team });
            if (sp.duration) tw.frozenUntil = Math.max(tw.frozenUntil, this.time + sp.duration * 0.5);
          }
        }
        break;
      }
      case 'rage': {
        this._applyRage(x, y, radius, team, sp.duration || 8, 1.35, 1.35);
        break;
      }
      case 'poison': {
        this.zones.push({
          x, y, radius, team,
          until: this.time + (sp.duration || 6),
          dps: sp.damage || 60,
          tick: 0,
          kind: 'poison'
        });
        break;
      }
      case 'knockback': {
        for (const u of this.units) {
          if (!isEnemy(u) || !inRange(u)) continue;
          this._damage(u, sp.damage || 0, { source: c.id, team });
          const dx = x - u.x, dy = y - u.y;
          const d = Math.max(0.4, Math.hypot(dx, dy));
          const f = 2.6;
          u.x += (dx / d) * f;
          u.y += (dy / d) * f;
          u.frozenUntil = Math.max(u.frozenUntil, this.time + 0.35);
        }
        break;
      }
      default:
        break;
    }
  }

  _applyRage(x, y, radius, team, duration, speedMul, attackMul) {
    for (const u of this.units) {
      if (u.team !== team || !u.alive) continue;
      if (dist2(u.x, u.y, x, y) > (radius + u.radius) ** 2) continue;
      u.rageUntil = Math.max(u.rageUntil, this.time + duration);
      u.rageMul = speedMul;
      u.attackRageMul = attackMul;
    }
  }

  _updateZones(dt) {
    for (const z of this.zones) {
      if (this.time > z.until) continue;
      z.tick -= dt;
      if (z.tick > 0) continue;
      z.tick = 1;
      const enemyTeam = z.team === 'player' ? 'ai' : 'player';
      for (const u of this.units) {
        if (u.team !== enemyTeam || !u.alive) continue;
        if (dist2(u.x, u.y, z.x, z.y) > (z.radius + u.radius) ** 2) continue;
        this._damage(u, z.dps, { source: 'zone', team: z.team });
      }
    }
    this.zones = this.zones.filter((z) => this.time <= z.until);
  }

  // ——— юниты ———

  _updateUnit(u, dt) {
    const c = u.card;

    // таймер жизни зданий
    if (u.isBuilding) {
      u.lifetime -= dt;
      if (u.lifetime <= 0) {
        this._kill(u, null);
        return;
      }
    }

    // заморозка
    if (this.time < u.frozenUntil) return;

    const frozen = this.time < u.frozenUntil;
    const slowed = this.time < u.slowUntil;
    const raged = this.time < u.rageUntil;
    const speedMul = (raged ? u.rageMul : 1) * (slowed ? u.slowFactor : 1) * (u.buffSpeedMul || 1);
    const atkMul = (raged ? u.attackRageMul : 1);

    // аура лечения (постоянная или по таймеру)
    for (const ab of c.abilities || []) {
      if (ab.type === 'healAura') {
        u._healTick = (u._healTick || 0) - dt;
        if (u._healTick <= 0) {
          u._healTick = 1;
          const r2 = ab.radius * ab.radius;
          for (const ally of this.units) {
            if (ally.team !== u.team || !ally.alive || ally === u) continue;
            if (dist2(ally.x, ally.y, u.x, u.y) <= r2) {
              this._heal(ally, ab.hps);
              this.emit({ type: 'healFx', x: ally.x, y: ally.y });
            }
          }
          if (ab.duration) {
            u._auraLife = (u._auraLife || 0) + 1;
          }
        }
      }
    }

    // спавнер-здания
    if (u.isBuilding) {
      for (const ab of c.abilities || []) {
        if (ab.type === 'spawnTroops') {
          u.spawnTimer -= dt;
          if (u.spawnTimer <= 0) {
            const alive = this.units.filter((x) => x.alive && x.ownerBuildingId === u.id).length;
            if (alive < (ab.max || 2)) {
              u.spawnTimer = ab.interval || 5;
              const dir = u.team === 'player' ? 1 : -1;
              const spawnedCard = this.card(ab.cardId);
              if (spawnedCard) {
                const su = this._makeUnit(spawnedCard, u.team, u.x + (Math.random() - 0.5) * 1.6, u.y + dir * 1.4, {
                  summoned: true, ownerBuildingId: u.id
                });
                this.emit({ type: 'spawn', id: su.id, card: su.cardId, x: su.x, y: su.y, team: u.team, flying: su.flying });
              }
            } else {
              u.spawnTimer = 1.2;
            }
          }
        }
      }
    }

    // выбор цели
    u.retargetIn -= dt;
    if (u.retargetIn <= 0 || !this._targetValid(u)) {
      u.retargetIn = 0.35;
      u.targetId = this._pickTarget(u);
    }
    const target = this._byId(u.targetId);
    if (!target) {
      // шаг к вражеским башням
      this._moveTowardGoal(u, this._defaultGoal(u), dt, speedMul);
      return;
    }

    const reach = u.range + u.radius + target.radius;
    const d2 = dist2(u.x, u.y, target.x, target.y);

    // заряд (таран, чемпион)
    for (const ab of c.abilities || []) {
      if (ab.type === 'charge') {
        if (d2 > (reach + 0.6) ** 2) {
          u.chargeTimer += dt;
          if (u.chargeTimer >= (ab.windup || 2.5)) u.charged = true;
        }
      }
    }

    if (d2 <= reach * reach) {
      u.cooldown -= dt * atkMul;
      if (u.cooldown <= 0) {
        u.cooldown = u.hitSpeed;
        this._attack(u, target);
        u.chargeTimer = 0;
      }
    } else if (!u.isBuilding && u.speed > 0) {
      this._moveTowardGoal(u, { x: target.x, y: target.y }, dt, speedMul, target);
    }
  }

  _byId(id) {
    if (!id) return null;
    for (const u of this.units) if (u.id === id && u.alive) return u;
    for (const t of this.towers) if (t.id === id && t.alive) return t;
    return null;
  }

  _targetValid(u) {
    const t = this._byId(u.targetId);
    if (!t) return false;
    if (u.buildingOnly && !t.isTower && !t.isBuilding) return false;
    // не гоняться слишком далеко
    const leash = (u.sight + 3.5) ** 2;
    return dist2(u.x, u.y, t.x, t.y) <= leash;
  }

  _pickTarget(u) {
    const enemyTeam = u.team === 'player' ? 'ai' : 'player';
    const canHit = (e) => {
      if (e.team !== enemyTeam || !e.alive) return false;
      if (e.flying && u.targets === 'ground') return false;
      return true;
    };

    // провокация (taunt): кто рядом с «провокатором» — обязан атаковать его
    if (!u.isBuilding) {
      for (const e of this.units) {
        if (!canHit(e) || e.isBuilding || !e.tauntRadius) continue;
        if (dist2(u.x, u.y, e.x, e.y) <= e.tauntRadius ** 2) return e.id;
      }
    }

    // стационарные здания атакуют только войска, никогда — башни
    if (u.isBuilding) {
      let best = null, bestD = Infinity;
      for (const e of this.units) {
        if (!canHit(e) || e.isBuilding) continue;
        const d = dist2(u.x, u.y, e.x, e.y);
        if (d <= (u.sight + 2) ** 2 && d < bestD) { bestD = d; best = e; }
      }
      return best ? best.id : null;
    }

    if (u.buildingOnly) {
      let best = null, bestD = Infinity;
      for (const e of [...this.towers, ...this.units]) {
        if (e.team !== enemyTeam || !e.alive) continue;
        if (!e.isTower && !e.isBuilding) continue;
        const d = dist2(u.x, u.y, e.x, e.y);
        if (d < bestD) { bestD = d; best = e; }
      }
      return best ? best.id : null;
    }

    // 1) ближайший вражеский юнит в радиусе обзора
    let best = null, bestD = Infinity;
    const sight2 = u.sight * u.sight;
    for (const e of this.units) {
      if (!canHit(e) || e.isBuilding) continue;
      const d = dist2(u.x, u.y, e.x, e.y);
      if (d <= sight2 && d < bestD) { bestD = d; best = e; }
    }
    if (best) return best.id;

    // 2) здания в радиусе обзора
    for (const e of this.units) {
      if (!canHit(e) || !e.isBuilding) continue;
      const d = dist2(u.x, u.y, e.x, e.y);
      if (d <= sight2 && d < bestD) { bestD = d; best = e; }
    }
    if (best) return best.id;

    // 3) башня по своей полосе (или ближайшая живая)
    return this._defaultGoalId(u);
  }

  _defaultGoalId(u) {
    const enemyTeam = u.team === 'player' ? 'ai' : 'player';
    const towers = this.towers.filter((t) => t.team === enemyTeam && t.alive);
    if (!towers.length) return null;
    // предпочитаем боковую башню на своей полосе
    const laneSign = Math.sign(u.x) || 1;
    const side = towers.filter((t) => t.kind !== 'king' && Math.sign(t.x) === laneSign);
    const pool = side.length ? side : towers.filter((t) => t.kind !== 'king');
    const finalPool = pool.length ? pool : towers;
    let best = finalPool[0], bestD = Infinity;
    for (const t of finalPool) {
      const d = dist2(u.x, u.y, t.x, t.y);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best.id;
  }

  _defaultGoal(u) {
    const t = this._byId(this._defaultGoalId(u));
    return t ? { x: t.x, y: t.y } : { x: 0, y: u.team === 'player' ? 14 : -14 };
  }

  _moveTowardGoal(u, goal, dt, speedMul, target) {
    if (u.speed <= 0) return;
    let gx = goal.x, gy = goal.y;

    // мосты: наземный юнит пересекает реку ТОЛЬКО по мосту (хитбокс воды)
    if (!u.flying) {
      const goalSide = gy === 0 ? (u.team === 'player' ? -1 : 1) : Math.sign(gy);
      const unitSide = Math.sign(u.y) || goalSide;
      const inRiver = Math.abs(u.y) <= ARENA.riverY;
      const wrongWay = unitSide !== goalSide;
      if (inRiver || wrongWay) {
        // мост, через который короче всего путь к цели
        const score = (b) => Math.abs(u.x - b) + Math.abs(gx - b);
        const bx = score(-ARENA.bridgeX) <= score(ARENA.bridgeX) ? -ARENA.bridgeX : ARENA.bridgeX;
        // лёгкая «полоса» на мосту, чтобы колонна не сбивалась в одну точку
        const n = parseInt(String(u.id).replace(/\D/g, ''), 10) || 0;
        const laneOff = ((n % 3) - 1) * 0.55;
        if (inRiver) {
          // на мосту/у реки — идти к выходу моста на сторону цели
          gx = bx + laneOff;
          gy = ARENA.riverY * goalSide * 1.35;
        } else {
          // на берегу, цель через реку — идти к входу моста.
          // Waypoint СТРОГО ВНУТРИ полосы реки (0.9): точка на самом берегу (1.35)
          // создавала мёртвую зону — юнит замирал в ней навсегда.
          gx = bx + laneOff;
          gy = ARENA.riverY * unitSide * 0.9;
        }
      }
    }

    const dx = gx - u.x, dy = gy - u.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.05) return;
    const step = u.speed * speedMul * dt;
    u.x += (dx / d) * Math.min(step, d);
    u.y += (dy / d) * Math.min(step, d);
    u.x = clamp(u.x, -ARENA.halfW + 0.3, ARENA.halfW - 0.3);
    u.y = clamp(u.y, -ARENA.halfH + 0.3, ARENA.halfH - 0.3);
  }

  // «хитбокс» реки: наземные юниты не могут находиться в воде вне мостов
  _constrainToLand(u) {
    if (!u || !u.alive || u.flying || u.isBuilding || u.isTower) return;
    if (Math.abs(u.y) >= ARENA.riverY) return;
    const half = ARENA.bridgeHalfW + 0.25;
    const inL = Math.abs(u.x + ARENA.bridgeX) <= half;
    const inR = Math.abs(u.x - ARENA.bridgeX) <= half;
    if (inL || inR) return; // на мосту — можно
    // рядом с мостом — вернуться на мост; далеко — вытолкнуть на ближайший берег
    const near = Math.abs(u.x + ARENA.bridgeX) < Math.abs(u.x - ARENA.bridgeX) ? -ARENA.bridgeX : ARENA.bridgeX;
    const off = u.x - near;
    if (Math.abs(off) <= half + 1.1) {
      u.x = near + Math.sign(off || 1) * (half - 0.02);
    } else {
      u.y = (u.y > 0 ? 1 : u.y < 0 ? -1 : (u.team === 'player' ? -1 : 1)) * ARENA.riverY;
    }
  }

  _separate(dt) {
    const arr = this.units;
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (!a.alive || a.isBuilding) continue;
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        if (!b.alive || b.isBuilding) continue;
        const dx = b.x - a.x, dy = b.y - a.y;
        const minD = a.radius + b.radius;
        const d2 = dx * dx + dy * dy;
        if (d2 > minD * minD || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = ((minD - d) / minD) * 1.6 * dt;
        const nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
      }
    }
  }

  _attack(u, target) {
    let dmg = u.damage * (u.buffDmgMul || 1);
    for (const ab of u.card.abilities || []) {
      if (ab.type === 'charge' && u.charged) {
        dmg *= ab.multiplier || 2;
        u.charged = false;
        this.emit({ type: 'chargeFx', id: u.id, x: u.x, y: u.y });
      }
      // критический удар
      if (ab.type === 'crit' && Math.random() < (ab.chance || 0.25)) {
        dmg *= ab.multiplier || 2;
        this.emit({ type: 'crit', id: u.id, x: u.x, y: u.y });
      }
    }

    // урон по площади
    if (u.splash > 0) {
      const enemyTeam = u.team === 'player' ? 'ai' : 'player';
      for (const e of [...this.units, ...this.towers]) {
        if (e.team !== enemyTeam || !e.alive) continue;
        if (e.flying && u.targets === 'ground') continue;
        if (dist2(e.x, e.y, target.x, target.y) <= (u.splash + e.radius) ** 2) {
          this._damage(e, dmg, { source: u.id, team: u.team });
        }
      }
    } else {
      this._damage(target, dmg, { source: u.id, team: u.team });
    }

    // эффекты удара
    for (const ab of u.card.abilities || []) {
      switch (ab.type) {
        case 'freezeHit':
          if (!ab.onDeath) {
            target.frozenUntil = Math.max(target.frozenUntil, this.time + (ab.duration || 1));
            this.emit({ type: 'hit', id: target.id, kind: 'freeze' });
          }
          break;
        case 'slowHit':
          if (target.slowUntil !== undefined) {
            target.slowUntil = this.time + (ab.duration || 2);
            target.slowFactor = ab.factor || 0.6;
            this.emit({ type: 'hit', id: target.id, kind: 'slow' });
          }
          break;
        case 'stunHit':
          if (target.frozenUntil !== undefined) {
            target.frozenUntil = Math.max(target.frozenUntil, this.time + (ab.duration || 0.5));
            this.emit({ type: 'hit', id: target.id, kind: 'stun' });
          }
          break;
        case 'knockback': {
          const enemyTeam = u.team === 'player' ? 'ai' : 'player';
          for (const e of this.units) {
            if (e.team !== enemyTeam || !e.alive || e.flying) continue;
            if (dist2(e.x, e.y, target.x, target.y) > (u.splash + 1) ** 2) continue;
            const dx = e.x - u.x, dy = e.y - u.y;
            const d = Math.max(0.4, Math.hypot(dx, dy));
            const f = ab.force || 2;
            e.x += (dx / d) * f;
            e.y += (dy / d) * f;
          }
          break;
        }
        case 'chain': {
          let from = target;
          let chainDmg = dmg * (ab.damage || 0.7);
          const hitIds = new Set([target.id]);
          const enemyTeam = u.team === 'player' ? 'ai' : 'player';
          for (let i = 0; i < (ab.bounces || 2); i++) {
            let next = null, bestD = Infinity;
            for (const e of [...this.units, ...this.towers]) {
              if (e.team !== enemyTeam || !e.alive || hitIds.has(e.id)) continue;
              if (e.flying && u.targets === 'ground') continue;
              const d = dist2(from.x, from.y, e.x, e.y);
              if (d < 16 && d < bestD) { bestD = d; next = e; }
            }
            if (!next) break;
            hitIds.add(next.id);
            this._damage(next, chainDmg, { source: u.id, team: u.team });
            this.emit({ type: 'chainFx', x1: from.x, y1: from.y, x2: next.x, y2: next.y, z: u.z });
            from = next;
            chainDmg *= (ab.damage || 0.7);
          }
          break;
        }
        case 'lifesteal': {
          const heal = dmg * (ab.percent || 1);
          this._heal(u, heal);
          break;
        }
        default:
          break;
      }
    }

    this.emit({ type: 'attack', id: u.id, targetId: target.id, x: u.x, y: u.y, tx: target.x, ty: target.y, z: u.z, ranged: u.range > 2 });
  }

  _damage(entity, amount, opts = {}) {
    if (!entity.alive || amount <= 0) return;
    // уклонение: шанс полностью уйти от урона
    if (entity.card && entity.card.abilities) {
      for (const ab of entity.card.abilities) {
        if (ab.type === 'dodge' && Math.random() < (ab.chance || 0.3)) {
          this.emit({ type: 'dodge', id: entity.id });
          return;
        }
      }
    }
    if (entity.shieldHp > 0) {
      const absorbed = Math.min(entity.shieldHp, amount);
      entity.shieldHp -= absorbed;
      amount -= absorbed;
      this.emit({ type: 'hit', id: entity.id, kind: 'shield' });
      if (amount <= 0) return;
    }
    entity.hp -= amount;
    this.emit({ type: 'hit', id: entity.id, kind: 'damage', amount });
    // главная башня просыпается, когда по ней бьют
    if (entity.isTower && entity.kind === 'king') this._activateKing(entity);
    // шипы: возвращаем часть урона атакующему
    if (entity.card && entity.card.abilities && opts.source) {
      for (const ab of entity.card.abilities) {
        if (ab.type !== 'thorns') continue;
        const src = this._byId(opts.source);
        if (src && src.alive && !src.isTower) {
          this._damage(src, amount * (ab.percent || 0.3), { source: entity.id, team: entity.team });
        }
      }
    }
    if (entity.hp <= 0) this._kill(entity, opts.source);
  }

  _heal(entity, amount) {
    if (!entity.alive || amount <= 0 || entity.hp >= entity.maxHp) return;
    entity.hp = Math.min(entity.maxHp, entity.hp + amount);
    this.emit({ type: 'heal', id: entity.id, amount });
  }

  _kill(entity, sourceId) {
    if (!entity.alive) return;

    // возрождение: один раз поднимается с частью HP
    if (!entity.isTower && entity.card && entity.card.abilities && !entity.revived) {
      for (const ab of entity.card.abilities) {
        if (ab.type === 'revive') {
          entity.revived = true;
          entity.alive = true;
          entity.hp = Math.max(1, entity.maxHp * (ab.hpPercent || 0.5));
          entity.deathDone = true; // смертельные абилки не срабатывают
          this.emit({ type: 'revive', id: entity.id, x: entity.x, y: entity.y, team: entity.team });
          return;
        }
      }
    }

    entity.alive = false;
    entity.hp = 0;

    if (entity.isTower) {
      const kind = entity.kind;
      const enemyTeam = entity.team === 'player' ? 'ai' : 'player';
      this.crowns[enemyTeam] += 1;
      this.emit({ type: 'towerDown', id: entity.id, team: entity.team, kind });
      // падение боковой башни будит главную башню той же команды
      const king = this.towers.find((t) => t.team === entity.team && t.kind === 'king');
      if (king) this._activateKing(king);
      return;
    }

    this.emit({ type: 'death', id: entity.id, card: entity.cardId, x: entity.x, y: entity.y, team: entity.team, z: entity.z });

    const c = entity.card;
    for (const ab of c.abilities || []) {
      if (ab.type === 'spawnOnDeath' && (entity.deathSpawnDepth || 0) < 2) {
        const card = this.card(ab.cardId);
        if (card) {
          const count = ab.count || 1;
          const offs = this._spreadOffsets(count);
          for (let i = 0; i < count; i++) {
            this._makeUnit(card, entity.team, entity.x + offs[i].x, entity.y + offs[i].y, {
              summoned: true,
              deathSpawnDepth: (entity.deathSpawnDepth || 0) + 1
            });
          }
        }
      } else if (ab.type === 'deathDamage') {
        this.emit({ type: 'boom', x: entity.x, y: entity.y, radius: ab.radius || 1.8 });
        const enemyTeam = entity.team === 'player' ? 'ai' : 'player';
        for (const e of [...this.units, ...this.towers]) {
          if (e.team !== enemyTeam || !e.alive) continue;
          if (dist2(e.x, e.y, entity.x, entity.y) <= ((ab.radius || 1.8) + e.radius) ** 2) {
            this._damage(e, ab.damage || 0, { source: entity.id, team: entity.team });
          }
        }
      } else if (ab.type === 'freezeHit' && ab.onDeath) {
        const enemyTeam = entity.team === 'player' ? 'ai' : 'player';
        for (const e of [...this.units, ...this.towers]) {
          if (e.team !== enemyTeam || !e.alive) continue;
          if (dist2(e.x, e.y, entity.x, entity.y) <= (2.4 + e.radius) ** 2) {
            e.frozenUntil = Math.max(e.frozenUntil, this.time + (ab.duration || 1.5));
            this.emit({ type: 'hit', id: e.id, kind: 'freeze' });
          }
        }
      }
    }
  }

  _updateTower(tw, dt) {
    if (this.time < tw.frozenUntil) return;
    // спящая главная башня не стреляет
    if (tw.kind === 'king' && !tw.activated) return;
    tw.cooldown -= dt;
    if (tw.cooldown > 0) return;

    const enemyTeam = tw.team === 'player' ? 'ai' : 'player';
    let best = null, bestD = Infinity;
    for (const u of this.units) {
      if (u.team !== enemyTeam || !u.alive || u.isBuilding) continue;
      if (dist2(tw.x, tw.y, u.x, u.y) > (tw.range + u.radius) ** 2) continue;
      const d = dist2(tw.x, tw.y, u.x, u.y);
      if (d < bestD) { bestD = d; best = u; }
    }
    if (!best) return;
    tw.cooldown = tw.hitSpeed;
    this._damage(best, tw.damage, { source: tw.id, team: tw.team });
    this.emit({ type: 'towerShot', id: tw.id, x: tw.x, y: tw.y, tx: best.x, ty: best.y, z: tw.kind === 'king' ? 3.2 : 2.6 });
  }

  // ——— выбор места высадки игроком ———

  // card опционален: заклинания можно кидать на ОБЕ половины, войска/здания — только на свою.
  canPlaceAt(x, y, team, card) {
    if (Math.abs(x) > ARENA.halfW - 0.2) return false;
    if (Math.abs(y) > ARENA.halfH - 0.2) return false;
    if (card && card.type === 'spell') return true;
    const sideOk = team === 'player' ? y <= -ARENA.riverY : y >= ARENA.riverY;
    return sideOk;
  }

  // пробуждение главной башни: получила урон или пала боковая башня её команды
  _activateKing(tower) {
    if (!tower || tower.kind !== 'king' || tower.activated || !tower.alive) return;
    tower.activated = true;
    tower.cooldown = Math.min(tower.cooldown, 0.3);
    this.emit({ type: 'kingActivate', id: tower.id, team: tower.team });
  }
}
