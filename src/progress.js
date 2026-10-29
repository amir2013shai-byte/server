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
    unlockedCards: [],// id карт, открытых для использования (сначала стартовый набор)
    chests: [],       // очередь сундуков (макс. 4)
    tournament: null, // текущий турнир
    cup: null,        // турнирная лига (сетка 3 раунда)
    seasonClaimed: null,
    replays: [],      // последние реплеи боёв (макс. 3)
    // ——— крупное обновление ———
    wins: 0,          // всего побед
    level: 1,         // уровень игрока
    xp: 0,            // опыт игрока
    evo: {},          // cardId -> звёзды эволюции (0..3)
    campaignDone: {}, // missionId -> звёзды (1..3)
    bossKills: 0,
    cupWins: 0,       // победы в турнирной лиге
    coopWins: 0,      // победы в режиме 2×2
    clanWarWins: 0,
    clanWar: { points: 0, fights: 0 },
    forges: 0,        // эволюций в кузнице
    mythics: 0,       // мифических карт (3 звезды)
    pass: { season: null, xp: 0, premium: false, claimed: [], claimedPremium: [] },
    ach: {},          // id достижения -> true (получено)
    heroes: [],       // разблокированные герои (id)
    heroFragments: {} // id героя -> сколько фрагментов собрано
  };
}

// уровень игрока: старт опыта уровня
export const PLAYER_LEVEL_MAX = 50;
export function xpForLevel(level) {
  return 100 + (Math.max(1, level) - 1) * 75;
}
export function levelFromXp(xp) {
  let lvl = 1, rest = Math.max(0, Math.floor(xp || 0));
  while (lvl < PLAYER_LEVEL_MAX && rest >= xpForLevel(lvl)) {
    rest -= xpForLevel(lvl);
    lvl++;
  }
  return { level: lvl, into: rest, need: xpForLevel(lvl) };
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
  out.unlockedCards = Array.isArray(p.unlockedCards) ? p.unlockedCards.filter((id) => typeof id === 'string') : [];
  out.heroes = Array.isArray(p.heroes) ? p.heroes.filter((id) => typeof id === 'string') : [];
  out.heroFragments = (p.heroFragments && typeof p.heroFragments === 'object') ? p.heroFragments : {};
  out.chests = Array.isArray(p.chests) ? p.chests.filter((c) => c && typeof c === 'object').slice(0, 4) : [];
  out.tournament = p.tournament && typeof p.tournament === 'object' ? p.tournament : null;
  out.cup = (p.cup && typeof p.cup === 'object')
    ? { round: Math.max(0, Math.min(3, Math.floor(Number(p.cup.round) || 0))), wins: Math.max(0, Math.floor(Number(p.cup.wins) || 0)), active: !!p.cup.active }
    : null;
  out.seasonClaimed = typeof p.seasonClaimed === 'string' ? p.seasonClaimed : null;
  out.replays = Array.isArray(p.replays) ? p.replays.filter((r) => r && Array.isArray(r.snaps)).slice(0, 3) : [];
  // ——— крупное обновление ———
  out.wins = Math.max(0, Math.floor(Number(p.wins) || 0));
  out.level = Math.max(1, Math.min(PLAYER_LEVEL_MAX, Math.floor(Number(p.level) || 1)));
  out.xp = Math.max(0, Math.floor(Number(p.xp) || 0));
  out.bossKills = Math.max(0, Math.floor(Number(p.bossKills) || 0));
  out.cupWins = Math.max(0, Math.floor(Number(p.cupWins) || 0));
  out.coopWins = Math.max(0, Math.floor(Number(p.coopWins) || 0));
  out.clanWarWins = Math.max(0, Math.floor(Number(p.clanWarWins) || 0));
  out.forges = Math.max(0, Math.floor(Number(p.forges) || 0));
  out.mythics = Math.max(0, Math.floor(Number(p.mythics) || 0));
  out.evo = {};
  if (p.evo && typeof p.evo === 'object') {
    for (const [id, s] of Object.entries(p.evo)) {
      const n = Math.floor(Number(s));
      if (n >= 1 && n <= 3) out.evo[id] = n;
    }
  }
  out.campaignDone = {};
  if (p.campaignDone && typeof p.campaignDone === 'object') {
    for (const [id, s] of Object.entries(p.campaignDone)) {
      const n = Math.floor(Number(s));
      if (n >= 1 && n <= 3) out.campaignDone[id] = n;
    }
  }
  out.clanWar = (p.clanWar && typeof p.clanWar === 'object')
    ? { points: Math.max(0, Math.floor(Number(p.clanWar.points) || 0)), fights: Math.max(0, Math.floor(Number(p.clanWar.fights) || 0)) }
    : { points: 0, fights: 0 };
  out.pass = (p.pass && typeof p.pass === 'object')
    ? {
        season: typeof p.pass.season === 'string' ? p.pass.season : null,
        xp: Math.max(0, Math.floor(Number(p.pass.xp) || 0)),
        premium: !!p.pass.premium,
        claimed: Array.isArray(p.pass.claimed) ? p.pass.claimed.map(Number).filter((n) => n >= 1 && n <= 20) : [],
        claimedPremium: Array.isArray(p.pass.claimedPremium) ? p.pass.claimedPremium.map(Number).filter((n) => n >= 1 && n <= 20) : []
      }
    : { season: null, xp: 0, premium: false, claimed: [], claimedPremium: [] };
  out.ach = {};
  if (p.ach && typeof p.ach === 'object') {
    for (const [id, v] of Object.entries(p.ach)) if (v) out.ach[id] = true;
  }
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

// ——— разблокировка карт ———

export const STARTER_CARDS = [
  'knight','archers','skeletons','goblins','spear_goblins','bomber',
  'barbarians','valkyrie','musketeer','giant','cannon','tesla',
  'arrows','zap','fireball'
];

export const HERO_FRAGMENTS_FOR_UNLOCK = 80;

// фрагменты героя (id -> количество)
export function heroFragmentsOf(progress, heroId) {
  if (!progress) return 0;
  progress.heroFragments = progress.heroFragments || {};
  return progress.heroFragments[heroId] || 0;
}

export function addHeroFragments(progress, heroId, n) {
  if (!progress || !heroId) return 0;
  progress.heroFragments = progress.heroFragments || {};
  progress.heroFragments[heroId] = Math.min(999999, (progress.heroFragments[heroId] || 0) + Math.max(0, Math.floor(n || 0)));
  return progress.heroFragments[heroId];
}

export function isHeroUnlocked(progress, heroId) {
  if (!progress) return false;
  progress.heroes = progress.heroes || [];
  return progress.heroes.includes(heroId);
}

export function unlockHero(progress, heroId) {
  if (!progress) return false;
  progress.heroes = progress.heroes || [];
  if (!progress.heroes.includes(heroId)) {
    progress.heroes.push(heroId);
    return true;
  }
  return false;
}

export function isCardUnlocked(progress, cardId) {
  const u = progress && progress.unlockedCards;
  return u && u.includes(cardId);
}

// разблокировать карту (вернёт true, если только что открыта)
export function unlockCard(progress, cardId) {
  if (!progress) return false;
  progress.unlockedCards = progress.unlockedCards || [];
  if (!progress.unlockedCards.includes(cardId)) {
    progress.unlockedCards.push(cardId);
    return true;
  }
  return false;
}

// открыть стартовый набор карт (новый аккаунт)
export function unlockStarterCards(progress) {
  if (!progress) return [];
  const freshly = [];
  for (const id of STARTER_CARDS) {
    if (unlockCard(progress, id)) freshly.push(id);
  }
  return freshly;
}

// разблокировать карты, доступные на текущем количестве кубков
// cardMeta — массив {id, unlockTrophies}
export function applyUnlocksByTrophies(progress, cardMeta, trophies) {
  if (!progress) return [];
  const freshly = [];
  const tr = trophies || 0;
  for (const c of cardMeta) {
    const t = c.unlockTrophies || 0;
    if (t <= tr && unlockCard(progress, c.id)) freshly.push(c.id);
  }
  return freshly;
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
  { type: 'wood', name: 'Деревянный сундук', icon: '📦', gold: [60, 120], cards: 1, copies: [5, 10] },
  { type: 'iron', name: 'Железный сундук', icon: '🧰', gold: [140, 240], cards: 2, copies: [12, 20] },
  { type: 'gold', name: 'Золотой сундук', icon: '💰', gold: [280, 450], cards: 3, copies: [22, 36] },
  { type: 'royal', name: 'Королевский сундук', icon: '👑', gold: [550, 900], cards: 5, copies: [45, 80] },
  { type: 'legendary', name: 'Легендарный сундук', icon: '💎', gold: [1000, 1800], cards: 6, copies: [90, 150] },
  { type: 'season', name: 'Сезонный сундук', icon: '🎖', gold: [700, 1200], cards: 5, copies: [60, 100] }
];

export function rollChest(win) {
  const r = Math.random();
  let idx;
  if (win) {
    idx = r < 0.40 ? 0 : r < 0.70 ? 1 : r < 0.90 ? 2 : r < 0.97 ? 3 : r < 0.99 ? 4 : 5;
  } else {
    idx = r < 0.65 ? 0 : r < 0.90 ? 1 : r < 0.97 ? 2 : r < 0.99 ? 3 : 5;
  }
  return { ...CHEST_TYPES[idx], id: Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36) };
}

// сундук конкретного типа (для наград кампании и пропуска)
export function chestByType(type) {
  const t = CHEST_TYPES.find((c) => c.type === type) || CHEST_TYPES[0];
  return { ...t, id: Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36) };
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
