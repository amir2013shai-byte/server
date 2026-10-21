// Простой, но живой ИИ: обороняется от пушей игрока и сам ходит в атаку.

export class BattleAI {
  constructor(battle, team = 'ai') {
    this.battle = battle;
    this.team = team;
    this.thinkIn = 2 + Math.random() * 2;
    this.pushIn = 8;
  }

  update(dt) {
    const b = this.battle;
    if (b.finished) return;
    this.thinkIn -= dt;
    this.pushIn -= dt;
    if (this.thinkIn > 0) return;
    this.thinkIn = 1.2 + Math.random() * 1.4;

    const enemyTeam = this.team === 'player' ? 'ai' : 'player';
    const mySide = this.team === 'player' ? (y) => y < -1.2 : (y) => y > 1.2;

    // угрозы на своей половине
    const threats = b.units.filter((u) => u.team === enemyTeam && u.alive && mySide(u.y));
    const threatPower = threats.reduce((s, u) => s + u.card.cost + (u.hp / 1000), 0);

    const hand = b.teams[this.team].hand;
    const affordable = hand
      .map((id) => b.card(id))
      .filter((c) => c && c.cost <= b.teams[this.team].elixir);

    if (!affordable.length) return;

    // ——— оборона ———
    if (threats.length && threatPower > 3 && Math.random() < 0.85) {
      // центроид угрозы
      let cx = 0, cy = 0;
      for (const t of threats) { cx += t.x; cy += t.y; }
      cx /= threats.length; cy /= threats.length;

      // предпочитаем сплэш/рой против толпы, танка против одного сильного
      let pick = null;
      const swarm = threats.length >= 3;
      if (swarm) {
        pick = affordable.find((c) => (c.splash > 0) || c.type === 'spell') ||
               affordable.find((c) => (c.count || 1) > 1);
      }
      if (!pick) {
        pick = affordable.find((c) => c.type === 'troop' && c.hp > 1500) || affordable[0];
      }
      // ставим чуть ближе к своему королю от угрозы
      const dir = this.team === 'player' ? -1 : 1;
      const px = clampX(cx + (Math.random() - 0.5) * 2);
      const py = clampY(cy + dir * 2.5 + (Math.random() - 0.5) * 1.5);
      this._play(pick.id, px, py);
      return;
    }

    // ——— атака ———
    if (this.pushIn <= 0 && b.teams[this.team].elixir >= 6) {
      this.pushIn = 9 + Math.random() * 7;
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
      if (support.length && b.teams[this.team].elixir >= 4) {
        const s = support[Math.floor(Math.random() * support.length)];
        this._play(s.id, bx + (Math.random() - 0.5) * 2, backY + (this.team === 'player' ? 2 : -2));
      }
      return;
    }

    // ——— случайная мелочь при избытке эликсира ———
    if (b.teams[this.team].elixir >= 9 && Math.random() < 0.3) {
      const c = affordable.find((x) => x.type === 'troop') || affordable[0];
      const lane = Math.random() < 0.5 ? -1 : 1;
      this._play(c.id, lane * 5.2 + (Math.random() - 0.5) * 3, this.team === 'player' ? -6 : 6);
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
