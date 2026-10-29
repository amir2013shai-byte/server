// Простой, но живой ИИ: обороняется от пушей игрока и сам ходит в атаку.
// Сложность (0..5) растёт с ареной: быстрее думает, точнее защищается,
// кидает заклинания и постройки-приманки, не сливает весь эликсир.

const isBuilding = (c) => c.type === 'building';

function powerOf(list) {
  return list.reduce((s, u) => s + u.card.cost + (u.hp / 1000), 0);
}

// мгновенный/повторяемый урон заклинанием (для роя и добивания вышек)
function spellDamage(c) {
  if (!c || !c.damage || !c.effect) return 0;
  const e = c.effect;
  if (e.type === 'rage' || e.type === 'freeze') return 0;
  if (e.repeat) return e.damagePerTick * (e.duration / e.repeat);
  if (e.type === 'deathDamage') return e.damage * 0.5;
  return e.damage || 0;
}

export class BattleAI {
  constructor(battle, team = 'ai', difficulty = 0) {
    this.battle = battle;
    this.team = team;
    this.d = Math.max(0, Math.min(9, difficulty | 0));
    this.thinkIn = (1.3 - this.d * 0.12) + Math.random() * (1.5 - this.d * 0.16);
    this.pushIn = 8;
    this.spellIn = 2 + Math.random() * 3;
  }

  update(dt) {
    const b = this.battle;
    if (!b || b.finished) return;
    this.thinkIn -= dt;
    this.pushIn -= dt;
    this.spellIn -= dt;

    // заклинания по кластерам/башням — с 2-й арены
    if (this.d >= 2 && this.spellIn <= 0) {
      this.spellIn = Math.max(1.5, 5 - this.d * 0.6) + Math.random() * 2;
      this._trySpell();
    }

    if (this.thinkIn > 0) return;
    // чем выше арена — тем быстрее бот соображает
    this.thinkIn = (1.3 - this.d * 0.12) + Math.random() * (1.5 - this.d * 0.16);

    const enemyTeam = this.team === 'player' ? 'ai' : 'player';
    const mySide = this.team === 'player' ? (y) => y < -1.2 : (y) => y > 1.2;

    // угрозы на своей половине
    const threats = b.units.filter((u) => u.team === enemyTeam && u.alive && mySide(u.y));
    const threatPower = powerOf(threats);

    const hand = b.teams[this.team].hand;
    const affordable = hand
      .map((id) => b.card(id))
      .filter((c) => c && c.cost <= b.teams[this.team].elixir);

    if (!affordable.length) return;

    // ——— оборона: почти всегда с 5-й арены ———
    const defendP = 0.72 + this.d * 0.05;
    if (threats.length && threatPower > 3 && Math.random() < defendP) {
      let cx = 0, cy = 0;
      for (const t of threats) { cx += t.x; cy += t.y; }
      cx /= threats.length; cy /= threats.length;

      const swarm = threats.length >= 3;
      // приманка-постройка на пути пуша (с 2-й арены): тянет танки на себя
      const building = affordable.find((c) => isBuilding(c));
      if (this.d >= 1 && threatPower > 6 && building && Math.random() < 0.45 + this.d * 0.08) {
        const dir = this.team === 'player' ? -1 : 1;
        this._play(building.id, clampX(cx), clampY(cy + dir * 3));
        return;
      }
      // предпочитаем сплэш/рой против толпы, танка против одного сильного
      let pick = null;
      if (swarm) {
        pick = affordable.find((c) => (c.splash > 0) || c.type === 'spell') ||
               affordable.find((c) => (c.count || 1) > 1);
      }
      if (!pick) {
        pick = affordable.find((c) => c.type === 'troop' && c.hp > 1500) || affordable[0];
      }
      // ставим чуть ближе к своему королю от угрозы; с ареной точнее
      const dir = this.team === 'player' ? -1 : 1;
      const jitter = Math.max(0.5, 2 - this.d * 0.3);
      const px = clampX(cx + (Math.random() - 0.5) * jitter);
      const py = clampY(cy + dir * 2.5 + (Math.random() - 0.5) * jitter);
      this._play(pick.id, px, py);
      return;
    }

    // ——— атака: с высокой арены не ждёт полного эликсира ———
    const threshold = Math.max(3.5, 6 - this.d * 0.5);
    if (this.pushIn <= 0 && b.teams[this.team].elixir >= threshold) {
      this.pushIn = (9.5 - this.d * 0.7) + Math.random() * (7 - this.d * 0.5);
      const tanks = affordable.filter((c) => c.type === 'troop' && c.hp >= 2000 && c.buildingOnly !== true);
      const winCons = affordable.filter((c) => c.type === 'troop' && c.buildingOnly);
      const support = affordable.filter((c) => c.type === 'troop' && c.range > 2 && !c.buildingOnly);

      const lane = Math.random() < 0.5 ? -1 : 1;
      const bx = lane * 5.2 + (Math.random() - 0.5) * 2;
      const backY = this.team === 'player' ? -10 : 10;

      const tank = winCons[0] || tanks[0];
      if (tank) {
        this._play(tank.id, bx + (Math.random() - 0.5), backY + (Math.random() - 0.5) * 2);
      }
      const reserve = this.d >= 4 ? 2 : 4; // с 5-й арены держит запас на ответку
      if (support.length && b.teams[this.team].elixir >= reserve) {
        const s = support[Math.floor(Math.random() * support.length)];
        this._play(s.id, bx + (Math.random() - 0.5) * 2, backY + (this.team === 'player' ? 2 : -2));
      }
      return;
    }

    // ——— случайная мелочь при избытке эликсира ———
    const overflow = Math.max(7, 9 - this.d * 0.4);
    if (b.teams[this.team].elixir >= overflow && Math.random() < 0.3) {
      const c = affordable.find((x) => x.type === 'troop') || affordable[0];
      const lane = Math.random() < 0.5 ? -1 : 1;
      this._play(c.id, lane * 5.2 + (Math.random() - 0.5) * 3, this.team === 'player' ? -6 : 6);
    }
  }

  // заклинания: рой противника → в центр кластера; башня на добивании → по ней
  _trySpell() {
    const b = this.battle;
    const me = b.teams[this.team];
    const enemyTeam = this.team === 'player' ? 'ai' : 'player';
    const spell = me.hand
      .map((id) => b.card(id))
      .find((c) => c && c.type === 'spell' && spellDamage(c) > 0 && c.cost <= me.elixir);
    if (!spell) return;
    const dmg = spellDamage(spell);

    const foes = b.units.filter((u) => u.team === enemyTeam && u.alive);
    if (foes.length >= 3) {
      let cx = 0, cy = 0;
      for (const t of foes) { cx += t.x; cy += t.y; }
      cx /= foes.length; cy /= foes.length;
      const near = foes.filter((u) => Math.hypot(u.x - cx, u.y - cy) < (spell.radius || 3) * 1.2).length;
      if (near >= 3) {
        b.deploy(spell.id, cx, cy, this.team);
        return;
      }
    }
    // добивание боковой вышки (с 3-й арены)
    if (this.d >= 3) {
      const tower = b.towers.find((t) => t.team === enemyTeam && t.kind !== 'king' && t.hp > 0 && t.hp < dmg * 0.85);
      if (tower) b.deploy(spell.id, tower.x, tower.y, this.team);
    }
  }

  _play(cardId, x, y) {
    const b = this.battle;
    if (!b.canPlaceAt(x, y, this.team)) {
      // подтягиваем к своей половине
      y = this.team === 'player' ? Math.min(y, -1.6) : Math.max(y, 1.6);
    }
    b.deploy(cardId, x, y, this.team);
  }
}

function clampX(x) {
  return Math.max(-8, Math.min(8, x));
}
function clampY(y) {
  return Math.max(-15, Math.min(15, y));
}
