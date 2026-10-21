// 2D-графика карт: рисунок пользователя (штрихи), процедурные спрайты из моделей,
// анимация (покачивание/пульс/дрожь/вращение/смена кадров). Без WebGL и three.js.

export const ART_SIZE = 128; // логический размер холста рисунка

// Рисунок карты: { frames: [[stroke, ...], ...], anim: { type, speed, fps } }
// stroke (свободный): { c: цвет, w: толщина, e: ластик?, pts: [[x,y], ...] }
// stroke (штамп):     { shape: 'circle'|'rect'|'star'|'heart', c: цвет, x, y, s: размер }

export const ART_ANIMS = {
  none: 'Нет',
  bob: 'Покачивание',
  pulse: 'Пульс',
  shake: 'Дрожь',
  spin: 'Вращение',
  walk: 'Шаг (кадры)'
};

export function emptyArt() {
  return { frames: [[]], anim: { type: 'none', speed: 1, fps: 6 } };
}

export function normalizeArt(a) {
  const out = emptyArt();
  if (!a || typeof a !== 'object') return out;
  const frames = Array.isArray(a.frames) ? a.frames : [];
  out.frames = [];
  for (const fr of frames.slice(0, 4)) {
    if (!Array.isArray(fr)) continue;
    const strokes = [];
    for (const s of fr.slice(0, 400)) {
      if (!s || typeof s !== 'object') continue;
      if (s.shape) {
        strokes.push({
          shape: ['circle', 'rect', 'star', 'heart'].includes(s.shape) ? s.shape : 'circle',
          c: typeof s.c === 'string' ? s.c : '#ffffff',
          x: clampN(s.x, 0, ART_SIZE, ART_SIZE / 2),
          y: clampN(s.y, 0, ART_SIZE, ART_SIZE / 2),
          s: clampN(s.s, 2, ART_SIZE, 24)
        });
      } else {
        const pts = (Array.isArray(s.pts) ? s.pts : [])
          .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
          .slice(0, 400)
          .map((p) => [clampN(p[0], 0, ART_SIZE, 0), clampN(p[1], 0, ART_SIZE, 0)]);
        if (!pts.length) continue;
        strokes.push({
          c: typeof s.c === 'string' ? s.c : '#ffffff',
          w: clampN(s.w, 1, 64, 6),
          e: !!s.e,
          pts
        });
      }
    }
    out.frames.push(strokes);
  }
  if (!out.frames.length) out.frames = [[]];
  const an = (a.anim && typeof a.anim === 'object') ? a.anim : {};
  out.anim = {
    type: ART_ANIMS[an.type] ? an.type : 'none',
    speed: clampN(an.speed, 0.2, 4, 1),
    fps: clampN(an.fps, 1, 20, 6)
  };
  return out;
}

function clampN(v, a, b, d) {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.max(a, Math.min(b, n));
}

// ——— отрисовка штрихов ———

function drawStamp(ctx, s, k) {
  const x = s.x * k, y = s.y * k, r = (s.s / 2) * k;
  ctx.fillStyle = s.c;
  ctx.beginPath();
  if (s.shape === 'rect') {
    ctx.rect(x - r, y - r * 0.85, r * 2, r * 1.7);
  } else if (s.shape === 'star') {
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      const px = x + Math.cos(ang) * rr, py = y + Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
  } else if (s.shape === 'heart') {
    const w = r * 1.15;
    ctx.moveTo(x, y + w * 0.9);
    ctx.bezierCurveTo(x - w * 1.4, y + w * 0.1, x - w * 0.9, y - w * 1.0, x, y - w * 0.25);
    ctx.bezierCurveTo(x + w * 0.9, y - w * 1.0, x + w * 1.4, y + w * 0.1, x, y + w * 0.9);
  } else {
    ctx.arc(x, y, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

export function drawStrokes(ctx, strokes, size) {
  if (!ctx || !Array.isArray(strokes)) return;
  const k = size / ART_SIZE;
  for (const s of strokes) {
    if (s.shape) {
      drawStamp(ctx, s, k);
      continue;
    }
    const pts = s.pts || [];
    if (!pts.length) continue;
    ctx.save();
    ctx.globalCompositeOperation = s.e ? 'destination-out' : 'source-over';
    ctx.strokeStyle = s.e ? 'rgba(0,0,0,1)' : s.c;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = Math.max(1, (s.w || 6) * k);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0][0] * k, pts[0][1] * k, ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(pts[0][0] * k, pts[0][1] * k);
      for (let i = 1; i < pts.length - 1; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2 * k;
        const my = (pts[i][1] + pts[i + 1][1]) / 2 * k;
        ctx.quadraticCurveTo(pts[i][0] * k, pts[i][1] * k, mx, my);
      }
      const last = pts[pts.length - 1];
      ctx.lineTo(last[0] * k, last[1] * k);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// нарисовать кадр рисунка во весь ctx (size×size)
export function renderArtFrame(ctx, strokes, size) {
  if (!ctx) return;
  drawStrokes(ctx, strokes, size);
}

// ——— процедурный спрайт из 3D-модели (теперь просто 2D-пятна) ———

const spriteCache = new Map();

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < String(str).length; i++) h = (h * 31 + String(str).charCodeAt(i)) | 0;
  return `hsl(${Math.abs(h) % 360}, 45%, 55%)`;
}

// псевдо-вид сверху: детали модели (x, z) → плоскость, масштаб по y
export function spriteFromModel(model, size = 96) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const parts = (model && model.parts) || [];
  if (!parts.length) return c;
  // проекция части в плоскость спрайта: x → вправо, z → вглубь, y → вверх
  const projOf = (p) => ({
    x: (p.pos?.[0] || 0) * 0.75,
    y: (p.pos?.[2] || 0) * 0.75 - (p.pos?.[1] || 0) * 0.28,
    sx: Math.max(0.02, (p.scale?.[0] || 1) * 0.62),
    sy: Math.max(0.02, (p.scale?.[2] || p.scale?.[1] || 1) * 0.62)
  });
  const proj = parts.map(projOf);
  // авто-подгон: модель ЛЮБОГО размера занимает почти весь спрайт
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const q of proj) {
    minX = Math.min(minX, q.x - q.sx / 2); maxX = Math.max(maxX, q.x + q.sx / 2);
    minY = Math.min(minY, q.y - q.sy / 2); maxY = Math.max(maxY, q.y + q.sy / 2);
  }
  const ext = Math.max(maxX - minX, maxY - minY) || 1;
  const k = (size * 0.88) / ext;
  const cx = size / 2 - ((minX + maxX) / 2) * k;
  const cy = size / 2 - ((minY + maxY) / 2) * k;
  // тело по центру — сортируем так, чтобы крупное было снизу
  const sorted = parts.map((p, i) => ({ p, q: proj[i] }))
    .sort((a, b) => (a.p.pos?.[1] || 0) - (b.p.pos?.[1] || 0));
  for (const { p, q } of sorted) {
    const px = cx + q.x * k;
    const py = cy + q.y * k;
    const sx = Math.max(3, q.sx * k);
    const sy = Math.max(3, q.sy * k);
    const color = p.color || '#888888';
    ctx.fillStyle = color;
    ctx.globalAlpha = p.opacity !== undefined ? Math.max(0.15, p.opacity) : 1;
    ctx.beginPath();
    const shape = p.shape || 'box';
    if (shape === 'sphere' || shape === 'halfsphere' || shape === 'torus' || shape === 'ring') {
      ctx.ellipse(px, py, sx / 2, sy / 2, 0, 0, Math.PI * 2);
    } else if (shape === 'cone') {
      ctx.moveTo(px, py - sy / 2);
      ctx.lineTo(px + sx / 2, py + sy / 2);
      ctx.lineTo(px - sx / 2, py + sy / 2);
      ctx.closePath();
    } else {
      const r = Math.min(sx, sy) * 0.28;
      roundRectPath(ctx, px - sx / 2, py - sy / 2, sx, sy, r);
    }
    ctx.fill();
    if (p.emissive && p.emissive !== '#000000') {
      ctx.fillStyle = p.emissive;
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.ellipse(px, py, sx * 0.28, sy * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
  return c;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// базовый спрайт карты (без анимации-трансформа): art → нарисованный кадр; иначе модель; иначе буква
export function baseSprite(card, size = 96) {
  const key = `${card && card.id}|${size}|${artVersion(card)}`;
  if (spriteCache.has(key)) return spriteCache.get(key);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  if (ctx) {
    const art = card && card.art;
    if (art && art.frames && art.frames[0] && art.frames[0].length) {
      drawStrokes(ctx, art.frames[0], size);
    } else if (card && card.model && Array.isArray(card.model.parts) && card.model.parts.length) {
      const m = spriteFromModel(card.model, size);
      ctx.drawImage(m, 0, 0);
    } else {
      ctx.fillStyle = hashColor(card && card.id);
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.round(size * 0.42)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(((card && card.name) || '?').charAt(0).toUpperCase(), size / 2, size / 2);
    }
  }
  spriteCache.set(key, c);
  return c;
}

// версия арта для сброса кэша, когда пользователь перерисовал карту
function artVersion(card) {
  const a = card && card.art;
  if (!a) return 'm';
  return `${a.frames ? a.frames.length : 0}:${a._v || ''}`;
}

export function clearSpriteCache() {
  spriteCache.clear();
}

// кадр анимации-смены рисунка (walk): индекс кадра по времени
export function artFrameIndex(art, t) {
  if (!art || !art.frames || art.frames.length < 2) return 0;
  const fps = (art.anim && art.anim.fps) || 6;
  return Math.floor(t * fps) % art.frames.length;
}

// прорисовка спрайта карты с анимацией в точке (x,y) — центр, size — диаметр
export function drawCardSprite(ctx, card, x, y, size, t, opts = {}) {
  if (!ctx) return;
  const art = card && card.art;
  const anim = (art && art.anim) || null;
  const type = anim ? anim.type : 'none';
  const speed = anim ? (anim.speed || 1) : 1;
  let dx = 0, dy = 0, rot = 0, scale = 1;
  const w = t * speed;

  if (type === 'bob') dy = Math.sin(w * 2.6) * size * 0.07;
  else if (type === 'pulse') scale = 1 + Math.sin(w * 3.2) * 0.07;
  else if (type === 'shake') rot = Math.sin(w * 9) * 0.12;
  else if (type === 'spin') rot = w * 1.6;
  if (opts.moving) dy += Math.abs(Math.sin(t * 7 * speed)) * size * 0.06;
  if (opts.flying) dy -= size * 0.12;

  ctx.save();
  ctx.translate(x + dx, y + dy);
  if (rot) ctx.rotate(rot);
  if (scale !== 1) ctx.scale(scale, scale);

  if (art && art.frames && art.frames.length) {
    const idx = type === 'walk' ? artFrameIndex(art, t) : 0;
    const strokes = art.frames[idx] || art.frames[0];
    if (art.frames.length > 1 && type !== 'walk') {
      // даже без режима walk показываем смену кадров — это анимация рисунка
      const idx2 = artFrameIndex(art, t);
      drawStrokes(ctx, art.frames[idx2] || strokes, size);
    } else {
      drawStrokes(ctx, strokes, size);
    }
  } else {
    const spr = baseSprite(card, 96);
    ctx.drawImage(spr, -size / 2, -size / 2, size, size);
  }
  ctx.restore();
}
