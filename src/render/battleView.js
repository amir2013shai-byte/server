// 3D-вид битвы: арена, башни, юниты, эффекты. Синхронизируется с движком каждый кадр.
import * as THREE from 'three';
import { buildModel, teamRing, healthBar, setHealthBar } from './modelBuilder.js';
import { ARENA } from '../game/engine.js';

const PLAYER_RING = '#4a90ff';
const ENEMY_RING = '#e05555';

export class BattleView {
  constructor(container, battle, opts = {}) {
    this.container = container;
    this.battle = battle;
    this.opts = opts;
    this.entities = new Map(); // unit/tower id -> { group, bar, ring, kind }
    this.projectiles = [];
    this.fx = [];
    this.pendingCard = null;
    this.ghost = null;
    this.pointer = { down: false, x: 0, y: 0 };
    this.floating = [];
    this._disposed = false;

    const w = container.clientWidth || 400;
    const h = container.clientHeight || 700;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x1a2238);
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.touchAction = 'none';
    this.renderer.domElement.style.display = 'block';

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x1a2238, 42, 85);

    this.camera = new THREE.PerspectiveCamera(42.5, w / h, 0.1, 200);
    this._layoutCamera();

    // свет
    const amb = new THREE.AmbientLight(0xb8c8ff, 0.85);
    const dir = new THREE.DirectionalLight(0xfff2dd, 1.35);
    dir.position.set(-14, 26, -12);
    this.scene.add(amb, dir);
    const back = new THREE.DirectionalLight(0x6688cc, 0.5);
    back.position.set(12, 16, 20);
    this.scene.add(back);

    this._buildArena();
    this._buildTowers();

    this.raycaster = new THREE.Raycaster();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._bindInput();

    // слой для «плывущих» чисел
    this.fxLayer = document.createElement('div');
    this.fxLayer.className = 'battle-fx-layer';
    this.fxLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;';
    container.appendChild(this.fxLayer);

    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  _layoutCamera() {
    // камера над своей половиной: низ экрана — своя зона, верх — вражеская
    this.camera.position.set(0, 36, -16);
    this.camera.lookAt(0, 0, -2);
  }

  _buildArena() {
    const s = this.scene;
    // пол
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA.halfW * 2 + 2.6, ARENA.halfH * 2 + 2.6),
      new THREE.MeshStandardMaterial({ color: 0x3f7d46, roughness: 1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.02;
    s.add(ground);

    // клетки-полосы для глубины
    for (let i = -7; i <= 7; i++) {
      const strip = new THREE.Mesh(
        new THREE.PlaneGeometry(ARENA.halfW * 2, 1.9),
        new THREE.MeshStandardMaterial({ color: i % 2 === 0 ? 0x468a4e : 0x3f7d46, roughness: 1 })
      );
      strip.rotation.x = -Math.PI / 2;
      strip.position.set(0, -0.01, i * 2.2);
      s.add(strip);
    }

    // река
    const river = new THREE.Mesh(
      new THREE.PlaneGeometry(ARENA.halfW * 2 + 2.6, ARENA.riverY * 2),
      new THREE.MeshStandardMaterial({
        color: 0x2e7dd6, transparent: true, opacity: 0.88, roughness: 0.25, metalness: 0.35
      })
    );
    river.rotation.x = -Math.PI / 2;
    river.position.y = 0.06;
    s.add(river);

    // мосты
    for (const bx of [-ARENA.bridgeX, ARENA.bridgeX]) {
      const bridge = new THREE.Mesh(
        new THREE.BoxGeometry(ARENA.bridgeHalfW * 2, 0.22, ARENA.riverY * 2 + 1.4),
        new THREE.MeshStandardMaterial({ color: 0x9a7248, roughness: 0.9 })
      );
      bridge.position.set(bx, 0.11, 0);
      s.add(bridge);
    }

    // стенки
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2c3a55, roughness: 0.95 });
    for (const [x, z, w, d] of [
      [-(ARENA.halfW + 1.3), 0, 1.2, ARENA.halfH * 2 + 4],
      [ARENA.halfW + 1.3, 0, 1.2, ARENA.halfH * 2 + 4],
      [0, -(ARENA.halfH + 1.3), ARENA.halfW * 2 + 4, 1.2],
      [0, ARENA.halfH + 1.3, ARENA.halfW * 2 + 4, 1.2]
    ]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.6, d), wallMat);
      wall.position.set(x, 0.8, z);
      s.add(wall);
    }
  }

  _buildTowers() {
    for (const tw of this.battle.towers) {
      const group = new THREE.Group();
      const isPlayer = tw.team === 'player';
      const stone = isPlayer ? '#5b7fd6' : '#d65b5b';
      const roof = isPlayer ? '#2c4a9c' : '#9c2c2c';
      const glow = isPlayer ? '#8ab8ff' : '#ff8a8a';

      if (tw.kind === 'king') {
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(3.2, 1.1, 3.2),
          new THREE.MeshStandardMaterial({ color: stone, roughness: 0.85 })
        );
        base.position.y = 0.55;
        const keep = new THREE.Mesh(
          new THREE.BoxGeometry(2.5, 2.6, 2.5),
          new THREE.MeshStandardMaterial({ color: stone, roughness: 0.8 })
        );
        keep.position.y = 2.2;
        const roofM = new THREE.Mesh(
          new THREE.ConeGeometry(2.1, 1.6, 4),
          new THREE.MeshStandardMaterial({ color: roof, roughness: 0.7 })
        );
        roofM.position.y = 4.1;
        roofM.rotation.y = Math.PI / 4;
        const flag = new THREE.Mesh(
          new THREE.BoxGeometry(0.12, 1.2, 0.12),
          new THREE.MeshStandardMaterial({ color: '#e8e0c8' })
        );
        flag.position.y = 5.3;
        const banner = new THREE.Mesh(
          new THREE.BoxGeometry(0.9, 0.55, 0.05),
          new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 0.35 })
        );
        banner.position.set(0.48, 5.55, 0);
        group.add(base, keep, roofM, flag, banner);
      } else {
        const base = new THREE.Mesh(
          new THREE.BoxGeometry(2.4, 0.9, 2.4),
          new THREE.MeshStandardMaterial({ color: stone, roughness: 0.85 })
        );
        base.position.y = 0.45;
        const tower = new THREE.Mesh(
          new THREE.CylinderGeometry(1.05, 1.25, 3.0, 10),
          new THREE.MeshStandardMaterial({ color: stone, roughness: 0.8 })
        );
        tower.position.y = 2.3;
        const roofM = new THREE.Mesh(
          new THREE.ConeGeometry(1.35, 1.35, 10),
          new THREE.MeshStandardMaterial({ color: roof, roughness: 0.7 })
        );
        roofM.position.y = 4.45;
        const crystal = new THREE.Mesh(
          new THREE.SphereGeometry(0.32, 12, 10),
          new THREE.MeshStandardMaterial({ color: glow, emissive: glow, emissiveIntensity: 0.8 })
        );
        crystal.position.y = 5.35;
        group.add(base, tower, roofM, crystal);
      }

      group.position.set(tw.x, 0, tw.y);
      const bar = healthBar(2.2);
      bar.position.y = tw.kind === 'king' ? 6.6 : 6.4;
      group.add(bar);

      this.scene.add(group);
      this.entities.set(tw.id, { group, bar, kind: 'tower', hp: tw.hp, maxHp: tw.maxHp, entity: tw });
    }
  }

  // ——— ввод ———

  // Точка экрана (clientX/Y) → точка арены {x,y} или null, если луч не бьёт в землю.
  screenToGround(clientX, clientY) {
    const el = this.renderer && this.renderer.domElement;
    if (!el || !this.camera) return null;
    const rect = el.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const px = ((clientX - rect.left) / rect.width) * 2 - 1;
    const py = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera({ x: px, y: py }, this.camera);
    const pt = new THREE.Vector3();
    const hit = this.raycaster.ray.intersectPlane(this.groundPlane, pt);
    return hit ? { x: pt.x, y: pt.z } : null;
  }

  // Показать «призрак» карты в точке экрана (для перетаскивания из руки).
  ghostTo(clientX, clientY) {
    const p = this.screenToGround(clientX, clientY);
    if (p) this._updateGhost(p.x, p.y);
    return p;
  }

  _bindInput() {
    const el = this.renderer.domElement;

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
    if (this.ghost) {
      this.scene.remove(this.ghost);
      this.ghost = null;
    }
    if (!card) return;

    const ghost = new THREE.Group();
    const model = buildModel(card.model);
    model.traverse((m) => {
      if (m.isMesh) {
        m.material = m.material.clone();
        m.material.transparent = true;
        m.material.opacity = 0.55;
        m.material.depthWrite = false;
      }
    });
    ghost.add(model);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.35, 1.55, 32),
      new THREE.MeshBasicMaterial({ color: 0x8ab8ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    ghost.add(ring);
    ghost.userData.ring = ring;
    ghost.visible = false;

    this.ghost = ghost;
    this.scene.add(ghost);
  }

  _updateGhost(x, y) {
    if (!this.ghost) return;
    this.ghost.visible = true;
    this.ghost.position.set(x, 0, y);
    const ok = this.battle.canPlaceAt(x, y, this.opts.team || 'player');
    this.ghost.userData.ring.material.color.set(ok ? 0x8ab8ff : 0xff5555);
    this.ghost.userData.ok = ok;
  }

  // ——— синхронизация ———

  update(dt, externalEvents) {
    const b = this.battle;
    const events = externalEvents || b.drainEvents();
    for (const e of events) this._handleEvent(e);

    // юниты
    for (const u of b.units) {
      if (!u.alive) continue;
      let ent = this.entities.get(u.id);
      if (!ent) ent = this._spawnEntity(u);
      ent.group.position.set(u.x, 0, u.y);
      const bob = u.flying ? Math.sin(performance.now() * 0.003 + u.id) * 0.12 : 0;
      ent.model.position.y = bob;

      // статус-подсветка
      const frozen = b.time < u.frozenUntil;
      const raged = b.time < u.rageUntil;
      ent.ring.material.color.set(frozen ? 0x9adcff : raged ? 0xc26bf2 : (u.team === 'player' ? PLAYER_RING : ENEMY_RING));
      ent.model.rotation.y = u.team === 'player' ? 0 : Math.PI;

      const ratio = Math.max(0, u.hp / u.maxHp);
      setHealthBar(ent.bar, ratio, ratio > 0.5 ? 0x35d05a : ratio > 0.25 ? 0xe0c040 : 0xe05555);
      ent.bar.visible = ratio < 1;
      ent.bar.quaternion.copy(this.camera.quaternion);

      // щит
      if (u.shieldMax > 0) {
        ent.shield.visible = u.shieldHp > 0;
        if (u.shieldHp > 0) ent.shield.position.y = 0.06 + Math.sin(performance.now() * 0.004) * 0.02;
      }

      // анимация ходьбы
      if (u.speed > 0 && b.time > u.frozenUntil) {
        ent.legs += dt * u.speed * 3.2;
        ent.model.position.y += Math.abs(Math.sin(ent.legs)) * 0.06;
      }
    }

    // башни: полоски
    for (const tw of b.towers) {
      const ent = this.entities.get(tw.id);
      if (!ent) continue;
      if (!tw.alive) {
        ent.group.rotation.z = 1.35;
        ent.group.position.y = -0.6;
        ent.bar.visible = false;
        continue;
      }
      const ratio = tw.hp / tw.maxHp;
      setHealthBar(ent.bar, ratio, ratio > 0.5 ? 0x35d05a : ratio > 0.25 ? 0xe0c040 : 0xe05555);
      ent.bar.quaternion.copy(this.camera.quaternion);
    }

    // снаряды
    for (const p of this.projectiles) {
      p.t = Math.min(1, p.t + dt * p.speed);
      const x = p.x1 + (p.x2 - p.x1) * p.t;
      const y = p.y1 + (p.y2 - p.y1) * p.t;
      const z = (p.z1 + (p.z2 - p.z1) * p.t) + Math.sin(p.t * Math.PI) * (p.arc || 1.2);
      p.mesh.position.set(x, z, y);
    }
    this.projectiles = this.projectiles.filter((p) => {
      if (p.t >= 1) {
        this.scene.remove(p.mesh);
        return false;
      }
      return true;
    });

    // эффекты
    for (const f of this.fx) {
      f.t += dt;
      const k = f.t / f.dur;
      if (f.kind === 'ring') {
        f.mesh.scale.setScalar(0.3 + k * f.scale);
        f.mesh.material.opacity = Math.max(0, 0.8 * (1 - k));
      } else if (f.kind === 'boom') {
        f.mesh.scale.setScalar(0.3 + k * f.scale);
        f.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
      } else if (f.kind === 'line') {
        f.mesh.material.opacity = Math.max(0, 0.9 * (1 - k));
      } else if (f.kind === 'heal') {
        f.mesh.position.y = 0.4 + k * 1.6;
        f.mesh.material.opacity = Math.max(0, 0.7 * (1 - k));
      }
    }
    this.fx = this.fx.filter((f) => {
      if (f.t >= f.dur) {
        this.scene.remove(f.mesh);
        return false;
      }
      return true;
    });

    // всплывающие числа
    this._updateFloating(dt);

    this.renderer.render(this.scene, this.camera);
  }

  _spawnEntity(u) {
    const group = new THREE.Group();
    const model = buildModel(u.card.model);
    const scale = u.isBuilding ? 0.92 : u.card.hp > 3000 ? 1.12 : u.card.count > 2 ? 0.72 : 0.95;
    model.scale.setScalar(scale);

    const ring = teamRing(u.team === 'player' ? PLAYER_RING : ENEMY_RING, u.isBuilding ? 1.15 : 0.62);
    const bar = healthBar(u.isBuilding ? 1.4 : 0.95);
    bar.position.y = (u.flying ? 2.6 : 2.1) * scale + 0.2;
    bar.visible = false;

    group.add(model, ring, bar);

    let shield = null;
    if (u.shieldMax > 0) {
      shield = new THREE.Mesh(
        new THREE.SphereGeometry(0.95, 14, 10),
        new THREE.MeshBasicMaterial({ color: 0x8ab8ff, transparent: true, opacity: 0.22, depthWrite: false })
      );
      shield.position.y = 1.1;
      group.add(shield);
    }

    this.scene.add(group);
    const ent = { group, model, ring, bar, shield, kind: 'unit', legs: Math.random() * 6, entity: u };
    this.entities.set(u.id, ent);
    return ent;
  }

  _handleEvent(e) {
    switch (e.type) {
      case 'attack': {
        const from = e.ranged ? { x: e.x, y: e.y, z: e.z + 1.3 } : null;
        if (from) {
          const mesh = new THREE.Mesh(
            new THREE.SphereGeometry(0.18, 8, 6),
            new THREE.MeshBasicMaterial({ color: 0xffe066 })
          );
          mesh.position.set(from.x, from.z, from.y);
          this.scene.add(mesh);
          this.projectiles.push({
            mesh,
            x1: from.x, y1: from.y, z1: from.z,
            x2: e.tx, y2: e.ty, z2: 1.2,
            t: 0, speed: 3.2, arc: 0.9
          });
        }
        break;
      }
      case 'towerShot': {
        const mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.26, 8, 6),
          new THREE.MeshBasicMaterial({ color: 0x8ab8ff })
        );
        mesh.position.set(e.x, e.z, e.y);
        this.scene.add(mesh);
        this.projectiles.push({
          mesh,
          x1: e.x, y1: e.y, z1: e.z,
          x2: e.tx, y2: e.ty, z2: 1.2,
          t: 0, speed: 4.2, arc: 0.5
        });
        break;
      }
      case 'spellFx': {
        const colors = {
          damage: 0xff8b3c, heal: 0x7dff9e, freeze: 0x9adcff,
          stun: 0xffe066, rage: 0xc26bf2, poison: 0x8fcc6a, knockback: 0x9adcff
        };
        this._addRing(e.x, e.y, e.radius, colors[e.effect] || 0xffffff);
        break;
      }
      case 'boom':
        this._addBoom(e.x, e.y, e.radius);
        break;
      case 'chainFx':
        this._addLine(e.x1, e.y1, e.x2, e.y2, 0xffe066);
        break;
      case 'healFx':
        this._addHeal(e.x, e.y);
        break;
      case 'death': {
        this._removeEntity(e.id);
        this._addBoom(e.x, e.y, 0.9, 0xd8d8d8);
        break;
      }
      case 'hit': {
        if (e.kind === 'damage' && e.amount > 1) {
          const ent = this.entities.get(e.id);
          if (ent) this._addFloating(ent.group.position.x, ent.group.position.y + 2.2, Math.round(e.amount), '#ffd0d0');
        }
        break;
      }
      case 'towerDown': {
        const ent = this.entities.get(e.id);
        if (ent) {
          this._addBoom(ent.group.position.x, ent.group.position.z, 3.2, 0xffb03c);
        }
        break;
      }
      case 'chargeFx': {
        this._addRing(e.x, e.y, 1.6, 0xffe066);
        break;
      }
      default:
        break;
    }
  }

  _removeEntity(id) {
    const ent = this.entities.get(id);
    if (!ent) return;
    this.scene.remove(ent.group);
    this.entities.delete(id);
  }

  _addRing(x, y, radius, color) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.85, 1, 40),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.12, y);
    this.scene.add(mesh);
    this.fx.push({ kind: 'ring', mesh, t: 0, dur: 0.65, scale: radius });
  }

  _addBoom(x, y, radius, color = 0xff8b3c) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(1, 14, 10),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })
    );
    mesh.position.set(x, 1.1, y);
    this.scene.add(mesh);
    this.fx.push({ kind: 'boom', mesh, t: 0, dur: 0.5, scale: radius });
  }

  _addLine(x1, y1, x2, y2, color) {
    const pts = [new THREE.Vector3(x1, 1.6, y1), new THREE.Vector3(x2, 1.6, y2)];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mesh = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    this.scene.add(mesh);
    this.fx.push({ kind: 'line', mesh, t: 0, dur: 0.3 });
  }

  _addHeal(x, y) {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x7dff9e, transparent: true, opacity: 0.7, depthWrite: false })
    );
    mesh.position.set(x, 1.2, y);
    this.scene.add(mesh);
    this.fx.push({ kind: 'heal', mesh, t: 0, dur: 0.9 });
  }

  _addFloating(x, z3d, text, color) {
    const div = document.createElement('div');
    div.className = 'float-num';
    div.textContent = text;
    div.style.color = color;
    this.fxLayer.appendChild(div);
    this.floating.push({ div, x, y: z3d, t: 0, dur: 0.9 });
  }

  _updateFloating(dt) {
    const width = this.renderer.domElement.clientWidth;
    const height = this.renderer.domElement.clientHeight;
    for (const f of this.floating) {
      f.t += dt;
      // проецируем точку мира (x, высота y, z=0) в экранные координаты
      const world = new THREE.Vector3(f.x, f.y, 0);
      world.project(this.camera);
      const sx = (world.x * 0.5 + 0.5) * width;
      const sy = (-world.y * 0.5 + 0.5) * height - f.t * 46;
      f.div.style.transform = `translate(${sx}px, ${sy}px) translate(-50%,-50%)`;
      f.div.style.opacity = String(Math.max(0, 1 - f.t / f.dur));
    }
    this.floating = this.floating.filter((f) => {
      if (f.t >= f.dur) {
        f.div.remove();
        return false;
      }
      return true;
    });
  }

  resize() {
    if (this._disposed) return;
    const w = this.container.clientWidth || 400;
    const h = this.container.clientHeight || 700;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    this._disposed = true;
    window.removeEventListener('resize', this._onResize);
    const el = this.renderer.domElement;
    for (const [type, fn, opts] of this._inputHandlers || []) {
      el.removeEventListener(type, fn, opts);
    }
    this._inputHandlers = [];
    this.renderer.dispose();
    el.remove();
    this.fxLayer.remove();
  }
}
