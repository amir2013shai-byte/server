// Обмен картами по коду: карта → компактный код «BC1.…» и обратно.
// Код можно переслать другу (вставить в импорт) или открыть по ссылке #card=…
// Рисунки карт обмениваются кодом «BA1.…» (векторные штрихи + анимация).

const PREFIX = 'BC1.';
const ART_PREFIX = 'BA1.';

// рисунок карты → код (для обмена из редактора рисунка)
export function encodeArt(art) {
  try {
    const json = JSON.stringify({
      frames: (art && art.frames) || [[]],
      anim: (art && art.anim) || { type: 'none', speed: 1, fps: 6 }
    });
    return ART_PREFIX + bytesToB64url(new TextEncoder().encode(json));
  } catch {
    return null;
  }
}

export function decodeArt(code) {
  try {
    const s = String(code || '').trim();
    if (!s.startsWith(ART_PREFIX)) return null;
    const json = new TextDecoder().decode(b64urlToBytes(s.slice(ART_PREFIX.length)));
    return sanitizeArt(JSON.parse(json));
  } catch {
    return null;
  }
}

// базовая санитизация рисунка (рамки, штрихи, координаты)
export function sanitizeArt(a) {
  const empty = { frames: [[]], anim: { type: 'none', speed: 1, fps: 6 } };
  if (!a || typeof a !== 'object') return empty;
  const frames = [];
  for (const fr of (Array.isArray(a.frames) ? a.frames : []).slice(0, 4)) {
    if (!Array.isArray(fr)) continue;
    const strokes = [];
    for (const s of fr.slice(0, 400)) {
      if (!s || typeof s !== 'object') continue;
      if (s.shape) {
        strokes.push({
          shape: ['circle', 'rect', 'star', 'heart'].includes(s.shape) ? s.shape : 'circle',
          c: typeof s.c === 'string' ? s.c.slice(0, 24) : '#ffffff',
          x: numClamp(s.x, 0, 128, 64),
          y: numClamp(s.y, 0, 128, 64),
          s: numClamp(s.s, 2, 128, 24)
        });
      } else {
        const pts = (Array.isArray(s.pts) ? s.pts : [])
          .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
          .slice(0, 400)
          .map((p) => [numClamp(p[0], 0, 128, 0), numClamp(p[1], 0, 128, 0)]);
        if (!pts.length) continue;
        strokes.push({
          c: typeof s.c === 'string' ? s.c.slice(0, 24) : '#ffffff',
          w: numClamp(s.w, 1, 64, 6),
          e: !!s.e,
          pts
        });
      }
    }
    frames.push(strokes);
  }
  if (!frames.length) frames.push([]);
  const an = (a.anim && typeof a.anim === 'object') ? a.anim : {};
  return {
    frames,
    anim: {
      type: ['none', 'bob', 'pulse', 'shake', 'spin', 'walk'].includes(an.type) ? an.type : 'none',
      speed: numClamp(an.speed, 0.2, 4, 1),
      fps: numClamp(an.fps, 1, 20, 6)
    }
  };
}

function numClamp(v, a, b, d) {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return Math.max(a, Math.min(b, n));
}

function bytesToB64url(bytes) {
  let bin = '';
  const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CH));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// карта → код
export function encodeCard(card) {
  const payload = {
    n: card.name, d: card.desc || '', r: card.rarity, t: card.type,
    c: card.cost, k: card.count || 1,
    hp: card.hp, dm: card.damage, hs: card.hitSpeed, rg: card.range,
    sp: card.speed, sl: card.splash || 0,
    tg: card.targets, fl: card.flying ? 1 : 0, bo: card.buildingOnly ? 1 : 0,
    ab: card.abilities || [],
    sc: card.spell || null, bd: card.building || null,
    m: card.model || null,
    a: card.art || null
  };
  const json = JSON.stringify(payload);
  return PREFIX + bytesToB64url(new TextEncoder().encode(json));
}

// код → черновик карты (id всегда новый, custom: true)
export function decodeCard(code) {
  try {
    const s = String(code || '').trim();
    if (!s.startsWith(PREFIX)) return null;
    const json = new TextDecoder().decode(b64urlToBytes(s.slice(PREFIX.length)));
    const p = JSON.parse(json);
    if (!p || typeof p !== 'object' || !p.n || !p.t) return null;
    const card = {
      id: 'shared_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 1e4).toString(36),
      name: String(p.n).slice(0, 40),
      desc: typeof p.d === 'string' ? p.d.slice(0, 300) : '',
      rarity: ['common', 'rare', 'epic', 'legendary'].includes(p.r) ? p.r : 'common',
      type: ['troop', 'spell', 'building'].includes(p.t) ? p.t : 'troop',
      cost: Math.min(10, Math.max(0, Number(p.c) || 3)),
      count: Math.min(12, Math.max(1, Number(p.k) || 1)),
      hp: Math.min(99999, Math.max(1, Number(p.hp) || 500)),
      damage: Math.min(99999, Math.max(0, Number(p.dm) || 100)),
      hitSpeed: Math.min(20, Math.max(0.2, Number(p.hs) || 1)),
      range: Math.min(20, Math.max(0, Number(p.rg) || 1)),
      speed: Math.min(5, Math.max(0, Number(p.sp) || 1)),
      splash: Math.min(8, Math.max(0, Number(p.sl) || 0)),
      sight: 5.5,
      targets: p.tg === 'both' ? 'both' : 'ground',
      flying: !!p.fl,
      buildingOnly: !!p.bo,
      hidden: false,
      custom: true,
      abilities: Array.isArray(p.ab) ? p.ab.filter((a) => a && typeof a === 'object' && a.type).slice(0, 12) : [],
      spell: p.sc && typeof p.sc === 'object' ? p.sc : null,
      building: p.bd && typeof p.bd === 'object' ? p.bd : null,
      art: p.a ? sanitizeArt(p.a) : null,
      model: p.m && Array.isArray(p.m.parts) && p.m.parts.length
        ? { parts: p.m.parts.slice(0, 80) }
        : { parts: [{ shape: 'box', pos: [0, 0.85, 0], rot: [0, 0, 0], scale: [0.62, 0.62, 0.36], color: '#3b6fd4', emissive: '#000000' }] }
    };
    return card;
  } catch {
    return null;
  }
}

// копирование в буфер обмена (с фолбэком для старых WebView)
export async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* пробуем запасной путь */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
