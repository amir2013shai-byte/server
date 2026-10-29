// Кампания: 4 главы × 5 миссий, боссы со своими способностями, награды.
// Правила боя усиливаются от главы к главе; боссы встречаются в ключевых миссиях.

export const CHAPTERS = [
  { id: 1, name: 'Зелёные земли', icon: '🌿', desc: 'Начало похода: разбойники лугов и первый босс.' },
  { id: 2, name: 'Песчаные бури', icon: '🏜', desc: 'Долина песков: засады, черви и песчаные бури.' },
  { id: 3, name: 'Ледяные пустоши', icon: '❄️', desc: 'Стужа и тьма: ледяные големы и тёмные маги.' },
  { id: 4, name: 'Огненная цитадель', icon: '🔥', desc: 'Финал похода: магмовые драконы и Король Пустоши.' }
];

// способности боссов исполняет BossController в бою
export const BOSSES = {
  spore_lord: {
    name: 'Грибной лорд', icon: '🍄',
    story: 'Древний гриб поработил луга. Он лечит своих и зовёт споры-скелеты!',
    hpBonus: 2500,
    abilities: [
      { type: 'summon', every: 11, card: 'skeletons', label: 'Споры' },
      { type: 'heal', every: 13, amount: 300, label: 'Споровое исцеление' }
    ]
  },
  frost_golem: {
    name: 'Ледяной голем', icon: '🧊',
    story: 'Колосс из вечного льда. Обрушивает град на твои войска!',
    hpBonus: 3500,
    abilities: [
      { type: 'meteor', every: 9, damage: 220, radius: 2.8, label: 'Ледяной град' },
      { type: 'summon', every: 14, card: 'ice_spirit', label: 'Ледяные духи' }
    ]
  },
  sand_worm: {
    name: 'Песчаный червь', icon: '🪱',
    story: 'Пески скрывают чудовище, подтачивающее твои башни из-под земли.',
    hpBonus: 3000,
    abilities: [
      { type: 'quake', every: 12, damage: 200, label: 'Подземный толчок' },
      { type: 'summon', every: 10, card: 'goblins', label: 'Вылазка гоблинов' }
    ]
  },
  dark_mage: {
    name: 'Тёмный маг', icon: '🧙',
    story: 'Владыка тьмы насылает проклятия на самых сильных героев.',
    hpBonus: 3200,
    abilities: [
      { type: 'curse', every: 10, percent: 0.2, label: 'Проклятие' },
      { type: 'meteor', every: 17, damage: 160, radius: 3.2, label: 'Тёмная буря' }
    ]
  },
  magma_dragon: {
    name: 'Магмовый дракон', icon: '🐉',
    story: 'Дракон из жерла вулкана. Огненные бомбы и выводки магмалингов!',
    hpBonus: 4000,
    abilities: [
      { type: 'meteor', every: 8, damage: 250, radius: 2.8, label: 'Огненный дождь' },
      { type: 'summon', every: 12, card: 'magmalings', label: 'Выводок' }
    ]
  },
  wasteland_king: {
    name: 'Король Пустоши', icon: '👑',
    story: 'Последний враг похода. Владеет землёй, огнём и тьмой одновременно!',
    hpBonus: 5000,
    abilities: [
      { type: 'quake', every: 13, damage: 240, label: 'Гнев земли' },
      { type: 'meteor', every: 10, damage: 230, radius: 3, label: 'Метеоритный шторм' },
      { type: 'summon', every: 14, card: 'golemites', label: 'Каменные стражи' }
    ]
  }
};

const chestCycle = [null, null, 'wood', null, 'iron', null, 'wood', 'iron', 'gold', 'royal'];

export const MISSIONS = [
  // ——— глава 1: Зелёные земли ———
  { id: 'm01', ch: 1, name: 'Первая стычка', enemyName: '⚔️ Разбойники луга',
    story: 'Отряды мародёров напали на деревню. Отбей атаку и докажи, что ты — защитник!',
    deck: ['knight', 'archers', 'skeletons', 'goblins', 'bomber', 'arrows', 'cannon', 'minions'],
    boss: null, rules: { enemyKingHp: 1, doubleElixirAt: 120 },
    rewards: { gold: 40, copies: [{ id: 'knight', count: 2 }] } },
  { id: 'm02', ch: 1, name: 'Лесная засада', enemyName: '🌲 Лесные гоблины',
    story: 'Гоблины устроили засаду в лесу. Их много — но ты умнее!',
    deck: ['goblins', 'spear_goblins', 'archers', 'bomber', 'valkyrie', 'zap', 'tombstone', 'bats'],
    boss: null, rules: { enemyKingHp: 1, doubleElixirAt: 120 },
    rewards: { gold: 45, copies: [{ id: 'archers', count: 2 }] } },
  { id: 'm03', ch: 1, name: 'Мостовое сражение', enemyName: '🛡 Стражи моста',
    story: 'Стражи захватили мосты. Прорвись к их башням!',
    deck: ['guards', 'recruits', 'musketeer', 'knight', 'fireball', 'cannon', 'minions', 'spear_goblins'],
    boss: null, rules: { enemyKingHp: 1.1, doubleElixirAt: 110 },
    rewards: { gold: 50, copies: [{ id: 'musketeer', count: 2 }] } },
  { id: 'm04', ch: 1, name: 'Битва за переправу', enemyName: '🚣 Наёмники реки',
    story: 'Наёмники взяли переправу. Их капитан уже спешит на подмогу!',
    deck: ['barbarians', 'battle_ram', 'archers', 'zap', 'fireball', 'tesla', 'minions', 'knight'],
    boss: null, rules: { enemyKingHp: 1.15, doubleElixirAt: 110 },
    rewards: { gold: 60, copies: [{ id: 'valkyrie', count: 2 }] } },
  { id: 'm05', ch: 1, name: 'БОСС: Грибной лорд', enemyName: '🍄 Грибной лорд',
    story: 'Древний гриб поработил луга и зовёт полчища спор. Покажи ему силу!',
    deck: ['skeletons', 'witch', 'bats', 'goblins', 'poison', 'tombstone', 'night_witch', 'minions'],
    boss: 'spore_lord', rules: { enemyKingHp: 1.2, doubleElixirAt: 100 },
    rewards: { gold: 120, copies: [{ id: 'witch', count: 3 }], chest: 'iron' } },

  // ——— глава 2: Песчаные бури ———
  { id: 'm06', ch: 2, name: 'Песчаный ветер', enemyName: '🏜 Кочевники пустоши',
    story: 'Буря скрывает кочевников, которые бьют из-за песков.',
    deck: ['dart_shooter', 'archers', 'boar_rider', 'goblins', 'zap', 'mortar', 'minions', 'fire_spirit'],
    boss: null, rules: { enemyKingHp: 1.2, doubleElixirAt: 100 },
    rewards: { gold: 70, copies: [{ id: 'boar_rider', count: 2 }] } },
  { id: 'm07', ch: 2, name: 'Караван под угрозой', enemyName: '🐫 Разбойники каравана',
    story: 'Караван с припасами атакован. Спаси его — и припасы твои!',
    deck: ['berserk', 'guards', 'dart_shooter', 'fireball', 'cannon', 'spear_goblins', 'bats', 'knight'],
    boss: null, rules: { enemyKingHp: 1.25, doubleElixirAt: 100 },
    rewards: { gold: 75, copies: [{ id: 'dart_shooter', count: 2 }], chest: 'wood' } },
  { id: 'm08', ch: 2, name: 'Оазис раздора', enemyName: '🌴 Хранители оазиса',
    story: 'Хранители оазиса не верят чужакам. Сломи их оборону!',
    deck: ['bow_master', 'guards', 'wizard', 'heal', 'tesla', 'goblins', 'minions', 'fireball'],
    boss: null, rules: { enemyKingHp: 1.3, doubleElixirAt: 90 },
    rewards: { gold: 80, copies: [{ id: 'wizard', count: 2 }] } },
  { id: 'm09', ch: 2, name: 'Буря в каньоне', enemyName: '🌪 Стая каньона',
    story: 'В каньоне бушует буря, а в ней — вражеские отряды.',
    deck: ['flying_machine', 'minions', 'bats', 'fire_spirit', 'zap', 'tornado', 'archers', 'battle_ram'],
    boss: null, rules: { enemyKingHp: 1.35, doubleElixirAt: 90 },
    rewards: { gold: 90, copies: [{ id: 'flying_machine', count: 2 }] } },
  { id: 'm10', ch: 2, name: 'БОСС: Песчаный червь', enemyName: '🪱 Песчаный червь',
    story: 'Чудовище подтачивает твои башни из-под земли. Останови его!',
    deck: ['goblins', 'spear_goblins', 'goblin_hut', 'tombstone', 'giant', 'poison', 'minions', 'barbarians'],
    boss: 'sand_worm', rules: { enemyKingHp: 1.4, doubleElixirAt: 80 },
    rewards: { gold: 180, copies: [{ id: 'giant', count: 3 }], chest: 'gold' } },

  // ——— глава 3: Ледяные пустоши ———
  { id: 'm11', ch: 3, name: 'Первый снег', enemyName: '❄️ Ледяные разведчики',
    story: 'Снег скрывает разведчиков. Они бьют быстро и исчезают!',
    deck: ['ice_spirit', 'ice_mage', 'archers', 'flying_machine', 'zap', 'tesla', 'minions', 'boar_rider'],
    boss: null, rules: { enemyKingHp: 1.4, doubleElixirAt: 80 },
    rewards: { gold: 100, copies: [{ id: 'ice_mage', count: 2 }] } },
  { id: 'm12', ch: 3, name: 'Замёрзший лагерь', enemyName: '🏕 Лагерь изгнанников',
    story: 'Изгнанники ледяных земель не сдаются. Их лагерь — крепость!',
    deck: ['dark_knight', 'guardian', 'ice_golem', 'freeze', 'cannon', 'bow_master', 'bats', 'fireball'],
    boss: null, rules: { enemyKingHp: 1.5, doubleElixirAt: 75 },
    rewards: { gold: 110, copies: [{ id: 'dark_knight', count: 2 }] } },
  { id: 'm13', ch: 3, name: 'Ледяные врата', enemyName: '🚪 Стражи врат',
    story: 'Врата в ледяные пустоши заперты. Стражи не пропустят!',
    deck: ['guardian', 'ice_golem', 'ice_mage', 'valkyrie', 'watchtower', 'freeze', 'minions', 'musketeer'],
    boss: null, rules: { enemyKingHp: 1.55, doubleElixirAt: 75 },
    rewards: { gold: 120, copies: [{ id: 'guardian', count: 2 }], chest: 'wood' } },
  { id: 'm14', ch: 3, name: 'Ночной шторм', enemyName: '🌙 Ночные охотники',
    story: 'Шторм и темнота — союзники ночных охотников. Будь осторожен!',
    deck: ['ghost_knight', 'shadow_assassin', 'night_witch', 'bats', 'poison', 'tombstone', 'dark_knight', 'arrows'],
    boss: null, rules: { enemyKingHp: 1.6, doubleElixirAt: 70 },
    rewards: { gold: 130, copies: [{ id: 'shadow_assassin', count: 2 }] } },
  { id: 'm15', ch: 3, name: 'БОСС: Ледяной голем', enemyName: '🧊 Ледяной голем',
    story: 'Колосс из вечного льда обрушивает град. Растопи его!',
    deck: ['ice_golem', 'golem', 'ice_mage', 'freeze', 'watchtower', 'valkyrie', 'minions', 'heal'],
    boss: 'frost_golem', rules: { enemyKingHp: 1.7, doubleElixirAt: 70 },
    rewards: { gold: 250, copies: [{ id: 'ice_golem', count: 4 }], chest: 'gold' } },

  // ——— глава 4: Огненная цитадель ———
  { id: 'm16', ch: 4, name: 'Лавовые поля', enemyName: '🔥 Стражи лавы',
    story: 'Лавовые поля защищают лучших воинов цитадели.',
    deck: ['fire_sorcerer', 'fire_lord', 'fire_spirit', 'fireball', 'rocket', 'dragon_lair', 'minions', 'bruiser'],
    boss: null, rules: { enemyKingHp: 1.75, doubleElixirAt: 65 },
    rewards: { gold: 150, copies: [{ id: 'fire_sorcerer', count: 3 }] } },
  { id: 'm17', ch: 4, name: 'Обсидиановая стена', enemyName: '🧱 Каменные легионы',
    story: 'Обсидиановая стена кажется неприступной. Но у неё есть слабость!',
    deck: ['steel_golem', 'bruiser', 'golem', 'mortar', 'rocket', 'priestess', 'battle_healer', 'demolishers'],
    boss: null, rules: { enemyKingHp: 1.85, doubleElixirAt: 65 },
    rewards: { gold: 165, copies: [{ id: 'bruiser', count: 3 }] } },
  { id: 'm18', ch: 4, name: 'Логово драконов', enemyName: '🐉 Драконья стая',
    story: 'В логове цитадели зреют драконы. Не дай им вылупиться!',
    deck: ['phoenix', 'dragonet', 'bone_dragon', 'flying_machine', 'fireball', 'dragon_lair', 'minions', 'tornado'],
    boss: null, rules: { enemyKingHp: 1.95, doubleElixirAt: 60 },
    rewards: { gold: 180, copies: [{ id: 'phoenix', count: 3 }], chest: 'iron' } },
  { id: 'm19', ch: 4, name: 'Тронный зал', enemyName: '👑 Королевская гвардия',
    story: 'Гвардия Короля Пустоши защищает тронный зал до последнего!',
    deck: ['champion', 'storm_lord', 'ice_queen', 'fire_lord', 'lightning', 'obelisk', 'battle_healer', 'demolishers'],
    boss: null, rules: { enemyKingHp: 2.05, doubleElixirAt: 60 },
    rewards: { gold: 200, copies: [{ id: 'champion', count: 3 }] } },
  { id: 'm20', ch: 4, name: 'ФИНАЛ: Король Пустоши', enemyName: '👑 Король Пустоши',
    story: 'Финальная битва похода! Король Пустоши владеет землёй, огнём и тьмой. Победи — и мир будет спасён!',
    deck: ['golem', 'magma_beast', 'fire_lord', 'storm_lord', 'lightning', 'rocket', 'dragon_lair', 'steel_golem'],
    boss: 'wasteland_king', rules: { enemyKingHp: 2.2, doubleElixirAt: 55 },
    rewards: { gold: 500, copies: [{ id: 'magma_beast', count: 5 }], chest: 'royal' } }
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || null;
}

export function chapterMissions(ch) {
  return MISSIONS.filter((m) => m.ch === ch);
}

// миссия разблокирована, если пройдена предыдущая (первая — всегда)
export function isUnlocked(missionId, done) {
  const idx = MISSIONS.findIndex((m) => m.id === missionId);
  if (idx <= 0) return true;
  return !!done[MISSIONS[idx - 1].id];
}
