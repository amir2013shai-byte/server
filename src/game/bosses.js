// BossController: способности боссов кампании в бою.
// meteor — урон по войскам игрока вокруг случайной цели;
// summon — бесплатный выводок на стороне босса;
// quake  — урон по ближайшей вышке игрока;
// curse  — урон по самому живучему юниту игрока;
// heal   — лечение войск босса.

export class BossController {
  constructor(battle, team, bossDef) {
    this.b = battle;
    this.team = team;
    this.def = bossDef;
    this.abilities = (bossDef.abilities || []).map((a) => ({ ...a, cd: Math.max(2, (a.every || 10) * 0.6) }));
    this.log = [];
  }

  update(dt) {
    const b = this.b;
    if (!b || b.finished) return;
    for (const a of this.abilities) {
      a.cd -= dt;
      if (a.cd <= 0) {
        a.cd = a.every || 10;
        try { this._fire(a); } catch { /* способность не должна ломать бой */ }
      }
    }
  }

  _fire(a) {
    const b = this.b;
    const foeTeam = this.team === 'player' ? 'ai' : 'player';
    const foes = b.units.filter((u) => u.team === foeTeam && u.alive);
    const mine = b.units.filter((u) => u.team === this.team && u.alive);

    if (a.type === 'meteor' && foes.length) {
      const target = foes[Math.floor(Math.random() * foes.length)];
      const r = a.radius || 2.6;
      for (const u of foes) {
        if (Math.hypot(u.x - target.x, u.y - target.y) <= r) {
          b._damage(u, a.damage || 150, { source: 'boss', team: this.team });
        }
      }
      this.log.push({ type: 'meteor', x: target.x, y: target.y });
      return;
    }

    if (a.type === 'summon') {
      const backY = this.team === 'player' ? -11 : 11;
      b.deploy(a.card || 'skeletons', (Math.random() - 0.5) * 8, backY, this.team, { free: true, noCycle: true });
      this.log.push({ type: 'summon' });
      return;
    }

    if (a.type === 'quake') {
      const towers = b.towers.filter((t) => t.team === foeTeam && t.hp > 0);
      if (!towers.length) return;
      // ближайшая к центру вышка противника
      towers.sort((p, q) => Math.abs(p.x) + Math.abs(p.y) - (Math.abs(q.x) + Math.abs(q.y)));
      b._damage(towers[0], a.damage || 180, { source: 'boss', team: this.team });
      this.log.push({ type: 'quake', tower: towers[0].id || towers[0].kind });
      return;
    }

    if (a.type === 'curse' && foes.length) {
      const strong = foes.reduce((s, u) => (u.hp > s.hp ? u : s), foes[0]);
      b._damage(strong, Math.round(strong.hp * (a.percent || 0.2)), { source: 'boss', team: this.team });
      this.log.push({ type: 'curse' });
      return;
    }

    if (a.type === 'heal' && mine.length) {
      for (const u of mine) {
        if (u.hpMax) u.hp = Math.min(u.hpMax, u.hp + (a.amount || 250));
        else u.hp += (a.amount || 250);
      }
      this.log.push({ type: 'heal' });
    }
  }
}
