// Арены: тема поля + уровень сложности ИИ. Арена растёт с кубками игрока.
// Чем выше арена — тем умнее бот и тем ярче оформление поля.

export const ARENAS = [
  {
    id: 'meadow', name: 'Зелёные луга', icon: '🌿', min: 0, difficulty: 0,
    colors: {
      wall: '#2c3a55', fieldA: '#3f7d46', fieldB: '#468a4e',
      ownTint: 'rgba(60,110,220,0.10)', enemyTint: 'rgba(220,90,70,0.08)',
      river: '#2e7dd6', riverLine: 'rgba(255,255,255,0.12)',
      bridge: '#a5794c', bridgePlank: 'rgba(72,46,22,0.32)', bridgeRail: '#8a6238', bridgeEdge: 'rgba(52,32,14,0.5)'
    }
  },
  {
    id: 'desert', name: 'Песчаная долина', icon: '🏜', min: 400, difficulty: 1,
    colors: {
      wall: '#4a4230', fieldA: '#c2a56a', fieldB: '#b89a5e',
      ownTint: 'rgba(60,110,220,0.10)', enemyTint: 'rgba(220,90,70,0.08)',
      river: '#3d9fd6', riverLine: 'rgba(255,255,255,0.14)',
      bridge: '#8a6238', bridgePlank: 'rgba(60,38,18,0.35)', bridgeRail: '#6e4c2c', bridgeEdge: 'rgba(42,26,12,0.55)'
    }
  },
  {
    id: 'ice', name: 'Ледяная гавань', icon: '❄️', min: 900, difficulty: 2,
    colors: {
      wall: '#2a3a4c', fieldA: '#8fb8cc', fieldB: '#9cc4d6',
      ownTint: 'rgba(60,110,220,0.12)', enemyTint: 'rgba(220,90,70,0.08)',
      river: '#2a6ec8', riverLine: 'rgba(220,240,255,0.20)',
      bridge: '#7a8fa8', bridgePlank: 'rgba(40,55,80,0.35)', bridgeRail: '#5f7391', bridgeEdge: 'rgba(28,42,64,0.55)'
    }
  },
  {
    id: 'lava', name: 'Огненные земли', icon: '🔥', min: 1400, difficulty: 3,
    colors: {
      wall: '#3a2a28', fieldA: '#7a4a3a', fieldB: '#8a5540',
      ownTint: 'rgba(60,110,220,0.10)', enemyTint: 'rgba(255,120,60,0.10)',
      river: '#d65b2e', riverLine: 'rgba(255,210,140,0.25)',
      bridge: '#4a3a30', bridgePlank: 'rgba(30,18,12,0.4)', bridgeRail: '#382c24', bridgeEdge: 'rgba(20,12,8,0.55)'
    }
  },
  {
    id: 'darkwood', name: 'Тёмный лес', icon: '🌑', min: 2000, difficulty: 4,
    colors: {
      wall: '#1e2a22', fieldA: '#2e4a32', fieldB: '#35553a',
      ownTint: 'rgba(70,130,230,0.12)', enemyTint: 'rgba(200,80,90,0.10)',
      river: '#24486e', riverLine: 'rgba(160,200,255,0.14)',
      bridge: '#5a4a38', bridgePlank: 'rgba(28,22,14,0.4)', bridgeRail: '#463a2c', bridgeEdge: 'rgba(18,14,10,0.55)'
    }
  },
  {
    id: 'royal', name: 'Королевский трон', icon: '👑', min: 2800, difficulty: 5,
    colors: {
      wall: '#2a2444', fieldA: '#4a3a6a', fieldB: '#54437a',
      ownTint: 'rgba(80,130,240,0.12)', enemyTint: 'rgba(230,100,110,0.10)',
      river: '#3a6ec8', riverLine: 'rgba(230,220,255,0.20)',
      bridge: '#8a7a5c', bridgePlank: 'rgba(50,40,22,0.35)', bridgeRail: '#6e6148', bridgeEdge: 'rgba(34,28,16,0.55)'
    }
  },
  {
    id: 'abyss', name: 'Глубины бездны', icon: '🌀', min: 3200, difficulty: 6,
    colors: {
      wall: '#1c2038', fieldA: '#2e3a62', fieldB: '#354371',
      ownTint: 'rgba(80,120,240,0.14)', enemyTint: 'rgba(220,90,130,0.12)',
      river: '#5b3cd6', riverLine: 'rgba(190,160,255,0.22)',
      bridge: '#3a3a62', bridgePlank: 'rgba(20,18,44,0.42)', bridgeRail: '#2e2e52', bridgeEdge: 'rgba(12,10,28,0.6)'
    }
  },
  {
    id: 'sky', name: 'Небесные сады', icon: '☁️', min: 3700, difficulty: 7,
    colors: {
      wall: '#4a5a80', fieldA: '#7ab8d8', fieldB: '#88c4e2',
      ownTint: 'rgba(60,110,220,0.10)', enemyTint: 'rgba(220,90,70,0.08)',
      river: '#62c8f2', riverLine: 'rgba(255,255,255,0.30)',
      bridge: '#e8d8a8', bridgePlank: 'rgba(140,110,60,0.30)', bridgeRail: '#c8b488', bridgeEdge: 'rgba(90,70,36,0.5)'
    }
  },
  {
    id: 'crater', name: 'Драконий кратер', icon: '🌋', min: 4300, difficulty: 8,
    colors: {
      wall: '#2c1a1a', fieldA: '#5a2c22', fieldB: '#6a3628',
      ownTint: 'rgba(70,110,220,0.12)', enemyTint: 'rgba(255,110,50,0.14)',
      river: '#e04a1a', riverLine: 'rgba(255,190,110,0.35)',
      bridge: '#3c2418', bridgePlank: 'rgba(16,8,4,0.5)', bridgeRail: '#2c1a10', bridgeEdge: 'rgba(10,5,2,0.6)'
    }
  },
  {
    id: 'stars', name: 'Звёздный трон', icon: '🌟', min: 5000, difficulty: 9,
    colors: {
      wall: '#141430', fieldA: '#232349', fieldB: '#2a2a56',
      ownTint: 'rgba(90,130,255,0.16)', enemyTint: 'rgba(230,110,180,0.14)',
      river: '#7a5cff', riverLine: 'rgba(220,210,255,0.3)',
      bridge: '#4a4a88', bridgePlank: 'rgba(24,22,60,0.45)', bridgeRail: '#3c3c72', bridgeEdge: 'rgba(14,12,40,0.6)'
    }
  },

];

// арена по кубкам игрока
export function arenaFor(trophies) {
  let out = ARENAS[0];
  for (const a of ARENAS) if ((trophies || 0) >= a.min) out = a;
  return out;
}

export function arenaIndex(trophies) {
  return ARENAS.indexOf(arenaFor(trophies));
}

// следующая арена (для прогресса) или null
export function nextArena(trophies) {
  return ARENAS.find((a) => (trophies || 0) < a.min) || null;
}
