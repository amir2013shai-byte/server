// 2D-вид битвы (canvas): арена, башни с видимым HP, юниты-спрайты, эффекты.
// Никакого WebGL/3D — плоская арена сверху, рисунок карты как спрайт.
import { ARENA } from '../game/engine.js';
import { drawCardSprite, baseSprite } from './art2d.js';

const PLAYER_RING = '#4a90ff';
const ENEMY_RING = '#e05555';
const MARGIN = 1.35; // поля за стенами

// тема арены по умолчанию (Зелёные луга)
const DEFAULT_THEME = {
  wall: '#2c3a55', fieldA: '#3f7d46', fieldB: '#468a4e',
  ownTint: 'rgba(60,110,220,0.10)', enemyTint: 'rgba(220,90,70,0.08)',
  river: '#2e7dd6', riverLine: 'rgba(255,255,255,0.12)',
  bridge: '#a5794c', bridgePlank: 'rgba(72,46,22,0.32)', bridgeRail: '#8a6238', bridgeEdge: 'rgba(52,32,14,0.5)'
};

function clampN(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export class BattleView {
  constructor(container, battle, opts = {}) {
    this.container = container;
    this.battle = battle;
    this.opts = opts || {};
    this.pendingCard = null;
    this.pointer = { down: false, x: 0, y: 0 };
    this.projectiles = [];
    this.fx = [];
    this.floating = [];
    this._disposed = false;
    this._t = 0;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'battle-2d';
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;';
    container.appendChild(this.canvas);

    this._ctx = null;
    try {
      this._ctx = this.canvas.getContext('2d');
    } catch {
      this._ctx = null; // jsdom/старые WebView — рисование пропущено, ввод работает
    }

    this._bindInput();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  // ——— координаты ———

  _bounds() {
    return {
      minX: -(ARENA.halfW + MARGIN), maxX: ARENA.halfW + MARGIN,
      minY: -(ARENA.halfH + MARGIN), maxY: ARENA.halfH + MARGIN
    };
  }

  // равномерный масштаб + letterbox: арена НЕ растягивается на широких экранах
  _viewTransform() {
    const b = this._bounds();
    const worldW = b.maxX - b.minX, worldH = b.maxY - b.minY;
    const w = this.canvas.width || 1, h = this.canvas.height || 1;
    const scale = Math.min(w / worldW, h / worldH);
    return {
      b, scale,
      ox: (w - worldW * scale) / 2,
      oy: (h - worldH * scale) / 2
    };
  }

  worldToScreen(x, y) {
    const t = this._viewTransform();
    return {
      x: t.ox + (x - t.b.minX) * t.scale,
      y: t.oy + (t.b.maxY - y) * t.scale
    };
  }

  // Точка экрана (clientX/Y) → точка арены {x,y} (низ экрана — своя половина).
  screenToGround(clientX, clientY) {
    const el = this.canvas;
    if (!el) return null;
    const rect = el.getBoundingClientRect ? el.getBoundingClientRect() : { left: 0, top: 0, width: 1, height: 1 };
    if (!rect.width || !rect.height) return null;
    // CSS-пиксели → пиксели холста
    const devX = (clientX - rect.left) / rect.width * (this.canvas.width || 1);
    const devY = (clientY - rect.top) / rect.height * (this.canvas.height || 1);
    const t = this._viewTransform();
    // клики по полям-«полям» (letterbox) прижимаем к краю арены
    const x = clampN((devX - t.ox) / t.scale + t.b.minX, t.b.minX, t.b.maxX);
    const y = clampN(t.b.maxY - (devY - t.oy) / t.scale, t.b.minY, t.b.maxY);
    return { x, y };
  }

  // Показать «призрак» карты в точке экрана (для перетаскивания из руки).
  ghostTo(clientX, clientY) {
    const p = this.screenToGround(clientX, clientY);
    if (p) this._updateGhost(p.x, p.y);
    return p;
  }

  // ——— ввод ———

  _bindInput() {
    const el = this.canvas;

    const down = (x, y) => {
      this.pointer.down = true;
      const p = this.screenToGround(x, y);
      if (p) {
        this.pointer.x = p.x;
        this.pointer.y = p.y;
        if (this.pendingCard) this._updateGhost(p.x, p.y);
      }
    };
    const move = (x, y) => {
      if (!this.pointer.down) return;
      const p = this.screenToGround(x, y);
      if (p) {
        this.pointer.x = p.x;
        this.pointer.y = p.y;
        if (this.pendingCard) this._updateGhost(p.x, p.y);
      }
    };
    const up = (x, y) => {
      if (!this.pointer.down) return;
      this.pointer.down = false;
      if (!this.pendingCard || !this.opts.onDeployRequest) return;
      const p = this.screenToGround(x, y) || { x: this.pointer.x, y: this.pointer.y };
      this.opts.onDeployRequest(this.pendingCard.id || this.pendingCard, p.x, p.y);
    };
    const cancel = () => {
      this.pointer.down = false;
    };

    const handlers = [];
    const on = (type, fn, opts) => {
      el.addEventListener(type, fn, opts);
      handlers.push([type, fn, opts]);
    };

    if (typeof window !== 'undefined' && window.PointerEvent) {
      on('pointerdown', (ev) => { ev.preventDefault(); down(ev.clientX, ev.clientY); });
      on('pointermove', (ev) => { if (this.pointer.down) ev.preventDefault(); move(ev.clientX, ev.clientY); });
      on('pointerup', (ev) => up(ev.clientX, ev.clientY));
      on('pointercancel', cancel);
    } else {
      // старые WebView без Pointer Events
      on('touchstart', (ev) => { ev.preventDefault(); const t = ev.touches[0]; if (t) down(t.clientX, t.clientY); }, { passive: false });
      on('touchmove', (ev) => { if (this.pointer.down) ev.preventDefault(); const t = ev.touches[0]; if (t) move(t.clientX, t.clientY); }, { passive: false });
      on('touchend', (ev) => { const t = ev.changedTouches[0]; if (t) up(t.clientX, t.clientY); });
      on('touchcancel', cancel);
      on('mousedown', (ev) => { ev.preventDefault(); down(ev.clientX, ev.clientY); });
      on('mousemove', (ev) => move(ev.clientX, ev.clientY));
      on('mouseup', (ev) => up(ev.clientX, ev.clientY));
    }
    this._inputHandlers = handlers;
  }

  setPendingCard(card) {
    this.pendingCard = card;
    this.ghost = card ? { x: 0, y: 0, visible: false, ok: false } : null;
    if (card) this._updateGhost(this.pointer.x, this.pointer.y);
  }

  _updateGhost(x, y) {
    if (!this.ghost) return;
    this.ghost.x = x;
    this.ghost.y = y;
    this.ghost.visible = true;
    const c = this.pendingCard;
    this.ghost.ok = this.battle.canPlaceAt(x, y, this.opts.team || 'player', c && c.id ? c : null);
    this.ghost.radius = c && c.type === 'spell' && c.spell ? (c.spell.radius || 2.5) : 1.1;
  }

  // ——— синхронизация ———

  update(dt, externalEvents) {
    if (this._disposed) return;
    this._t += dt;
    const b = this.battle;
    const events = externalEvents || b.drainEvents();
    for (const e of events) this._handleEvent(e);

    // снаряды
    for (const p of this.projectiles) {
      p.t = Math.min(1, p.t + dt * p.speed);
    }
    this.projectiles = this.projectiles.filter((p) => p.t < 1);

    // эффекты
    for (const f of this.fx) f.t += dt;
    this.fx = this.fx.filter((f) => f.t < f.dur);

    // всплывающие числа
    for (const f of this.floating) f.t += dt;
    this.floating = this.floating.filter((f) => f.t < f.dur);

    this._draw();
  }

  // ——— отрисовка ———

  _draw() {
    const ctx = this._ctx;
    if (!ctx) return;
    const W = this.canvas.width, H = this.canvas.height;
    const t = this._t;
    ctx.clearRect(0, 0, W, H);

    this._drawArena(ctx, W, H);

    // зоны (яд)
    for (const z of this.battle.zones || []) {
      const p = this.worldToScreen(z.x, z.y);
      const r = this._scale(z.radius);
      ctx.fillStyle = 'rgba(120, 200, 80, 0.28)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // башни
    for (const tw of this.battle.towers) this._drawTower(ctx, tw, t);

    // юниты: сначала тени, потом сами
    const units = (this.battle.units || []).filter((u) => u.alive);
    for (const u of units) this._drawUnitShadow(ctx, u);
    for (const u of units) this._drawUnit(ctx, u, t);

    // снаряды
    for (const p of this.projectiles) {
      const x = p.x1 + (p.x2 - p.x1) * p.t;
      const y = p.y1 + (p.y2 - p.y1) * p.t;
      const lift = Math.sin(p.t * Math.PI) * (p.arc || 0.8);
      const s = this.worldToScreen(x, y);
      const scale = this._scale(1);
      ctx.fillStyle = p.color || '#ffe066';
      ctx.beginPath();
      ctx.arc(s.x, s.y - lift * scale * 1.6, Math.max(2.5, scale * 0.28), 0, Math.PI * 2);
      ctx.fill();
    }

    // эффекты
    for (const f of this.fx) {
      const k = Math.min(1, f.t / f.dur);
      const p = this.worldToScreen(f.x, f.y);
      const scale = this._scale(1);
      if (f.kind === 'ring' || f.kind === 'chargeFx') {
        ctx.strokeStyle = f.color || '#ffffff';
        ctx.globalAlpha = Math.max(0, 0.85 * (1 - k));
        ctx.lineWidth = Math.max(2, scale * 0.16);
        ctx.beginPath();
        ctx.arc(p.x, p.y, scale * (0.5 + k * (f.radius || 1.5)), 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'boom') {
        const r = scale * (0.4 + k * (f.radius || 1.2));
        const g = ctx.createRadialGradient(p.x, p.y, r * 0.15, p.x, p.y, r);
        g.addColorStop(0, f.color || 'rgba(255,180,80,0.95)');
        g.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = g;
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'line') {
        const p2 = this.worldToScreen(f.x2, f.y2);
        ctx.strokeStyle = f.color || '#ffe066';
        ctx.globalAlpha = Math.max(0, 0.95 * (1 - k));
        ctx.lineWidth = Math.max(2, scale * 0.12);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else if (f.kind === 'heal') {
        ctx.fillStyle = '#7dff9e';
        ctx.globalAlpha = Math.max(0, 0.75 * (1 - k));
        const s2 = scale * 0.42;
        const yy = p.y - k * scale * 1.8;
        ctx.fillRect(p.x - s2 / 2, yy - s2 / 6, s2, s2 / 3);
        ctx.fillRect(p.x - s2 / 6, yy - s2 / 2, s2 / 3, s2);
        ctx.globalAlpha = 1;
      } else if (f.kind === 'text') {
        ctx.fillStyle = f.color || '#ffffff';
        ctx.globalAlpha = Math.max(0, 1 - k);
        ctx.font = `700 ${Math.round(this._scale(1.1))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(f.text, p.x, p.y - k * this._scale(1.6));
        ctx.globalAlpha = 1;
      }
    }

    // призрак высадки
    if (this.ghost && this.ghost.visible && this.pendingCard) {
      const g = this.ghost;
      const p = this.worldToScreen(g.x, g.y);
      const scale = this._scale(1);
      if (g.radius > 1.2) {
        ctx.fillStyle = g.ok ? 'rgba(120,180,255,0.18)' : 'rgba(255,90,90,0.18)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, this._scale(g.radius), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = g.ok ? '#8ab8ff' : '#ff5555';
      ctx.lineWidth = Math.max(2, scale * 0.12);
      ctx.beginPath();
      ctx.arc(p.x, p.y, scale * 1.05, 0, Math.PI * 2);
      ctx.stroke();
      const spr = baseSprite(this.pendingCard, 64);
      ctx.globalAlpha = 0.75;
      ctx.drawImage(spr, p.x - scale, p.y - scale, scale * 2, scale * 2);
      ctx.globalAlpha = 1;
    }

    // всплывающие числа (поверх всего)
    ctx.textAlign = 'center';
    for (const f of this.floating) {
      const p = this.worldToScreen(f.x, f.y);
      ctx.fillStyle = f.color || '#ffd0d0';
      ctx.globalAlpha = Math.max(0, 1 - f.t / f.dur);
      ctx.font = `700 ${Math.round(this._scale(1.15))}px sans-serif`;
      ctx.fillText(f.text, p.x, p.y - f.t * this._scale(3.2));
      ctx.globalAlpha = 1;
    }
  }

  _scale(world) {
    // сколько пикселей в 1 условной единице арены (единый масштаб)
    return this._viewTransform().scale;
  }

  _drawArena(ctx, W, H) {
    const th = (this.opts && this.opts.theme) || DEFAULT_THEME;
    // поля за стенами
    ctx.fillStyle = th.wall;
    ctx.fillRect(0, 0, W, H);

    const tl = this.worldToScreen(-(ARENA.halfW), ARENA.halfH);
    const br = this.worldToScreen(ARENA.halfW, -(ARENA.halfH));
    const fw = br.x - tl.x, fh = br.y - tl.y;

    // газон полосами
    for (let i = 0; i < 14; i++) {
      ctx.fillStyle = i % 2 === 0 ? th.fieldA : th.fieldB;
      ctx.fillRect(tl.x, tl.y + (i / 14) * fh, fw, fh / 14 + 1);
    }

    // подсветка половин (своя — синеватая, вражеская — тепловатая)
    ctx.fillStyle = th.ownTint;
    ctx.fillRect(tl.x, tl.y + fh / 2, fw, fh / 2);
    ctx.fillStyle = th.enemyTint;
    ctx.fillRect(tl.x, tl.y, fw, fh / 2);

    // река
    const r1 = this.worldToScreen(0, ARENA.riverY);
    const r2 = this.worldToScreen(0, -ARENA.riverY);
    ctx.fillStyle = th.river;
    ctx.fillRect(tl.x, r1.y, fw, r2.y - r1.y);

    // мосты — дощатый настил
    for (const bx of [-ARENA.bridgeX, ARENA.bridgeX]) {
      const b1 = this.worldToScreen(bx - ARENA.bridgeHalfW, ARENA.riverY + 0.9);
      const b2 = this.worldToScreen(bx + ARENA.bridgeHalfW, -ARENA.riverY - 0.9);
      const w = b2.x - b1.x, h = b2.y - b1.y;
      // настил
      ctx.fillStyle = th.bridge;
      ctx.fillRect(b1.x, b1.y, w, h);
      // поперечные доски
      ctx.strokeStyle = th.bridgePlank;
      ctx.lineWidth = Math.max(1.5, w * 0.03);
      const planks = 7;
      for (let i = 1; i < planks; i++) {
        const y = b1.y + (h * i) / planks;
        ctx.beginPath();
        ctx.moveTo(b1.x, y);
        ctx.lineTo(b2.x, y);
        ctx.stroke();
      }
      // боковые брусья
      ctx.fillStyle = th.bridgeRail;
      const rail = Math.max(3, w * 0.12);
      ctx.fillRect(b1.x, b1.y, rail, h);
      ctx.fillRect(b2.x - rail, b1.y, rail, h);
      // тень краёв
      ctx.strokeStyle = th.bridgeEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(b1.x, b1.y, w, h);
    }

    // центральная линия
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const mid = this.worldToScreen(0, 0);
    ctx.moveTo(tl.x, mid.y);
    ctx.lineTo(br.x, mid.y);
    ctx.stroke();
  }

  _drawTower(ctx, tw, t) {
    const p = this.worldToScreen(tw.x, tw.y);
    const scale = this._scale(1);
    const isPlayer = tw.team === 'player';
    const stone = isPlayer ? '#5b7fd6' : '#d65b5b';
    const roof = isPlayer ? '#2c4a9c' : '#9c2c2c';
    const glow = isPlayer ? '#8ab8ff' : '#ff8a8a';

    if (!tw.alive) {
      // руины
      ctx.fillStyle = '#555b6e';
      const r = scale * (tw.kind === 'king' ? 1.9 : 1.5);
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3d4252';
      for (let i = 0; i < 5; i++) {
        const a = i * 1.25;
        ctx.fillRect(p.x + Math.cos(a) * r * 0.5 - r * 0.22, p.y + Math.sin(a) * r * 0.5 - r * 0.16, r * 0.44, r * 0.32);
      }
      return;
    }

    const kingSleep = tw.kind === 'king' && !tw.activated;
    const r = scale * (tw.kind === 'king' ? 1.9 : 1.5);

    // основание
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = roof;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 0.62, 0, Math.PI * 2);
    ctx.fill();

    if (tw.kind === 'king') {
      // зубцы + флаг
      ctx.fillStyle = stone;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.fillRect(p.x + Math.cos(a) * r * 0.78 - r * 0.16, p.y + Math.sin(a) * r * 0.78 - r * 0.16, r * 0.32, r * 0.32);
      }
      ctx.fillStyle = glow;
      ctx.fillRect(p.x - r * 0.06, p.y - r * 1.35, r * 0.12, r * 0.8);
      ctx.fillStyle = kingSleep ? '#8e97b4' : glow;
      ctx.beginPath();
      ctx.moveTo(p.x + r * 0.06, p.y - r * 1.35);
      ctx.lineTo(p.x + r * 0.75, p.y - r * 1.12);
      ctx.lineTo(p.x + r * 0.06, p.y - r * 0.9);
      ctx.closePath();
      ctx.fill();
      if (kingSleep) {
        // спит — не стреляет
        ctx.fillStyle = '#dfe6ff';
        ctx.font = `700 ${Math.round(scale * 0.9)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('💤', p.x, p.y - r * 1.55);
      }
    } else {
      // кристалл боковой башни
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y - r * 0.55, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // полоса HP башни — ВСЕГДА видна + точные числа
    const barW = scale * 3.4;
    const barH = Math.max(6, scale * 0.42);
    const bx = p.x - barW / 2;
    const by = p.y - r - barH * 2.6;
    const ratio = Math.max(0, tw.hp / tw.maxHp);
    ctx.fillStyle = 'rgba(10,14,24,0.85)';
    ctx.fillRect(bx - 2, by - 2, barW + 4, barH + 4);
    ctx.fillStyle = ratio > 0.5 ? '#35d05a' : ratio > 0.25 ? '#e0c040' : '#e05555';
    ctx.fillRect(bx, by, barW * ratio, barH);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, barW, barH);
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${Math.round(barH * 1.05)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.ceil(tw.hp)}`, p.x, by - 4);
  }

  _drawUnitShadow(ctx, u) {
    const p = this.worldToScreen(u.x, u.y);
    const scale = this._scale(1);
    const r = scale * (u.isBuilding ? 1.15 : Math.max(0.5, Math.min(1.05, (u.radius || 0.7) * 1.02)));
    ctx.fillStyle = u.flying ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.18)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + r * 0.5, r * (u.flying ? 0.75 : 1), r * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawUnit(ctx, u, t) {
    const b = this.battle;
    const p = this.worldToScreen(u.x, u.y);
    const scale = this._scale(1);
    const frozen = b.time < u.frozenUntil;
    const raged = b.time < u.rageUntil;
    const moving = u.speed > 0 && !frozen && !(u.isBuilding);

    // кольцо команды = «хитбокс» юнита — совпадает с его реальным радиусом
    const ringR = scale * (u.isBuilding ? 1.3 : Math.max(0.55, Math.min(1.15, (u.radius || 0.7) * 1.1)));
    ctx.strokeStyle = frozen ? '#9adcff' : raged ? '#c26bf2' : (u.team === 'player' ? PLAYER_RING : ENEMY_RING);
    ctx.lineWidth = Math.max(2, scale * 0.1);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + ringR * 0.35, ringR, ringR * 0.45, 0, 0, Math.PI * 2);
    ctx.stroke();

    // спрайт карты (с анимацией рисунка) — соразмерен юниту
    const size = scale * (u.isBuilding ? 2.3 : Math.max(1.3, Math.min(2.4, (u.radius || 0.7) * 2.6)));
    drawCardSprite(ctx, u.card || { id: u.cardId }, p.x, p.y - size * 0.28, size, t, { moving, flying: u.flying });

    // статусы
    if (frozen) {
      ctx.fillStyle = 'rgba(140, 210, 255, 0.35)';
      ctx.beginPath();
      ctx.arc(p.x, p.y - size * 0.28, size * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }
    if (u.shieldHp > 0) {
      ctx.strokeStyle = 'rgba(138,184,255,0.85)';
      ctx.lineWidth = Math.max(2, scale * 0.1);
      ctx.beginPath();
      ctx.arc(p.x, p.y - size * 0.28, size * 0.62, 0, Math.PI * 2);
      ctx.stroke();
    }

    // HP юнита (когда повреждён)
    const ratio = Math.max(0, u.hp / u.maxHp);
    if (ratio < 1) {
      const barW = ringR * 2.3;
      const barH = Math.max(3, scale * 0.2);
      const bx = p.x - barW / 2;
      const by = p.y - size * 0.95;
      ctx.fillStyle = 'rgba(10,14,24,0.8)';
      ctx.fillRect(bx - 1, by - 1, barW + 2, barH + 2);
      ctx.fillStyle = ratio > 0.5 ? '#35d05a' : ratio > 0.25 ? '#e0c040' : '#e05555';
      ctx.fillRect(bx, by, barW * ratio, barH);
      if (u.shieldMax > 0 && u.shieldHp > 0) {
        ctx.fillStyle = '#8ab8ff';
        ctx.fillRect(bx, by - barH - 2, barW * Math.max(0, u.shieldHp / u.shieldMax), barH * 0.8);
      }
    }
  }

  // ——— события ———

  _handleEvent(e) {
    switch (e.type) {
      case 'attack': {
        if (e.ranged) {
          this.projectiles.push({
            x1: e.x, y1: e.y, x2: e.tx, y2: e.ty,
            t: 0, speed: 3.2, arc: 1.1, color: '#ffe066'
          });
        }
        break;
      }
      case 'towerShot': {
        this.projectiles.push({
          x1: e.x, y1: e.y, x2: e.tx, y2: e.ty,
          t: 0, speed: 4.2, arc: 0.6, color: '#8ab8ff'
        });
        break;
      }
      case 'spellFx': {
        const colors = {
          damage: '#ff8b3c', heal: '#7dff9e', freeze: '#9adcff',
          stun: '#ffe066', rage: '#c26bf2', poison: '#8fcc6a', knockback: '#9adcff'
        };
        this.fx.push({ kind: 'ring', x: e.x, y: e.y, radius: e.radius || 2, color: colors[e.effect] || '#ffffff', t: 0, dur: 0.65 });
        break;
      }
      case 'boom':
        this.fx.push({ kind: 'boom', x: e.x, y: e.y, radius: e.radius || 1.2, t: 0, dur: 0.5 });
        break;
      case 'chainFx':
        this.fx.push({ kind: 'line', x: e.x1, y: e.y1, x2: e.x2, y2: e.y2, color: '#ffe066', t: 0, dur: 0.3 });
        break;
      case 'healFx':
        this.fx.push({ kind: 'heal', x: e.x, y: e.y, t: 0, dur: 0.9 });
        break;
      case 'death':
        this.fx.push({ kind: 'boom', x: e.x, y: e.y, radius: 0.9, color: 'rgba(200,200,200,0.8)', t: 0, dur: 0.45 });
        break;
      case 'hit': {
        if (e.kind === 'damage' && e.amount > 1) {
          const ent = this._entityPos(e.id);
          if (ent) this.floating.push({ x: ent.x, y: ent.y + 1.4, text: String(Math.round(e.amount)), color: '#ffd0d0', t: 0, dur: 0.9 });
        }
        break;
      }
      case 'towerDown':
        this.fx.push({ kind: 'boom', x: e.x !== undefined ? e.x : 0, y: e.y !== undefined ? e.y : 0, radius: 3.2, color: '#ffb03c', t: 0, dur: 0.7 });
        break;
      case 'chargeFx':
        this.fx.push({ kind: 'chargeFx', x: e.x, y: e.y, radius: 1.6, color: '#ffe066', t: 0, dur: 0.5 });
        break;
      case 'kingActivate':
        this.fx.push({ kind: 'text', x: 0, y: 0, text: '⚔️ Главная башня проснулась!', color: '#ffe066', t: 0, dur: 1.2 });
        break;
      case 'crit':
        this.fx.push({ kind: 'text', x: e.x, y: e.y, text: 'КРИТ!', color: '#ff9c3c', t: 0, dur: 0.8 });
        break;
      case 'dodge':
        this.fx.push({ kind: 'text', x: 0, y: 0, text: 'Мимо!', color: '#9adcff', t: 0, dur: 0.7 });
        break;
      case 'revive':
        this.fx.push({ kind: 'chargeFx', x: e.x, y: e.y, radius: 1.4, color: '#c26bf2', t: 0, dur: 0.8 });
        break;
      default:
        break;
    }
  }

  _entityPos(id) {
    for (const u of this.battle.units || []) if (u.id === id) return u;
    for (const tw of this.battle.towers || []) if (tw.id === id) return tw;
    return null;
  }

  resize() {
    if (this._disposed) return;
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 700;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
  }

  dispose() {
    this._disposed = true;
    window.removeEventListener('resize', this._onResize);
    for (const [type, fn, opts] of this._inputHandlers || []) {
      this.canvas.removeEventListener(type, fn, opts);
    }
    this._inputHandlers = [];
    this.canvas.remove();
  }
}
