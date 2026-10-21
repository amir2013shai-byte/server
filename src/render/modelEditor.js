// Встроенный 3D-редактор моделей: примитивы, трансформ, цвета, шаблоны, орбитальная камера.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildModel } from './modelBuilder.js';
import { SHAPES, P, humanoid, smallHumanoid, skeleton, dragon, spirit, golem, winged, building, turret, beast } from '../data/models.js';

const SHAPE_LABELS = {
  box: 'Куб', sphere: 'Сфера', cylinder: 'Цилиндр',
  cone: 'Конус', torus: 'Тор', capsule: 'Капсула'
};

const TEMPLATES = {
  humanoid: { label: 'Гуманоид', make: () => humanoid() },
  small: { label: 'Малый', make: () => smallHumanoid() },
  skeleton: { label: 'Скелет', make: () => skeleton() },
  dragon: { label: 'Дракон', make: () => dragon() },
  spirit: { label: 'Дух', make: () => spirit() },
  golem: { label: 'Голем', make: () => golem() },
  winged: { label: 'Крылатый', make: () => winged() },
  beast: { label: 'Зверь', make: () => beast() },
  building: { label: 'Здание', make: () => building() },
  turret: { label: 'Турель', make: () => turret() }
};

export class ModelEditor {
  constructor(container, modelJson, opts = {}) {
    this.opts = opts;
    this.selected = 0;
    this.model = this._clone(modelJson && modelJson.parts ? modelJson : { parts: [] });
    if (!this.model.parts.length) {
      this.model = humanoid();
    }
    this._buildDom(container);
    this._buildScene();
    this.refreshParts();
    this.selectPart(0);
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  _clone(m) {
    return JSON.parse(JSON.stringify(m));
  }

  getModel() {
    return this._clone(this.model);
  }

  setModel(m) {
    this.model = this._clone(m);
    this.refreshParts();
    this.selectPart(0);
  }

  // ——— DOM ———

  _buildDom(container) {
    container.classList.add('model-editor');
    container.innerHTML = `
      <div class="me-top">
        <div class="me-toolbar">
          <button class="btn btn-ghost me-btn" data-act="reset-cam">Вид</button>
          <button class="btn btn-ghost me-btn" data-act="template">Шаблон…</button>
          <button class="btn btn-ghost me-btn" data-act="clear">Очистить</button>
          <span class="me-spacer"></span>
          <button class="btn btn-primary me-btn" data-act="save">Сохранить</button>
        </div>
        <div class="me-canvas-wrap"><div class="me-canvas"></div></div>
      </div>
      <div class="me-bottom">
        <div class="me-add-row">
          <span class="me-label">Добавить:</span>
          ${SHAPES.map((s) => `<button class="btn btn-chip" data-add="${s}">${SHAPE_LABELS[s]}</button>`).join('')}
        </div>
        <div class="me-parts-row">
          <span class="me-label">Части:</span>
          <div class="me-parts" id="me-parts"></div>
        </div>
        <div class="me-props" id="me-props"></div>
      </div>
    `;

    this.canvasWrap = container.querySelector('.me-canvas-wrap');
    this.partsEl = container.querySelector('#me-parts');
    this.propsEl = container.querySelector('#me-props');

    container.addEventListener('click', (ev) => {
      const add = ev.target.closest('[data-add]');
      if (add) return this.addPart(add.dataset.add);
      const act = ev.target.closest('[data-act]');
      if (!act) return;
      switch (act.dataset.act) {
        case 'reset-cam': this.resetCamera(); break;
        case 'template': this._pickTemplate(); break;
        case 'clear':
          if ((window.confirm || confirm)('Удалить все части модели?')) {
            this.model.parts = [];
            this.refreshParts();
            this.propsEl.innerHTML = '<div class="me-empty">Добавьте части модели</div>';
          }
          break;
        case 'save':
          if (this.opts.onSave) this.opts.onSave(this.getModel());
          break;
        default: break;
      }
    });
  }

  _pickTemplate() {
    const names = Object.keys(TEMPLATES);
    const list = names.map((k, i) => `${i + 1}. ${TEMPLATES[k].label}`).join('\n');
    let ans = null;
    try {
      ans = (window.prompt || prompt)(`Шаблон модели:\n${list}\n\nВведите номер:`, '1');
    } catch { return; }
    const idx = parseInt(ans, 10) - 1;
    if (idx >= 0 && idx < names.length) {
      this.model = TEMPLATES[names[idx]].make();
      this.refreshParts();
      this.selectPart(0);
    }
  }

  // ——— сцена ———

  _buildScene() {
    const wrap = this.canvasWrap;
    const w = wrap.clientWidth || 360;
    const h = wrap.clientHeight || 300;

    try {
      this.renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch (e) {
      console.error('3D-превью недоступно:', e);
      wrap.innerHTML = '<div style="height:100%;display:flex;align-items:center;justify-content:center;color:#8e97b4;padding:16px;text-align:center">3D-превью недоступно на этом устройстве.<br>Редактирование частей и параметров работает.</div>';
      this.renderer = null;
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h);
    this.renderer.setClearColor(0x22283c);
    wrap.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    this.camera.position.set(3.2, 2.6, 4.2);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.maxPolarAngle = Math.PI * 0.62;
    this.controls.minDistance = 2;
    this.controls.maxDistance = 16;

    this.scene.add(new THREE.AmbientLight(0xb8c8ff, 0.9));
    const dir = new THREE.DirectionalLight(0xfff2dd, 1.2);
    dir.position.set(4, 8, 5);
    this.scene.add(dir);
    const back = new THREE.DirectionalLight(0x6688cc, 0.45);
    back.position.set(-5, 4, -4);
    this.scene.add(back);

    const grid = new THREE.GridHelper(10, 20, 0x44507a, 0x333c5c);
    this.scene.add(grid);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(1.15, 32),
      new THREE.MeshBasicMaterial({ color: 0x2c3a5c, transparent: true, opacity: 0.55 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.01;
    this.scene.add(ground);

    this.modelGroup = new THREE.Group();
    this.scene.add(this.modelGroup);
    this._rebuildModel();

    this._animating = true;
    const loop = () => {
      if (!this._animating || !this.renderer) return;
      requestAnimationFrame(loop);
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  resetCamera() {
    if (!this.camera) return;
    this.camera.position.set(3.2, 2.6, 4.2);
    this.controls.target.set(0, 1, 0);
    this.controls.update();
  }

  _rebuildModel() {
    if (!this.modelGroup) return;
    this.modelGroup.clear();
    this.modelGroup.add(buildModel(this.model));

    // подсветка выбранной части
    if (this.selected >= 0 && this.selected < this.model.parts.length) {
      const p = this.model.parts[this.selected];
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: 0x49d9ff, wireframe: true, transparent: true, opacity: 0.85 })
      );
      box.position.set(p.pos[0], p.pos[1], p.pos[2]);
      box.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
      box.scale.set(p.scale[0] * 1.12, p.scale[1] * 1.12, p.scale[2] * 1.12);
      this.modelGroup.add(box);
    }
  }

  // ——— части ———

  refreshParts() {
    this.partsEl.innerHTML = this.model.parts.map((p, i) => `
      <button class="me-part ${i === this.selected ? 'active' : ''}" data-part="${i}">
        <span class="me-part-dot" style="background:${p.color}"></span>
        ${i + 1}. ${SHAPE_LABELS[p.shape] || p.shape}
      </button>
    `).join('') || '<div class="me-empty">Пусто</div>';

    this.partsEl.querySelectorAll('[data-part]').forEach((el) => {
      el.addEventListener('click', () => this.selectPart(parseInt(el.dataset.part, 10)));
    });
    this._rebuildModel();
  }

  selectPart(i) {
    this.selected = i;
    this.partsEl.querySelectorAll('.me-part').forEach((el, idx) => {
      el.classList.toggle('active', idx === i);
    });
    this.renderProps();
    this._rebuildModel();
  }

  addPart(shape) {
    this.model.parts.push(P(shape, [0, 0.8, 0], [0.8, 0.8, 0.8], '#8ab8ff'));
    this.refreshParts();
    this.selectPart(this.model.parts.length - 1);
  }

  renderProps() {
    const i = this.selected;
    const p = this.model.parts[i];
    if (!p) {
      this.propsEl.innerHTML = '<div class="me-empty">Часть не выбрана</div>';
      return;
    }
    const deg = (r) => Math.round((r * 180) / Math.PI);
    const rad = (d) => (d * Math.PI) / 180;

    this.propsEl.innerHTML = `
      <div class="me-prop-head">
        <b>Часть ${i + 1}</b>
        <select class="input me-shape" data-f="shape">
          ${SHAPES.map((s) => `<option value="${s}" ${s === p.shape ? 'selected' : ''}>${SHAPE_LABELS[s]}</option>`).join('')}
        </select>
        <label class="me-color">Цвет <input type="color" data-f="color" value="${toHex(p.color)}"></label>
        <label class="me-color">Свечение <input type="color" data-f="emissive" value="${toHex(p.emissive || '#000000')}"></label>
        <button class="btn btn-chip" data-p="dup">Дублировать</button>
        <button class="btn btn-chip danger" data-p="del">Удалить</button>
      </div>
      ${axisRow('Позиция', 'pos', p.pos, -3, 3, 0.05)}
      ${axisRow('Поворот°', 'rot', [deg(p.rot[0]), deg(p.rot[1]), deg(p.rot[2])], -180, 180, 5, true)}
      ${axisRow('Размер', 'scale', p.scale, 0.05, 3, 0.05)}
    `;

    const commit = () => {
      this._rebuildModel();
    };

    this.propsEl.querySelectorAll('input[type=range]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const f = inp.dataset.f;
        const axis = parseInt(inp.dataset.axis, 10);
        const val = parseFloat(inp.value);
        if (f === 'rot') p.rot[axis] = rad(val);
        else p[f][axis] = val;
        const num = this.propsEl.querySelector(`input[data-num="${f}"][data-axis="${axis}"]`);
        if (num) num.value = val;
        commit();
      });
    });
    this.propsEl.querySelectorAll('input[data-num]').forEach((inp) => {
      inp.addEventListener('change', () => {
        const f = inp.dataset.num;
        const axis = parseInt(inp.dataset.axis, 10);
        const val = parseFloat(inp.value) || 0;
        if (f === 'rot') p.rot[axis] = rad(val);
        else p[f][axis] = val;
        this.renderProps();
        commit();
      });
    });
    this.propsEl.querySelectorAll('input[type=color]').forEach((inp) => {
      inp.addEventListener('input', () => {
        p[inp.dataset.f] = inp.value;
        this.refreshParts();
      });
    });
    const shapeSel = this.propsEl.querySelector('.me-shape');
    if (shapeSel) {
      shapeSel.addEventListener('change', () => {
        p.shape = shapeSel.value;
        this.refreshParts();
      });
    }
    this.propsEl.querySelectorAll('[data-p]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.p === 'del') {
          this.model.parts.splice(i, 1);
          this.selected = Math.max(0, i - 1);
          this.refreshParts();
          this.renderProps();
        } else if (btn.dataset.p === 'dup') {
          this.model.parts.splice(i + 1, 0, this._clone(p));
          this.selected = i + 1;
          this.refreshParts();
          this.renderProps();
        }
      });
    });
  }

  resize() {
    if (!this.renderer) return;
    const w = this.canvasWrap.clientWidth || 360;
    const h = this.canvasWrap.clientHeight || 300;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  dispose() {
    this._animating = false;
    window.removeEventListener('resize', this._onResize);
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    this.controls && this.controls.dispose();
  }
}

function axisRow(label, field, values, min, max, step, isRot = false) {
  const names = ['X', 'Y', 'Z'];
  return `
    <div class="me-axis-row">
      <div class="me-label">${label}</div>
      ${values.map((v, axis) => `
        <div class="me-axis">
          <span>${names[axis]}</span>
          <input type="range" data-f="${field}" data-axis="${axis}" min="${min}" max="${max}" step="${step}" value="${v}">
          <input type="number" class="input me-num" data-num="${field}" data-axis="${axis}" value="${round(v)}" step="${step}">
        </div>
      `).join('')}
    </div>
  `;
}

function round(v) {
  return Math.round(v * 100) / 100;
}

function toHex(c) {
  if (!c) return '#000000';
  if (c.startsWith('#')) {
    if (c.length === 4) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    return c;
  }
  try {
    return `#${new THREE.Color(c).getHexString()}`;
  } catch {
    return '#000000';
  }
}
