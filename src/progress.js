// Прогрессия: золото, уровни карт, копии карт, сундуки, лиги, сезоны.
// Всё хранится в профиле аккаунта (см. accounts.js).
// Апгрейд карты требует И золото, И копии именно этой карты.

export const LEVEL_MAX = 13;

// множитель характеристик карты по уровню: 1 → ×1.0 … 13 → ×1.72
export function levelMultiplier(level) {
  return 1 + 0.06 * (Math.max(1, Math.min(LEVEL_MAX, level)) - 1);
}

// цена апгрейда уровня золотом (1→2 … 12→13)
export function upgradeCost(level) {
  return Math.round(60 * Math.pow(1.55, Math.max(0, level - 1)));
}

// сколько копий КОНКРЕТНОЙ карты нужно для апгрейда (1→2 … 12→13)
const COPIES_TABLE = [2, 4, 10, 20, 50, 100, 200, 400, 800, 1000, 1500, 2000];
export function copiesNeeded(level) {
  return COPIES_TABLE[Math.min(COPIES_TABLE.length - 1, Math.max(0, level - 1))];
}

export const LEAGUES = [
  { name: 'Бронза', icon: '🥉', min: 0, color: '#c87f4a' },
  { name: 'Серебро', icon: '🥈', min: 400, color: '#b8c0cc' },
  { name: 'Золото', icon: '🥇', min: 900, color: '#f0b13c' },
  { name: 'Кристалл', icon: '💎', min: 1400, color: '#49d9ff' },
  { name: 'Мастер', icon: '🛡', min: 2000, color: '#c26bf2' },
  { name: 'Легенда', icon: '👑', min: 2800, color: '#ff7d7d' }
];

export function leagueFor(trophies) {
  let out = LEAGUES[0];
  for (const L of LEAGUES) if (trophies >= L.min) out = L;
  return out;
}

export function nextLeague(trophies) {
  return LEAGUES.find((L) => trophies < L.min) || null;
}

// сезон = календарный месяц
export function currentSeasonId() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function seasonDaysLeft() {
  const d = new Date();
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return Math.max(0, Math.ceil((end - d) / 86400000));
}

// награда за сезон по лиге
export function seasonReward(trophies) {
  const league = leagueFor(trophies);
  const idx = LEAGUES.indexOf(league);
  return { gold: (idx + 1) * 250, league: league.name };
}

export function emptyProgress() {
  return {
    gold: 150,
    cardLevels: {},   // cardId -> уровень
    cardCopies: {},   // cardId -> сколько копий карты есть (для апгрейда)
    chests: [],       // очередь сундуков (макс. 4)
    tournament: null, // текущий турнир
    seasonClaimed: null,
    replays: []       // последние реплеи боёв (макс. 3)
  };
}

export function normalizeProgress(p) {
  const out = emptyProgress();
  if (!p || typeof p !== 'object') return out;
  out.gold = Math.max(0, Math.floor(Number(p.gold) || 0));
  out.cardLevels = {};
  if (p.cardLevels && typeof p.cardLevels === 'object') {
    for (const [id, lvl] of Object.entries(p.cardLevels)) {
      const n = Math.floor(Number(lvl));
      if (n >= 1 && n <= LEVEL_MAX) out.cardLevels[id] = n;
    }
  }
  out.cardCopies = {};
  if (p.cardCopies && typeof p.cardCopies === 'object') {
    for (const [id, n] of Object.entries(p.cardCopies)) {
      const v = Math.floor(Number(n));
      if (v > 0) out.cardCopies[id] = Math.min(999999, v);
    }
  }
  out.chests = Array.isArray(p.chests) ? p.chests.filter((c) => c && typeof c === 'object').slice(0, 4) : [];
  out.tournament = p.tournament && typeof p.tournament === 'object' ? p.tournament : null;
  out.seasonClaimed = typeof p.seasonClaimed === 'string' ? p.seasonClaimed : null;
  out.replays = Array.isArray(p.replays) ? p.replays.filter((r) => r && Array.isArray(r.snaps)).slice(0, 3) : [];
  return out;
}

export function cardLevel(progress, cardId) {
  return (progress && progress.cardLevels && progress.cardLevels[cardId]) || 1;
}

// сколько копий карты накоплено
export function cardCopiesOf(progress, cardId) {
  return (progress && progress.cardCopies && progress.cardCopies[cardId]) || 0;
}

// начислить копии карты (из сундуков и т.п.)
export function addCardCopies(progress, cardId, n) {
  if (!progress || !cardId) return 0;
  progress.cardCopies = progress.cardCopies || {};
  const add = Math.max(0, Math.floor(Number(n) || 0));
  progress.cardCopies[cardId] = Math.min(999999, cardCopiesOf(progress, cardId) + add);
  return progress.cardCopies[cardId];
}

// характеристики карты с учётом уровня (клон — движок не трогаем)
export function scaleCard(card, level) {
  const m = levelMultiplier(level);
  return {
    ...card,
    hp: Math.round((card.hp || 0) * m),
    damage: Math.round((card.damage || 0) * m),
    level
  };
}

// ——— апгрейд карты: золото + копии этой карты ———

export function canUpgrade(progress, cardId) {
  const level = cardLevel(progress, cardId);
  const needGold = upgradeCost(level);
  const needCopies = copiesNeeded(level);
  const haveGold = (progress && progress.gold) || 0;
  const haveCopies = cardCopiesOf(progress, cardId);
  return {
    ok: level < LEVEL_MAX && haveGold >= needGold && haveCopies >= needCopies,
    max: level >= LEVEL_MAX,
    level,
    needGold,
    needCopies,
    haveGold,
    haveCopies
  };
}

export function applyUpgrade(progress, cardId) {
  const chk = canUpgrade(progress, cardId);
  if (chk.max) return { ok: false, error: 'Максимальный уровень' };
  if (chk.haveCopies < chk.needCopies) return { ok: false, error: `Нужно копий карты: ${chk.needCopies} (есть ${chk.haveCopies})` };
  if (chk.haveGold < chk.needGold) return { ok: false, error: `Не хватает золота: нужно ${chk.needGold}` };
  progress.gold -= chk.needGold;
  progress.cardCopies = progress.cardCopies || {};
  progress.cardCopies[cardId] = chk.haveCopies - chk.needCopies;
  progress.cardLevels[cardId] = chk.level + 1;
  return { ok: true, level: chk.level + 1 };
}

// ——— сундуки ———

const CHEST_TYPES = [
  { type: 'wood', name: 'Деревянный сундук', icon: '📦', gold: [40, 80], cards: 1, copies: [3, 6] },
  { type: 'iron', name: 'Железный сундук', icon: '🧰', gold: [90, 160], cards: 2, copies: [7, 12] },
  { type: 'gold', name: 'Золотой сундук', icon: '💰', gold: [180, 300], cards: 3, copies: [14, 24] },
  { type: 'royal', name: 'Королевский сундук', icon: '👑', gold: [350, 600], cards: 5, copies: [30, 55] }
];

export function rollChest(win) {
  const r = Math.random();
  const idx = win ? (r < 0.55 ? 0 : r < 0.85 ? 1 : r < 0.97 ? 2 : 3) : (r < 0.8 ? 0 : 1);
  return { ...CHEST_TYPES[idx], id: Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36) };
}

const RARITY_WEIGHT = { common: 55, rare: 27, epic: 13, legendary: 5 };

// пулы: массив id или {id, rarity}
function pickWeighted(pool) {
  const entries = pool.map((e) => (typeof e === 'string' ? { id: e, rarity: 'common' } : { id: e.id, rarity: e.rarity || 'common' }));
  if (!entries.length) return null;
  const total = entries.reduce((s, e) => s + (RARITY_WEIGHT[e.rarity] || 55), 0);
  let r = Math.random() * total;
  for (const e of entries) {
    r -= RARITY_WEIGHT[e.rarity] || 55;
    if (r <= 0) return e;
  }
  return entries[entries.length - 1];
}

// Открытие сундука: золото + стопки копий карт.
// items — упорядоченный список для красивого поэтапного показа лута.
export function openChest(chest, cardPool) {
  const def = CHEST_TYPES.find((c) => c.type === chest.type) || CHEST_TYPES[0];
  const gold = def.gold[0] + Math.floor(Math.random() * (def.gold[1] - def.gold[0] + 1));
  const pool = (cardPool || []).slice();
  const items = [{ kind: 'gold', amount: gold, label: 'Золото' }];
  const cards = []; // плоский список id (совместимость)

  let totalCopies = def.copies[0] + Math.floor(Math.random() * (def.copies[1] - def.copies[0] + 1));
  const stacks = Math.max(1, Math.min(def.cards, pool.length || 1));
  const used = new Set();
  for (let i = 0; i < stacks && pool.length; i++) {
    let pick = pickWeighted(pool);
    // стараемся не дублировать стопки внутри одного сундука
    for (let tries = 0; tries < 6 && pick && used.has(pick.id) && used.size < pool.length; tries++) pick = pickWeighted(pool);
    if (!pick) break;
    used.add(pick.id);
    const left = stacks - i;
    const count = left === 1 ? totalCopies : Math.max(1, Math.round(totalCopies / left * (0.7 + Math.random() * 0.6)));
    totalCopies -= count;
    items.push({ kind: 'cards', cardId: pick.id, count, rarity: pick.rarity || 'common', label: 'Карты' });
    for (let k = 0; k < Math.max(1, count); k++) cards.push(pick.id);
    if (totalCopies <= 0) break;
  }
  return { gold, items, cards, name: def.name, icon: def.icon };
}
