// Прогрессия: золото, уровни карт, сундуки, лиги, сезоны.
// Всё хранится в профиле аккаунта (см. accounts.js).

export const LEVEL_MAX = 13;

// множитель характеристик карты по уровню: 1 → ×1.0 … 13 → ×1.72
export function levelMultiplier(level) {
  return 1 + 0.06 * (Math.max(1, Math.min(LEVEL_MAX, level)) - 1);
}

// цена апгрейда уровня (1→2 … 12→13)
export function upgradeCost(level) {
  return Math.round(60 * Math.pow(1.55, Math.max(0, level - 1)));
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
  out.chests = Array.isArray(p.chests) ? p.chests.filter((c) => c && typeof c === 'object').slice(0, 4) : [];
  out.tournament = p.tournament && typeof p.tournament === 'object' ? p.tournament : null;
  out.seasonClaimed = typeof p.seasonClaimed === 'string' ? p.seasonClaimed : null;
  out.replays = Array.isArray(p.replays) ? p.replays.filter((r) => r && Array.isArray(r.snaps)).slice(0, 3) : [];
  return out;
}

export function cardLevel(progress, cardId) {
  return (progress && progress.cardLevels && progress.cardLevels[cardId]) || 1;
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

// ——— сундуки ———

const CHEST_TYPES = [
  { type: 'wood', name: 'Деревянный сундук', icon: '📦', gold: [40, 80], cards: 1 },
  { type: 'iron', name: 'Железный сундук', icon: '🧰', gold: [90, 160], cards: 2 },
  { type: 'gold', name: 'Золотой сундук', icon: '💰', gold: [180, 300], cards: 3 },
  { type: 'royal', name: 'Королевский сундук', icon: '👑', gold: [350, 600], cards: 5 }
];

export function rollChest(win) {
  const r = Math.random();
  const idx = win ? (r < 0.55 ? 0 : r < 0.85 ? 1 : r < 0.97 ? 2 : 3) : (r < 0.8 ? 0 : 1);
  return { ...CHEST_TYPES[idx], id: Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36) };
}

export function openChest(chest, cardPool) {
  const def = CHEST_TYPES.find((c) => c.type === chest.type) || CHEST_TYPES[0];
  const gold = def.gold[0] + Math.floor(Math.random() * (def.gold[1] - def.gold[0] + 1));
  const cards = [];
  for (let i = 0; i < def.cards && cardPool.length; i++) {
    cards.push(cardPool[Math.floor(Math.random() * cardPool.length)]);
  }
  return { gold, cards, name: def.name, icon: def.icon };
}
