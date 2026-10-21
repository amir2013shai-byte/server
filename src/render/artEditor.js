// Редактор рисунка карты: пользователь рисует карту сам и анимирует её.
// Инструменты: кисть, ластик, штампы, цвета, толщина; кадры (до 4) и анимация.
// Рисунок хранится как векторные штрихи — компактно для кодов обмена BA1.
import { ART_SIZE, ART_ANIMS, emptyArt, normalizeArt, drawStrokes, renderArtFrame, drawCardSprite } from './art2d.js';
import { encodeArt, decodeArt, copyText } from '../share.js';

const PALETTE = ['#ffffff', '#1a1a22', '#e05555', '#ff8b3c', '#f0d040', '#35d05a', '#49d9ff', '#4d8df0', '#c26bf2', '#8a5a2c'];
const STAMPS = { circle: '● Круг', rect: '■ Квадрат', star: '★ Звезда', heart: '♥ Сердце' };

export class ArtEditor {
  constructor(container, artJson, opts = {}) {
    this.opts = opts || {};
    this.art = normalizeArt(artJson);
    this.tool = { color: '#4d8df0', width: 8, eraser: false, stamp: null };
    this.frame = 0;
    this.liveStroke = null;
    this._raf = 0;
    this._disposed = false;
    this._buildDom(container);
    this._bindCanvas();
    this._refresh();
    this._startPreview();
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
  }

  _toast(msg) {
    if (this.opts && typeof this.opts.toast === 'function') this.opts.toast(msg);
    else console.log(msg);
  }

  getArt() {
    return normalizeArt(this.art);
  }

  setArt(a) {
    this.art = normalizeArt(a);
    this.frame = 0;
    this._refresh();
  }

  dispose() {
    this._disposed = true;
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    window.removeEventListener('resize', this._onResize);
    this._raf = 0;
  }

  // ——— операции над рисунком (используются и тестами) ———

  addStroke(stroke, frame = this.frame) {
    const fr = this.art.frames[frame] || (this.art.frames[frame] = []);
    fr.push(stroke);
    this._paint();
  }

  undo() {
    const fr = this.art.frames[this.frame];
    if (fr && fr.length) fr.pop();
    this._paint();
  }

  clearFrame() {
    this.art.frames[this.frame] = [];
    this._paint();
  }

  addFrame(copy = true) {
    if (this.art.frames.length >= 4) return false;
    const src = this.art.frames[this.frame] || [];
    this.art.frames.push(copy ? JSON.parse(JSON.stringify(src)) : []);
    this.frame = this.art.frames.length - 1;
    this._refresh();
    return true;
  }

  selectFrame(i) {
    if (i < 0 || i >= this.art.frames.length) return;
    this.frame = i;
    this._refresh();
  }

  deleteFrame(i = this.frame) {
    if (this.art.frames.length <= 1) return false;
    this.art.frames.splice(i, 1);
    this.frame = Math.max(0, Math.min(this.frame, this.art.frames.length - 1));
    this._refresh();
    return true;
  }

  setAnim(patch) {
    this.art.anim = { ...this.art.anim, ...(patch || {}) };
    this._refresh();
  }

  addStamp(shape, x = ART_SIZE / 2, y = ART_SIZE / 2, s = 30, c = this.tool.color) {
    this.addStroke({ shape, c, x, y, s });
  }

  // ——— DOM ———

  _buildDom(container) {
    this.container = container;
    container.classList.add('model-editor', 'art-editor');
    container.innerHTML = `
      <div class="me-top">
        <div class="me-toolbar">
          <button class="btn btn-ghost me-btn" data-act="undo">↩ Отменить</button>
          <button class="btn btn-ghost me-btn" data-act="clear">🧹 Очистить</button>
          <button class="btn btn-ghost me-btn" data-act="code">Код…</button>
          <span class="me-spacer"></span>
          <button class="btn btn-primary me-btn" data-act="save">Сохранить</button>
        </div>
        <div class="me-canvas-wrap">
          <canvas class="me-draw"></canvas>
          <div class="art-preview-wrap">
            <div class="muted" style="font-size:11px;text-align:center">Анимация</div>
            <canvas class="me-preview"></canvas>
          </div>
        </div>
      </div>
      <div class="me-bottom">
        <div class="me-add-row">
          <span class="me-label">Цвет:</span>
          <div class="art-palette" id="art-palette">
            ${PALETTE.map((c) => `<button class="art-swatch" data-color="${c}" style="background:${c}"></button>`).join('')}
            <input type="color" class="art-swatch art-custom" data-color="custom" value="#4d8df0">
          </div>
        </div>
        <div class="me-add-row">
          <span class="me-label">Кисть:</span>
          <input type="range" min="2" max="32" value="${this.tool.width}" id="art-width" style="flex:1;accent-color:#4d8df0">
          <button class="btn btn-chip" data-act="eraser" id="art-eraser">🧽 Ластик</button>
          ${Object.entries(STAMPS).map(([k, l]) => `<button class="btn btn-chip" data-stamp="${k}">${l}</button>`).join('')}
        </div>
        <div class="me-parts-row">
          <span class="me-label">Кадры:</span>
          <div class="me-parts" id="art-frames"></div>
          <button class="btn btn-chip" data-act="frame-add">＋ Кадр</button>
          <button class="btn btn-chip" data-act="frame-del">🗑</button>
        </div>
        <div class="me-add-row">
          <span class="me-label">Анимация:</span>
          <select class="input" id="art-anim" style="flex:1;min-width:120px">
            ${Object.entries(ART_ANIMS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
          </select>
          <span class="me-label" style="min-width:auto">Скорость</span>
          <input type="range" min="0.4" max="3" step="0.1" value="1" id="art-speed" style="flex:1;accent-color:#4d8df0">
        </div>
      </div>
    `;

    this.drawCanvas = container.querySelector('.me-draw');
    this.previewCanvas = container.querySelector('.me-preview');

    container.addEventListener('click', (ev) => {
      const sw = ev.target.closest('[data-color]');
      if (sw) {
        if (sw.dataset.color === 'custom') return; // input[type=color] обработает change
        this.tool.color = sw.dataset.color;
        this.tool.eraser = false;
        this._refreshTools();
        return;
      }
      const stamp = ev.target.closest('[data-stamp]');
      if (stamp) {
        this.tool.stamp = stamp.dataset.stamp;
        this._refreshTools();
        return;
      }
      const frameBtn = ev.target.closest('[data-frame]');
      if (frameBtn) {
        this.selectFrame(parseInt(frameBtn.dataset.frame, 10));
        return;
      }
      const act = ev.target.closest('[data-act]');
      if (!act) return;
      switch (act.dataset.act) {
        case 'undo': this.undo(); break;
        case 'clear': this.clearFrame(); break;
        case 'eraser':
          this.tool.eraser = !this.tool.eraser;
          this.tool.stamp = null;
          this._refreshTools();
          break;
        case 'frame-add': this.addFrame(true); break;
        case 'frame-del': this.deleteFrame(); break;
        case 'code': this._codeDialog(); break;
        case 'save':
          if (this.opts.onSave) this.opts.onSave(this.getArt());
          break;
        default: break;
      }
    });

    const colorInput = container.querySelector('.art-custom');
    if (colorInput) colorInput.addEventListener('input', () => {
      this.tool.color = colorInput.value;
      this.tool.eraser = false;
      this._refreshTools();
    });
    const widthInput = container.querySelector('#art-width');
    if (widthInput) widthInput.addEventListener('input', () => {
      this.tool.width = Math.max(2, Math.min(32, parseInt(widthInput.value, 10) || 8));
    });
    const animSel = container.querySelector('#art-anim');
    if (animSel) animSel.addEventListener('change', () => this.setAnim({ type: animSel.value }));
    const speedInput = container.querySelector('#art-speed');
    if (speedInput) speedInput.addEventListener('input', () => {
      this.setAnim({ speed: Math.max(0.4, Math.min(3, parseFloat(speedInput.value) || 1)) });
    });
  }

  _refreshTools() {
    const eraserBtn = this.container.querySelector('#art-eraser');
    if (eraserBtn) eraserBtn.classList.toggle('active', !!this.tool.eraser);
    this.container.querySelectorAll('[data-stamp]').forEach((b) => {
      b.classList.toggle('active', this.tool.stamp === b.dataset.stamp);
    });
    this.container.querySelectorAll('[data-color]').forEach((b) => {
      if (b.dataset.color !== 'custom') b.classList.toggle('active', !this.tool.eraser && b.dataset.color === this.tool.color);
    });
  }

  _refresh() {
    const framesEl = this.container.querySelector('#art-frames');
    if (framesEl) {
      framesEl.innerHTML = this.art.frames.map((f, i) => `
        <button class="me-part ${i === this.frame ? 'active' : ''}" data-frame="${i}">
          <span class="me-part-dot" style="background:${i === this.frame ? '#4d8df0' : '#3a4258'}"></span>
          Кадр ${i + 1} <span class="muted">(${f.length})</span>
        </button>`).join('');
    }
    const animSel = this.container.querySelector('#art-anim');
    if (animSel) animSel.value = this.art.anim.type;
    const speedInput = this.container.querySelector('#art-speed');
    if (speedInput) speedInput.value = String(this.art.anim.speed || 1);
    this._refreshTools();
    this._paint();
    this.resize();
  }

  // ——— холст ———

  _ctx() {
    try {
      return this.drawCanvas && this.drawCanvas.getContext ? this.drawCanvas.getContext('2d') : null;
    } catch {
      return null;
    }
  }

  _paint() {
    const ctx = this._ctx();
    if (!ctx) return;
    const s = this.drawCanvas.width;
    ctx.clearRect(0, 0, s, s);
    // фон-клетки
    ctx.fillStyle = '#22283c';
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo((i / 8) * s, 0); ctx.lineTo((i / 8) * s, s);
      ctx.moveTo(0, (i / 8) * s); ctx.lineTo(s, (i / 8) * s);
      ctx.stroke();
    }
    renderArtFrame(ctx, this.art.frames[this.frame] || [], s);
    if (this.liveStroke) drawStrokes(ctx, [this.liveStroke], s);
    // рамка кадра
    ctx.strokeStyle = 'rgba(77,141,240,0.5)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, s - 2, s - 2);
  }

  resize() {
    if (this._disposed) return;
    const wrap = this.container.querySelector('.me-canvas-wrap');
    if (!wrap || !this.drawCanvas) return;
    const h = wrap.clientHeight || 260;
    const w = wrap.clientWidth || 320;
    const side = Math.max(120, Math.min(h - 12, w * 0.62));
    this.drawCanvas.width = side;
    this.drawCanvas.height = side;
    this.drawCanvas.style.width = side + 'px';
    this.drawCanvas.style.height = side + 'px';
    if (this.previewCanvas) {
      this.previewCanvas.width = 110;
      this.previewCanvas.height = 110;
    }
    this._paint();
  }

  _bindCanvas() {
    const c = this.drawCanvas;
    if (!c) return;
    const toArt = (ev) => {
      const r = c.getBoundingClientRect();
      const px = ev.clientX - r.left, py = ev.clientY - r.top;
      return [
        Math.max(0, Math.min(ART_SIZE, (px / (r.width || 1)) * ART_SIZE)),
        Math.max(0, Math.min(ART_SIZE, (py / (r.height || 1)) * ART_SIZE))
      ];
    };
    const down = (ev) => {
      if (ev.cancelable) ev.preventDefault();
      const [x, y] = toArt(ev);
      if (this.tool.stamp) {
        this.addStamp(this.tool.stamp, x, y, Math.max(16, this.tool.width * 3), this.tool.color);
        this.tool.stamp = null;
        this._refreshTools();
        return;
      }
      this.liveStroke = {
        c: this.tool.color,
        w: this.tool.width,
        e: !!this.tool.eraser,
        pts: [[x, y]]
      };
      this._paint();
    };
    const move = (ev) => {
      if (!this.liveStroke) return;
      if (ev.cancelable) ev.preventDefault();
      const [x, y] = toArt(ev);
      const pts = this.liveStroke.pts;
      const last = pts[pts.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) < 1.2) return;
      pts.push([x, y]);
      this._paint();
    };
    const up = () => {
      if (!this.liveStroke) return;
      const s = this.liveStroke;
      this.liveStroke = null;
      if (s.pts.length) this.addStroke(s);
      else this._paint();
    };

    if (typeof window !== 'undefined' && window.PointerEvent) {
      c.addEventListener('pointerdown', down);
      c.addEventListener('pointermove', move);
      c.addEventListener('pointerup', up);
      c.addEventListener('pointercancel', up);
      c.addEventListener('pointerleave', up);
    } else {
      c.addEventListener('touchstart', (ev) => { const t = ev.touches[0]; if (t) down(t); }, { passive: false });
      c.addEventListener('touchmove', (ev) => { const t = ev.touches[0]; if (t) move(t); }, { passive: false });
      c.addEventListener('touchend', up);
      c.addEventListener('mousedown', down);
      c.addEventListener('mousemove', move);
      c.addEventListener('mouseup', up);
    }
  }

  _startPreview() {
    const loop = () => {
      if (this._disposed) return;
      const pc = this.previewCanvas;
      const ctx = pc && pc.getContext ? (() => { try { return pc.getContext('2d'); } catch { return null; } })() : null;
      if (ctx) {
        const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
        ctx.clearRect(0, 0, pc.width, pc.height);
        ctx.fillStyle = '#1a2030';
        ctx.fillRect(0, 0, pc.width, pc.height);
        drawCardSprite(ctx, { art: this.getArt(), id: 'preview' }, pc.width / 2, pc.height / 2, pc.width * 0.82, t);
      }
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
  }

  // экспорт/импорт рисунка по коду BA1.…
  _codeDialog() {
    const code = encodeArt(this.getArt()) || '';
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.style.zIndex = '50';
    ov.innerHTML = `
      <div class="modal" style="text-align:left">
        <h2>Код рисунка</h2>
        <p class="muted\">Скопируйте код, чтобы поделиться рисунком, или вставьте чужой код и нажмите «Импорт».</p>
        <textarea class="input" style="width:100%;height:100px;font-size:11px;word-break:break-all">${code}</textarea>
        <div class="row mt12" style="flex-wrap:wrap">
          <button class="btn btn-primary" data-a="copy">📋 Копировать</button>
          <button class="btn btn-blue" data-a="import">📥 Импорт</button>
          <button class="btn btn-ghost" data-a="close">Закрыть</button>
        </div>
      </div>`;
    ov.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-a]');
      if (!b) return;
      const ta = ov.querySelector('textarea');
      if (b.dataset.a === 'close') return ov.remove();
      if (b.dataset.a === 'copy') {
        const ok = await copyText(ta.value);
        this._toast(ok ? 'Код рисунка скопирован' : 'Скопируйте вручную');
      }
      if (b.dataset.a === 'import') {
        const a = decodeArt(ta.value);
        if (!a) {
          this._toast('Код рисунка не распознан');
          return;
        }
        this.setArt(a);
        ov.remove();
        this._toast('Рисунок импортирован');
      }
    });
    (this.container || document.body).appendChild(ov);
  }
}
