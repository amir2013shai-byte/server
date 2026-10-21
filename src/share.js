// Обмен картами по коду: карта → компактный код «BC1.…» и обратно.
// Код можно переслать другу (вставить в импорт) или открыть по ссылке #card=…

const PREFIX = 'BC1.';

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
    m: card.model
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
