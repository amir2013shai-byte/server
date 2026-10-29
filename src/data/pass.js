// Сезонный бой-пропуск: 20 уровней, бесплатный и премиум-треки.
// XP капают за бои, турниры, кампанию и «Экзамен». Каждый уровень — награда.

export const PASS_XP_PER_TIER = 100;
export const PASS_TIERS = 20;
export const PREMIUM_COST = 500; // золото

// награда: { gold?, copies?: [{id, count}], chest?: 'wood'|'iron'|'gold'|'royal', icon, label }
export const PASS_REWARDS = [
  { tier: 1, free: { gold: 50, icon: '💰', label: '50 золота' }, premium: { gold: 150, icon: '💰', label: '150 золота' } },
  { tier: 2, free: { copies: [{ id: 'knight', count: 3 }], icon: '🃏', label: 'Рыцарь ×3' }, premium: { copies: [{ id: 'valkyrie', count: 4 }], icon: '🃏', label: 'Валькирия ×4' } },
  { tier: 3, free: { gold: 75, icon: '💰', label: '75 золота' }, premium: { chest: 'wood', icon: '📦', label: 'Деревянный сундук' } },
  { tier: 4, free: { copies: [{ id: 'archers', count: 4 }], icon: '🏹', label: 'Лучники ×4' }, premium: { copies: [{ id: 'musketeer', count: 5 }], icon: '🎯', label: 'Мушкетёр ×5' } },
  { tier: 5, free: { chest: 'wood', icon: '📦', label: 'Деревянный сундук' }, premium: { chest: 'iron', icon: '🎁', label: 'Железный сундук' } },
  { tier: 6, free: { gold: 100, icon: '💰', label: '100 золота' }, premium: { gold: 250, icon: '💰', label: '250 золота' } },
  { tier: 7, free: { copies: [{ id: 'giant', count: 3 }], icon: '🗿', label: 'Гигант ×3' }, premium: { copies: [{ id: 'golem', count: 4 }], icon: '🪨', label: 'Голем ×4' } },
  { tier: 8, free: { gold: 120, icon: '💰', label: '120 золота' }, premium: { copies: [{ id: 'witch', count: 5 }], icon: '🧙', label: 'Ведьма ×5' } },
  { tier: 9, free: { copies: [{ id: 'wizard', count: 4 }], icon: '🔮', label: 'Волшебник ×4' }, premium: { chest: 'iron', icon: '🎁', label: 'Железный сундук' } },
  { tier: 10, free: { chest: 'iron', icon: '🎁', label: 'Железный сундук' }, premium: { chest: 'gold', icon: '🏆', label: 'Золотой сундук' } },
  { tier: 11, free: { gold: 150, icon: '💰', label: '150 золота' }, premium: { gold: 350, icon: '💰', label: '350 золота' } },
  { tier: 12, free: { copies: [{ id: 'dark_knight', count: 4 }], icon: '⚔️', label: 'Тёмный рыцарь ×4' }, premium: { copies: [{ id: 'champion', count: 5 }], icon: '🛡', label: 'Чемпион ×5' } },
  { tier: 13, free: { copies: [{ id: 'ice_mage', count: 5 }], icon: '❄️', label: 'Ледяной маг ×5' }, premium: { copies: [{ id: 'ice_queen', count: 4 }], icon: '👑', label: 'Ледяная королева ×4' } },
  { tier: 14, free: { gold: 180, icon: '💰', label: '180 золота' }, premium: { chest: 'gold', icon: '🏆', label: 'Золотой сундук' } },
  { tier: 15, free: { chest: 'gold', icon: '🏆', label: 'Золотой сундук' }, premium: { chest: 'royal', icon: '💎', label: 'Королевский сундук' } },
  { tier: 16, free: { copies: [{ id: 'phoenix', count: 3 }], icon: '🔥', label: 'Феникс ×3' }, premium: { copies: [{ id: 'magma_beast', count: 4 }], icon: '🌋', label: 'Магмовый зверь ×4' } },
  { tier: 17, free: { gold: 220, icon: '💰', label: '220 золота' }, premium: { gold: 500, icon: '💰', label: '500 золота' } },
  { tier: 18, free: { copies: [{ id: 'storm_lord', count: 3 }], icon: '⚡', label: 'Повелитель бурь ×3' }, premium: { copies: [{ id: 'fire_lord', count: 4 }], icon: '🔥', label: 'Повелитель огня ×4' } },
  { tier: 19, free: { copies: [{ id: 'golem', count: 5 }], icon: '🪨', label: 'Голем ×5' }, premium: { chest: 'royal', icon: '💎', label: 'Королевский сундук' } },
  { tier: 20, free: { chest: 'royal', icon: '💎', label: 'Королевский сундук' }, premium: { chest: 'royal', icon: '👑', label: '2 королевских сундука', count: 2 } }
];

export function tierForXp(xp) {
  return Math.max(0, Math.min(PASS_TIERS, Math.floor((xp || 0) / PASS_XP_PER_TIER)));
}

// награды уровня: track = 'free' | 'premium'
export function passReward(tier, track) {
  const row = PASS_REWARDS.find((r) => r.tier === tier);
  return row ? row[track] : null;
}
