// CommanderAI: «союзник/второй командир» для режима 2×2.
// У каждого командира своя колода и СВОЙ эликсир; высадка — free-деплоем
// (в движке общий пул команды, поэтому командир ведёт свой счётчик).

export class CommanderAI {
  constructor(battle, team, deck, skill = 1) {
    this.b = battle;
    this.team = team;
    this.deck = deck.slice(0, 8);
    this.skill = Math.max(0, Math.min(3, skill));
    this.elixir = 5;
    this.hand = this.deck.slice(0, 4);
    this.queue = this.deck.slice(4);
    this.thinkIn = 1.4 + Math.random() * 1.2;
  }

  update(dt) {
    const b = this.b;
    if (!b || b.finished) return;
    // свой эликсир: как в движке (1/2.8с, двойной — 1/1.4с)
    const rate = (b.time >= (b.rules?.doubleElixirAt ?? 9999)) ? 1 / 1.4 : 1 / 2.8;
    this.elixir = Math.min(10, this.elixir + rate * dt);
    this.thinkIn -= dt;
    if (this.thinkIn > 0) return;
    this.thinkIn = (1.6 - this.skill * 0.25) + Math.random() * (1.6 - this.skill * 0.2);

    const foeTeam = this.team === 'player' ? 'ai' : 'player';
    const foes = b.units.filter((u) => u.team === foeTeam && u.alive);
    const mySide = this.team === 'player' ? (y) => y < -1 : (y) => y > 1;

    const affordable = this.hand.filter((id) => {
      const c = b.card(id);
      return c && c.cost <= this.elixir;
    });
    if (!affordable.length) return;

    // оборона: бьём по ближайшим к своей половине
    const threats = foes.filter((u) => mySide(u.y));
    if (threats.length && Math.random() < 0.75 + this.skill * 0.06) {
      const t = threats.reduce((s, u) => (u.hp > s.hp ? u : s), threats[0]);
      const id = affordable[Math.floor(Math.random() * affordable.length)];
      this._deploy(id, t.x + (Math.random() - 0.5) * 2, t.y + (this.team === 'player' ? -2.2 : 2.2));
      return;
    }

    // атака: с танком вперёд
    if (this.elixir >= 6.5) {
      const tanks = affordable.filter((id) => (b.card(id).hp || 0) >= 1500);
      const id = tanks[0] || affordable[Math.floor(Math.random() * affordable.length)];
      const lane = (Math.random() - 0.5) * 8;
      this._deploy(id, lane, this.team === 'player' ? -9.5 : 9.5);
    }
  }

  _deploy(id, x, y) {
    const c = this.b.card(id);
    if (!c) return;
    this.elixir -= c.cost;
    this.b.deploy(id, x, y, this.team, { free: true, noCycle: true });
    // смена карты в руке (простой цикл)
    const i = this.hand.indexOf(id);
    if (i >= 0 && this.queue.length) {
      const next = this.queue.shift();
      this.queue.push(this.hand[i]);
      this.hand[i] = next;
    }
  }
}
