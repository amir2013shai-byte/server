// База карт: оригинальный ростер архетипов (танк, стрелок, рой, дух, заклинание, здание...).
// У каждой карты — характеристики, абилки и 3D-модель из примитивов.
import {
  P, humanoid, smallHumanoid, skeleton, dragon, spirit, golem, winged,
  building, turret, bowArm, beast
} from './models.js';

const R = {
  common: { label: 'Обычная', color: '#b8c0cc' },
  rare: { label: 'Редкая', color: '#f0a13c' },
  epic: { label: 'Эпическая', color: '#c26bf2' },
  legendary: { label: 'Легендарная', color: '#49d9ff' }
};

function card(c) {
  return {
    desc: '',
    count: 1,
    abilities: [],
    spell: null,
    building: null,
    hidden: false,
    flying: false,
    buildingOnly: false,
    splash: 0,
    sight: 5.5,
    targets: 'ground',
    ...c
  };
}

// ————————————————————————— войска —————————————————————————

const TROOPS = [
  card({
    id: 'knight', name: 'Рыцарь', rarity: 'common', type: 'troop', cost: 3,
    desc: 'Бронированный боец ближнего боя. Надёжный защитник короны.',
    hp: 1450, damage: 205, hitSpeed: 1.2, range: 0.9, speed: 1.05, targets: 'ground',
    model: humanoid('#3b6fd4', '#e8b88a', { helmet: '#9aa3b5', weapon: '#c8ccd8', shield: '#2c4a9c' })
  }),
  card({
    id: 'archers', name: 'Лучницы', rarity: 'common', type: 'troop', cost: 3, count: 2,
    desc: 'Две меткие лучницы. Бьют и по земле, и по воздуху.',
    hp: 280, damage: 95, hitSpeed: 1.1, range: 5.0, speed: 1.05, targets: 'both',
    model: (() => {
      const m = humanoid('#2e8b57', '#f0c8a0', { helmet: '#c23b3b', plume: '#e85d5d' });
      m.parts.push(...bowArm());
      return m;
    })()
  }),
  card({
    id: 'skeletons', name: 'Скелеты', rarity: 'common', type: 'troop', cost: 1, count: 3,
    desc: 'Отряд слабых, но очень быстрых костяных бойцов.',
    hp: 95, damage: 85, hitSpeed: 1.0, range: 0.7, speed: 1.25, targets: 'ground',
    model: skeleton({ weapon: '#b8b09a' })
  }),
  card({
    id: 'goblins', name: 'Гоблины', rarity: 'common', type: 'troop', cost: 2, count: 3,
    desc: 'Быстрые зеленокожие разбойники с кинжалами.',
    hp: 210, damage: 130, hitSpeed: 1.0, range: 0.7, speed: 1.6, targets: 'ground',
    model: smallHumanoid('#7a4a2b', '#7dbb5a', { ears: true, weapon: '#c8ccd8' })
  }),
  card({
    id: 'spear_goblins', name: 'Копейщики', rarity: 'common', type: 'troop', cost: 2, count: 3,
    desc: 'Метают копья издалека. Бьют и по воздуху.',
    hp: 135, damage: 75, hitSpeed: 1.4, range: 4.2, speed: 1.6, targets: 'both',
    model: smallHumanoid('#4a7d3a', '#8fcc6a', { ears: true, weapon: '#8a5a2b' })
  }),
  card({
    id: 'minions', name: 'Миньоны', rarity: 'common', type: 'troop', cost: 3, count: 3,
    desc: 'Летающие твари, накидывающиеся на врага с воздуха.',
    hp: 220, damage: 110, hitSpeed: 1.0, range: 1.6, speed: 1.35, targets: 'both', flying: true,
    model: winged('#6d5bb5', '#9b7ee8', '#4c3d85')
  }),
  card({
    id: 'bats', name: 'Летучие мыши', rarity: 'common', type: 'troop', cost: 1, count: 4,
    desc: 'Стая быстрых летучих мышей. Опасны в большом количестве.',
    hp: 65, damage: 65, hitSpeed: 1.0, range: 0.8, speed: 1.7, targets: 'both', flying: true,
    model: winged('#4a3f6b', '#6b5bb5', '#322a4d')
  }),
  card({
    id: 'bomber', name: 'Бомбардир', rarity: 'common', type: 'troop', cost: 2,
    desc: 'Мечет бомбы по наземным целям с расстояния, нанося урон по площади.',
    hp: 345, damage: 175, hitSpeed: 1.9, range: 4.5, speed: 1.0, targets: 'ground', splash: 1.6,
    model: (() => {
      const m = smallHumanoid('#8a3b2b', '#e8b88a', { hat: '#3b3b44', weapon: '#5b5b66' });
      m.parts.push(P('sphere', [0.42, 0.85, 0.18], [0.16, 0.16, 0.16], '#2c2c34'));
      return m;
    })()
  }),
  card({
    id: 'barbarians', name: 'Варвары', rarity: 'common', type: 'troop', cost: 5, count: 4,
    desc: 'Четверо свирепых воинов с мечами. Грозная сила в ближнем бою.',
    hp: 650, damage: 185, hitSpeed: 1.3, range: 0.8, speed: 1.05, targets: 'ground',
    model: humanoid('#a34a2b', '#e8b88a', { helmet: '#c8b89a', weapon: '#c8ccd8' })
  }),
  card({
    id: 'guards', name: 'Гвардейцы', rarity: 'common', type: 'troop', cost: 3, count: 3,
    desc: 'Бойцы с щитами: щит принимает первый удар.',
    hp: 220, damage: 125, hitSpeed: 1.1, range: 0.8, speed: 1.15, targets: 'ground',
    abilities: [{ type: 'shield', hp: 220 }],
    model: humanoid('#5b6d8a', '#e8b88a', { helmet: '#8a97ad', weapon: '#c8ccd8', shield: '#c2a03c' })
  }),
  card({
    id: 'recruits', name: 'Рекруты', rarity: 'common', type: 'troop', cost: 4, count: 3,
    desc: 'Новобранцы с большими щитами. Медленно идут вперёд.',
    hp: 320, damage: 110, hitSpeed: 1.3, range: 0.9, speed: 0.85, targets: 'ground',
    abilities: [{ type: 'shield', hp: 320 }],
    model: humanoid('#3b6f8a', '#e8b88a', { helmet: '#6d8aa3', weapon: '#b8bcc8', shield: '#2c5a7a' })
  }),
  card({
    id: 'demolishers', name: 'Подрывники', rarity: 'common', type: 'troop', cost: 2, count: 2,
    desc: 'Бегут к зданиям и взрываются вместе с бочками пороха.',
    hp: 260, damage: 230, hitSpeed: 1.0, range: 0.9, speed: 1.8, targets: 'ground', buildingOnly: true,
    abilities: [{ type: 'deathDamage', damage: 320, radius: 1.8 }],
    model: (() => {
      const m = smallHumanoid('#6b3a2b', '#e8b88a', {});
      m.parts.push(P('cylinder', [-0.3, 0.55, -0.15], [0.16, 0.3, 0.16], '#8a3b2b', { rot: [0.2, 0, 0.2] }));
      m.parts.push(P('cylinder', [0.3, 0.55, -0.15], [0.16, 0.3, 0.16], '#8a3b2b', { rot: [0.2, 0, -0.2] }));
      m.parts.push(P('sphere', [0, 1.25, 0], [0.22, 0.1, 0.22], '#e8c860'));
      return m;
    })()
  }),

  // — духи —
  card({
    id: 'fire_spirit', name: 'Огненный дух', rarity: 'common', type: 'troop', cost: 1,
    desc: 'Бросается во врага и взрывается, нанося урон по площади.',
    hp: 150, damage: 240, hitSpeed: 1.0, range: 0.9, speed: 1.9, targets: 'both', splash: 1.7,
    abilities: [{ type: 'deathDamage', damage: 120, radius: 1.7 }],
    model: spirit('#ff8b3c', '#ffd08a')
  }),
  card({
    id: 'ice_spirit', name: 'Ледяной дух', rarity: 'common', type: 'troop', cost: 1,
    desc: 'Замораживает врагов при прыжке.',
    hp: 150, damage: 95, hitSpeed: 1.0, range: 0.9, speed: 1.9, targets: 'both', splash: 1.7,
    abilities: [{ type: 'freezeHit', duration: 1.2 }],
    model: spirit('#6bc8ff', '#c8ecff')
  }),
  card({
    id: 'spark_spirit', name: 'Искрящийся дух', rarity: 'common', type: 'troop', cost: 1,
    desc: 'Оглушает цель разрядом тока.',
    hp: 150, damage: 120, hitSpeed: 1.0, range: 1.0, speed: 1.9, targets: 'both',
    abilities: [{ type: 'stunHit', duration: 0.6 }],
    model: spirit('#ffe066', '#fff2b0')
  }),
  card({
    id: 'heal_spirit', name: 'Дух жизни', rarity: 'common', type: 'troop', cost: 1,
    desc: 'Прыгает к союзникам и лечит их.',
    hp: 150, damage: 40, hitSpeed: 1.0, range: 0.9, speed: 1.9, targets: 'ground',
    abilities: [{ type: 'healAura', hps: 220, radius: 2.6, duration: 2 }],
    model: spirit('#7dff9e', '#c8ffd8')
  }),

  // — редкие войска —
  card({
    id: 'valkyrie', name: 'Валькирия', rarity: 'rare', type: 'troop', cost: 4,
    desc: 'Кружит топором, срубая всех врагов вокруг себя.',
    hp: 1750, damage: 245, hitSpeed: 1.5, range: 1.0, speed: 1.05, targets: 'ground', splash: 1.7,
    model: (() => {
      const m = humanoid('#c2532b', '#f0c8a0', { helmet: '#c23b3b', plume: '#e85d5d', legs: '#5b3a2b' });
      m.parts.push(P('box', [0.55, 1.0, 0.1], [0.1, 0.55, 0.14], '#c8ccd8', { rot: [0.4, 0, -0.3] }));
      m.parts.push(P('box', [0.62, 1.35, 0.12], [0.28, 0.28, 0.05], '#8a8fa3', { rot: [0.4, 0, -0.3] }));
      return m;
    })()
  }),
  card({
    id: 'musketeer', name: 'Мушкетёр', rarity: 'rare', type: 'troop', cost: 4,
    desc: 'Дальнобойный стрелок с мушкетоном. Сбивает воздушные цели.',
    hp: 720, damage: 220, hitSpeed: 1.1, range: 6.0, speed: 1.0, targets: 'both',
    model: (() => {
      const m = humanoid('#3b4a8a', '#f0c8a0', { helmet: '#2c3260', plume: '#e8c860' });
      m.parts.push(P('cylinder', [0.5, 1.05, 0.15], [0.06, 0.95, 0.06], '#4a4a55', { rot: [1.25, 0, -0.15] }));
      return m;
    })()
  }),
  card({
    id: 'giant', name: 'Гигант', rarity: 'rare', type: 'troop', cost: 5,
    desc: 'Огромный великан, который идёт только к зданиям.',
    hp: 3600, damage: 190, hitSpeed: 1.5, range: 1.2, speed: 0.75, targets: 'ground', buildingOnly: true,
    model: (() => {
      const m = humanoid('#8a5a3b', '#e8b88a', { helmet: false, legs: '#5b3a2b' });
      // массивное тело
      m.parts[2] = P('box', [0, 1.05, 0], [1.15, 1.1, 0.7], '#8a5a3b');
      m.parts[3] = P('sphere', [0, 1.95, 0], [0.52, 0.52, 0.52], '#e8b88a');
      m.parts.push(P('box', [0, 1.05, 0], [1.3, 0.35, 0.8], '#6b422b'));
      return m;
    })()
  }),
  card({
    id: 'boar_rider', name: 'Всадник на вепре', rarity: 'rare', type: 'troop', cost: 4,
    desc: 'Стремительно мчится к вражеским зданиям верхом на кабане.',
    hp: 1250, damage: 270, hitSpeed: 1.6, range: 1.0, speed: 1.9, targets: 'ground', buildingOnly: true,
    model: (() => {
      const m = beast('#8a5a3b', '#c49a6c', '#5b3a22');
      m.parts.push(P('sphere', [0, 1.35, -0.15], [0.22, 0.22, 0.22], '#e8b88a'));
      m.parts.push(P('box', [0, 1.62, -0.15], [0.4, 0.12, 0.4], '#c23b3b'));
      m.parts.push(P('cylinder', [0.35, 1.25, 0.05], [0.05, 0.45, 0.05], '#8a5a2b', { rot: [0.5, 0, -0.4] }));
      return m;
    })()
  }),
  card({
    id: 'titan', name: 'Титан', rarity: 'rare', type: 'troop', cost: 4,
    desc: 'Медленный, но чудовищно сильный воин в тяжёлой броне.',
    hp: 1900, damage: 320, hitSpeed: 1.6, range: 1.0, speed: 0.85, targets: 'ground',
    model: humanoid('#5b5b66', '#b89a8a', { helmet: '#3b3b44', weapon: '#e0e4ec', legs: '#3b3b44' })
  }),
  card({
    id: 'wizard', name: 'Маг', rarity: 'rare', type: 'troop', cost: 5,
    desc: 'Швыряет огненные шары, сжигающие группы врагов.',
    hp: 620, damage: 245, hitSpeed: 1.7, range: 5.2, speed: 1.0, targets: 'both', splash: 1.7,
    model: (() => {
      const m = humanoid('#8a3b5b', '#e8b88a', { helmet: '#5b2b3b', plume: '#e85d5d' });
      m.parts.push(P('cone', [0, 1.85, 0], [0.42, 0.65, 0.42], '#5b2b3b'));
      m.parts.push(P('cylinder', [0.55, 1.1, 0.1], [0.05, 0.85, 0.05], '#8a5a2b', { rot: [0.25, 0, -0.25] }));
      m.parts.push(P('sphere', [0.62, 1.62, 0.12], [0.14, 0.14, 0.14], '#ff8b3c', { emissive: '#c2532b' }));
      return m;
    })()
  }),
  card({
    id: 'ice_mage', name: 'Ледяная колдунья', rarity: 'rare', type: 'troop', cost: 3,
    desc: 'Атаки замедляют врагов.',
    hp: 560, damage: 150, hitSpeed: 1.5, range: 5.0, speed: 1.0, targets: 'both', splash: 1.2,
    abilities: [{ type: 'slowHit', factor: 0.55, duration: 2.5 }],
    model: (() => {
      const m = humanoid('#3b7d9c', '#c8ecff', { helmet: '#2b5d7c', plume: '#9adcff' });
      m.parts.push(P('cone', [0, 1.85, 0], [0.4, 0.6, 0.4], '#2b5d7c'));
      m.parts.push(P('cylinder', [-0.5, 1.1, 0.1], [0.05, 0.85, 0.05], '#b8e8ff', { rot: [0.25, 0, 0.25] }));
      m.parts.push(P('sphere', [-0.58, 1.62, 0.12], [0.13, 0.13, 0.13], '#9adcff', { emissive: '#6bc8ff' }));
      return m;
    })()
  }),
  card({
    id: 'flying_machine', name: 'Ветролёт', rarity: 'rare', type: 'troop', cost: 4,
    desc: 'Летающая платформа с пушкой. Обстреливает всё вокруг.',
    hp: 750, damage: 165, hitSpeed: 0.9, range: 5.4, speed: 1.4, targets: 'both', flying: true,
    model: {
      parts: [
        P('box', [0, 0.75, 0], [0.95, 0.22, 0.95], '#8a6b3b'),
        P('cylinder', [0, 1.05, 0], [0.35, 0.35, 0.35], '#c8a860'),
        P('torus', [0, 1.05, 0], [0.85, 0.85, 0.85], '#5b4a2b', { rot: [1.57, 0, 0] }),
        P('box', [0, 1.28, 0.35], [0.14, 0.14, 0.55], '#3b3b44'),
        P('sphere', [0, 1.28, 0.75], [0.12, 0.12, 0.12], '#3b3b44'),
        P('cone', [-0.7, 0.85, -0.7], [0.14, 0.35, 0.14], '#e8c860', { rot: [1.2, 0, 0.8] }),
        P('cone', [0.7, 0.85, -0.7], [0.14, 0.35, 0.14], '#e8c860', { rot: [1.2, 0, -0.8] })
      ]
    }
  }),
  card({
    id: 'battle_ram', name: 'Таран', rarity: 'rare', type: 'troop', cost: 4,
    desc: 'Два варвара несут таран прямо в здание, а затем бьют в ближнем бою.',
    hp: 1150, damage: 300, hitSpeed: 1.4, range: 1.0, speed: 1.6, targets: 'ground', buildingOnly: true,
    abilities: [{ type: 'charge', multiplier: 2.0, windup: 2.5 }, { type: 'deathDamage', damage: 120, radius: 1.4 }],
    model: (() => {
      const m = humanoid('#6b422b', '#e8b88a', { helmet: false });
      m.parts.push(P('cylinder', [0, 0.95, 0.55], [0.18, 1.15, 0.18], '#8a5a2b', { rot: [1.57, 0, 0] }));
      m.parts.push(P('cone', [0, 0.95, 1.72], [0.24, 0.35, 0.24], '#c8ccd8', { rot: [-1.57, 0, 0] }));
      return m;
    })()
  }),
  card({
    id: 'dark_knight', name: 'Тёмный рыцарь', rarity: 'rare', type: 'troop', cost: 3,
    desc: 'Рыцарь тьмы с магическим щитом.',
    hp: 1050, damage: 195, hitSpeed: 1.2, range: 0.9, speed: 1.15, targets: 'ground',
    abilities: [{ type: 'shield', hp: 400 }],
    model: humanoid('#2c2c38', '#8a8a9c', { helmet: '#1c1c28', weapon: '#8a5aff', shield: '#4a2c8a' })
  }),
  card({
    id: 'priestess', name: 'Жрица', rarity: 'rare', type: 'troop', cost: 4,
    desc: 'Исцеляет окружающих союзников.',
    hp: 780, damage: 120, hitSpeed: 1.4, range: 3.5, speed: 1.0, targets: 'ground',
    abilities: [{ type: 'healAura', hps: 160, radius: 3.2 }],
    model: (() => {
      const m = humanoid('#e8e0c8', '#f0c8a0', { helmet: '#e8c860', plume: '#ffffff' });
      m.parts.push(P('cylinder', [0.5, 1.15, 0.1], [0.05, 0.9, 0.05], '#e8c860', { rot: [0.2, 0, -0.2] }));
      m.parts.push(P('torus', [0.58, 1.72, 0.12], [0.16, 0.16, 0.16], '#7dff9e', { emissive: '#4ac86a', rot: [0.3, 0, 0] }));
      return m;
    })()
  }),
  card({
    id: 'berserk', name: 'Берсерк', rarity: 'rare', type: 'troop', cost: 3,
    desc: 'Яростный воин с двумя топорами. Быстро рубит врагов.',
    hp: 950, damage: 170, hitSpeed: 0.75, range: 0.8, speed: 1.5, targets: 'ground',
    model: (() => {
      const m = humanoid('#a32b2b', '#e8b88a', { helmet: false, legs: '#5b2b2b' });
      m.parts.push(P('box', [-0.55, 1.05, 0.15], [0.22, 0.22, 0.05], '#c8ccd8', { rot: [0, 0, 0.5] }));
      m.parts.push(P('box', [0.55, 1.05, 0.15], [0.22, 0.22, 0.05], '#c8ccd8', { rot: [0, 0, -0.5] }));
      return m;
    })()
  }),
  card({
    id: 'dart_shooter', name: 'Метатель', rarity: 'rare', type: 'troop', cost: 3,
    desc: 'Очень быстрый стрелок из духовой трубки.',
    hp: 480, damage: 110, hitSpeed: 0.7, range: 5.2, speed: 1.6, targets: 'both',
    model: smallHumanoid('#2e8b57', '#7dbb5a', { ears: true, hat: '#c23b3b', weapon: '#8a5a2b' })
  }),
  card({
    id: 'fire_sorcerer', name: 'Огненный заклинатель', rarity: 'rare', type: 'troop', cost: 4,
    desc: 'Метает пламя во врагов, поджигая площадь.',
    hp: 600, damage: 210, hitSpeed: 1.6, range: 4.8, speed: 1.0, targets: 'ground', splash: 1.8,
    model: (() => {
      const m = humanoid('#c2532b', '#e8b88a', { helmet: '#8a3b2b', plume: '#ffb03c' });
      m.parts.push(P('cone', [0, 1.85, 0], [0.4, 0.62, 0.4], '#8a3b2b'));
      m.parts.push(P('sphere', [0.55, 1.3, 0.12], [0.16, 0.16, 0.16], '#ff8b3c', { emissive: '#c2532b' }));
      return m;
    })()
  }),
  card({
    id: 'giant_skeleton', name: 'Скелет-исполин', rarity: 'rare', type: 'troop', cost: 6,
    desc: 'Огромный скелет с бочкой пороха. После гибели бочка взрывается.',
    hp: 2800, damage: 220, hitSpeed: 1.5, range: 1.1, speed: 0.85, targets: 'ground',
    abilities: [{ type: 'deathDamage', damage: 720, radius: 2.6 }],
    model: (() => {
      const m = skeleton({ weapon: '#8a5a2b' });
      m.parts[2] = P('box', [0, 0.95, 0], [0.85, 0.95, 0.42], '#e8e4d8');
      m.parts[3] = P('sphere', [0, 1.85, 0], [0.5, 0.52, 0.5], '#f2eee2');
      m.parts[4] = P('box', [-0.18, 1.88, 0.44], [0.16, 0.18, 0.08], '#222228');
      m.parts[5] = P('box', [0.18, 1.88, 0.44], [0.16, 0.18, 0.08], '#222228');
      m.parts.push(P('cylinder', [0, 0.75, -0.6], [0.35, 0.55, 0.35], '#8a3b2b', { rot: [1.57, 0, 0] }));
      return m;
    })()
  }),
  card({
    id: 'bone_dragon', name: 'Костяной дракон', rarity: 'rare', type: 'troop', cost: 5,
    desc: 'Нежить-дракон, поражающая врагов ядовитым дыханием.',
    hp: 1350, damage: 195, hitSpeed: 1.6, range: 3.4, speed: 1.15, targets: 'both', flying: true, splash: 1.5,
    abilities: [{ type: 'deathDamage', damage: 180, radius: 1.8 }],
    model: dragon('#c8c4b8', '#8a8478', '#a8a294')
  }),

  // — эпические войска —
  card({
    id: 'witch', name: 'Ведьма', rarity: 'epic', type: 'troop', cost: 5,
    desc: 'Поднимает скелетов и бьёт тёмной магией по площади.',
    hp: 820, damage: 155, hitSpeed: 1.2, range: 4.8, speed: 1.0, targets: 'both', splash: 1.4,
    abilities: [{ type: 'spawnTroops', cardId: 'skeletons', interval: 4.5, max: 3 }],
    model: (() => {
      const m = humanoid('#5b2b7c', '#c8a0e8', { helmet: '#3b1b5c', plume: '#c26bf2' });
      m.parts.push(P('cone', [0, 1.9, 0], [0.45, 0.7, 0.45], '#3b1b5c'));
      m.parts.push(P('cylinder', [0.55, 1.15, 0.1], [0.05, 0.95, 0.05], '#4a3a2b', { rot: [0.2, 0, -0.2] }));
      m.parts.push(P('sphere', [0.62, 1.75, 0.12], [0.15, 0.15, 0.15], '#c26bf2', { emissive: '#8a2be2' }));
      return m;
    })()
  }),
  card({
    id: 'night_witch', name: 'Ночная ведьма', rarity: 'epic', type: 'troop', cost: 4,
    desc: 'Призывает стаю летучих мышей.',
    hp: 720, damage: 185, hitSpeed: 1.6, range: 2.2, speed: 1.0, targets: 'ground',
    abilities: [{ type: 'spawnTroops', cardId: 'bats', interval: 4.0, max: 2 }],
    model: (() => {
      const m = humanoid('#2c2c4a', '#8a7ab8', { helmet: '#1c1c34', plume: '#6d5bb5' });
      m.parts.push(P('cone', [0, 1.9, 0], [0.45, 0.65, 0.45], '#1c1c34'));
      m.parts.push(P('box', [-0.55, 1.25, -0.1], [0.5, 0.05, 0.38], '#322a4d', { rot: [0.1, 0.4, 0.5] }));
      m.parts.push(P('box', [0.55, 1.25, -0.1], [0.5, 0.05, 0.38], '#322a4d', { rot: [0.1, -0.4, -0.5] }));
      return m;
    })()
  }),
  card({
    id: 'champion', name: 'Чемпион', rarity: 'epic', type: 'troop', cost: 5,
    desc: 'Рыцарь с копьём. Разгоняется и наносит сокрушительный удар.',
    hp: 1750, damage: 290, hitSpeed: 1.4, range: 1.2, speed: 1.35, targets: 'ground',
    abilities: [{ type: 'charge', multiplier: 2.2, windup: 2.2 }],
    model: (() => {
      const m = humanoid('#3b4a8a', '#e8b88a', { helmet: '#e8c860', plume: '#c23b3b', shield: '#2c3a7a' });
      m.parts.push(P('cylinder', [0.55, 1.25, 0.2], [0.05, 1.35, 0.05], '#8a5a2b', { rot: [1.35, 0, -0.1] }));
      m.parts.push(P('cone', [0.62, 1.75, 1.2], [0.1, 0.3, 0.1], '#c8ccd8', { rot: [1.35, 0, -0.1] }));
      return m;
    })()
  }),
  card({
    id: 'golem', name: 'Голем', rarity: 'epic', type: 'troop', cost: 8,
    desc: 'Каменный исполин, идущий к зданиям. После гибели распадается на големышей.',
    hp: 5200, damage: 155, hitSpeed: 1.8, range: 1.3, speed: 0.65, targets: 'ground', buildingOnly: true,
    abilities: [{ type: 'spawnOnDeath', cardId: 'golemites', count: 2 }, { type: 'deathDamage', damage: 320, radius: 2.2 }],
    model: golem('#8b8fa3', '#5b5f73', '#66e0ff')
  }),
  card({
    id: 'steel_golem', name: 'Стальной голем', rarity: 'epic', type: 'troop', cost: 7,
    desc: 'Железная машина смерти. Один удар — целая толпа.',
    hp: 3600, damage: 215, hitSpeed: 1.8, range: 1.1, speed: 0.75, targets: 'ground',
    model: golem('#5b6d8a', '#3b4a5c', '#ff7a3c')
  }),
  card({
    id: 'bruiser', name: 'Громила', rarity: 'epic', type: 'troop', cost: 7,
    desc: 'Прыгает на врагов и оглушает их ударом с размаху.',
    hp: 3300, damage: 230, hitSpeed: 1.7, range: 1.4, speed: 0.95, targets: 'ground', splash: 1.9,
    abilities: [{ type: 'knockback', force: 2.2 }],
    model: (() => {
      const m = humanoid('#6b3a6b', '#b87ab8', { helmet: '#4a2b4a', plume: '#e85d5d', legs: '#3b2b3b' });
      m.parts[2] = P('box', [0, 1.0, 0], [1.05, 1.0, 0.65], '#6b3a6b');
      m.parts[3] = P('sphere', [0, 1.85, 0], [0.45, 0.45, 0.45], '#b87ab8');
      m.parts.push(P('box', [-0.75, 1.15, 0], [0.35, 0.85, 0.42], '#4a2b4a'));
      m.parts.push(P('box', [0.75, 1.15, 0], [0.35, 0.85, 0.42], '#4a2b4a'));
      return m;
    })()
  }),
  card({
    id: 'storm_mage', name: 'Волхв молний', rarity: 'epic', type: 'troop', cost: 5,
    desc: 'Разряды цепляются от цели к цели и оглушают их.',
    hp: 680, damage: 195, hitSpeed: 1.5, range: 5.0, speed: 1.0, targets: 'both',
    abilities: [{ type: 'chain', bounces: 3, damage: 0.75 }, { type: 'stunHit', duration: 0.5 }],
    model: (() => {
      const m = humanoid('#3c6b8a', '#c8e8ff', { helmet: '#2b4d6c', plume: '#ffe066' });
      m.parts.push(P('cone', [0, 1.9, 0], [0.42, 0.68, 0.42], '#2b4d6c'));
      m.parts.push(P('cylinder', [0.55, 1.15, 0.1], [0.05, 0.95, 0.05], '#b8c4d8', { rot: [0.2, 0, -0.2] }));
      m.parts.push(P('sphere', [0.62, 1.78, 0.12], [0.15, 0.15, 0.15], '#ffe066', { emissive: '#c2a03c' }));
      return m;
    })()
  }),
  card({
    id: 'ice_golem', name: 'Ледяной голем', rarity: 'epic', type: 'troop', cost: 2,
    desc: 'Дешёвый ледяной танк. При гибели замедляет врагов вокруг.',
    hp: 1300, damage: 80, hitSpeed: 1.8, range: 1.0, speed: 0.85, targets: 'ground', buildingOnly: true,
    abilities: [{ type: 'freezeHit', duration: 1.5, onDeath: true }],
    model: spirit('#9adcff', '#c8ecff')
  }),
  card({
    id: 'guardian', name: 'Хранитель', rarity: 'epic', type: 'troop', cost: 5,
    desc: 'Священный воин, постоянно исцеляющий союзников рядом.',
    hp: 2300, damage: 215, hitSpeed: 1.3, range: 1.0, speed: 1.0, targets: 'ground',
    abilities: [{ type: 'healAura', hps: 140, radius: 3.4 }],
    model: humanoid('#e8d8a0', '#f0c8a0', { helmet: '#e8c860', plume: '#7dff9e', weapon: '#e8c860', shield: '#c2a03c' })
  }),
  card({
    id: 'shadow_assassin', name: 'Теневой убийца', rarity: 'epic', type: 'troop', cost: 3,
    desc: 'Невидимый в тени, очень быстрый, бьёт в спину.',
    hp: 720, damage: 215, hitSpeed: 0.9, range: 0.8, speed: 1.9, targets: 'ground',
    model: humanoid('#2c2c38', '#5b5b6b', { helmet: '#14141c', weapon: '#8a5aff', legs: '#1c1c28' })
  }),
  card({
    id: 'bow_master', name: 'Мастер лука', rarity: 'epic', type: 'troop', cost: 4,
    desc: 'Бьёт с огромной дистанции. Незаменим в обороне.',
    hp: 540, damage: 240, hitSpeed: 1.7, range: 7.2, speed: 1.0, targets: 'both',
    model: (() => {
      const m = humanoid('#2e5b4a', '#e8b88a', { helmet: '#1c3b2e', plume: '#7dff9e' });
      m.parts.push(...bowArm('#6b8a3b'));
      return m;
    })()
  }),
  card({
    id: 'magma_beast', name: 'Магмовый зверь', rarity: 'epic', type: 'troop', cost: 6,
    desc: 'Летающий лавовый монстр. Идёт к зданиям и распадается на искры.',
    hp: 2800, damage: 170, hitSpeed: 1.6, range: 2.2, speed: 0.85, targets: 'both', flying: true, buildingOnly: true,
    abilities: [{ type: 'spawnOnDeath', cardId: 'magmalings', count: 3 }],
    model: dragon('#c2532b', '#ffb03c', '#8a3b2b')
  }),
  card({
    id: 'battle_healer', name: 'Боевая целительница', rarity: 'epic', type: 'troop', cost: 4,
    desc: 'Лечит союзников и восстанавливает здоровье от каждого удара.',
    hp: 980, damage: 150, hitSpeed: 1.1, range: 1.0, speed: 1.15, targets: 'ground',
    abilities: [{ type: 'lifesteal', percent: 1.0 }, { type: 'healAura', hps: 90, radius: 2.8 }],
    model: humanoid('#7dd8c2', '#f0c8a0', { helmet: '#4aa890', plume: '#c8fff0', weapon: '#e8c860' })
  }),

  // — легендарные войска —
  card({
    id: 'ghost_knight', name: 'Призрачный рыцарь', rarity: 'legendary', type: 'troop', cost: 3,
    desc: 'Невидим, пока не ударит. Атакует врагов вокруг.',
    hp: 1150, damage: 265, hitSpeed: 1.3, range: 1.0, speed: 1.5, targets: 'ground', splash: 1.5,
    model: (() => {
      const m = humanoid('#4a5a8a', '#8a9ad8', { helmet: '#2c3a6b', weapon: '#9adcff', plume: '#9adcff' });
      m.parts.push(P('torus', [0, 1.05, 0], [0.75, 0.75, 0.75], '#9adcff', { emissive: '#4a7ac8', rot: [1.57, 0, 0] }));
      return m;
    })()
  }),
  card({
    id: 'storm_lord', name: 'Повелитель бурь', rarity: 'legendary', type: 'troop', cost: 6,
    desc: 'Молнии прыгают между врагами, оглушая их.',
    hp: 1450, damage: 260, hitSpeed: 1.5, range: 5.4, speed: 1.0, targets: 'both',
    abilities: [{ type: 'chain', bounces: 4, damage: 0.8 }, { type: 'stunHit', duration: 0.45 }],
    model: (() => {
      const m = humanoid('#3c4a8a', '#c8d8ff', { helmet: '#2b3260', plume: '#ffe066' });
      m.parts.push(P('cone', [0, 2.0, 0], [0.5, 0.85, 0.5], '#2b3260'));
      m.parts.push(P('cylinder', [-0.6, 1.25, 0.1], [0.06, 1.15, 0.06], '#b8c4e8', { rot: [0.15, 0, 0.15] }));
      m.parts.push(P('sphere', [-0.68, 2.05, 0.12], [0.18, 0.18, 0.18], '#ffe066', { emissive: '#c2a03c' }));
      return m;
    })()
  }),
  card({
    id: 'ice_queen', name: 'Ледяная королева', rarity: 'legendary', type: 'troop', cost: 5,
    desc: 'Замедляет всех врагов вокруг себя.',
    hp: 1250, damage: 215, hitSpeed: 1.4, range: 4.8, speed: 1.1, targets: 'both', splash: 1.6,
    abilities: [{ type: 'slowHit', factor: 0.5, duration: 2.5 }],
    model: (() => {
      const m = humanoid('#6bc8ff', '#e8f8ff', { helmet: '#4a9adc', plume: '#ffffff' });
      m.parts.push(P('cone', [0, 1.95, 0], [0.48, 0.75, 0.48], '#4a9adc'));
      m.parts.push(P('sphere', [0, 2.45, 0], [0.12, 0.12, 0.12], '#ffffff', { emissive: '#9adcff' }));
      m.parts.push(P('cylinder', [0.55, 1.2, 0.1], [0.05, 1.0, 0.05], '#c8ecff', { rot: [0.2, 0, -0.2] }));
      return m;
    })()
  }),
  card({
    id: 'fire_lord', name: 'Огненный лорд', rarity: 'legendary', type: 'troop', cost: 6,
    desc: 'Повелитель пламени. После гибели призывает огненных духов.',
    hp: 1650, damage: 295, hitSpeed: 1.6, range: 4.2, speed: 1.0, targets: 'both', splash: 1.9,
    abilities: [{ type: 'spawnOnDeath', cardId: 'fire_spirit', count: 3 }],
    model: (() => {
      const m = humanoid('#c2532b', '#ffb03c', { helmet: '#8a3b2b', plume: '#ff8b3c' });
      m.parts.push(P('cone', [0, 2.0, 0], [0.55, 0.85, 0.55], '#8a3b2b'));
      m.parts.push(P('torus', [0, 1.15, 0], [0.85, 0.85, 0.85], '#ff8b3c', { emissive: '#c2532b', rot: [1.57, 0, 0] }));
      m.parts.push(P('sphere', [0, 2.6, 0], [0.18, 0.18, 0.18], '#ffd08a', { emissive: '#ff8b3c' }));
      return m;
    })()
  }),
  card({
    id: 'phoenix', name: 'Феникс', rarity: 'legendary', type: 'troop', cost: 5,
    desc: 'Летающий огненный птиц. Возрождается после гибели.',
    hp: 1350, damage: 230, hitSpeed: 1.3, range: 1.8, speed: 1.25, targets: 'both', flying: true, splash: 1.2,
    abilities: [{ type: 'spawnOnDeath', cardId: 'phoenix_egg', count: 1 }],
    model: dragon('#e87a2b', '#ffd08a', '#c2532b')
  }),
  card({
    id: 'forest_keeper', name: 'Хранитель леса', rarity: 'legendary', type: 'troop', cost: 5,
    desc: 'Древний маг: лечит союзников и бьёт врагов лозами.',
    hp: 1350, damage: 205, hitSpeed: 1.5, range: 5.0, speed: 1.0, targets: 'both',
    abilities: [{ type: 'healAura', hps: 170, radius: 3.6 }],
    model: (() => {
      const m = humanoid('#2e6b3a', '#a8d88a', { helmet: '#1c4a2b', plume: '#7dff9e' });
      m.parts.push(P('cone', [0, 2.0, 0], [0.55, 0.8, 0.55], '#1c4a2b'));
      m.parts.push(P('cylinder', [0.6, 1.25, 0.1], [0.06, 1.2, 0.06], '#6b4a2b', { rot: [0.15, 0, -0.15] }));
      m.parts.push(P('sphere', [0.68, 2.1, 0.12], [0.2, 0.2, 0.2], '#7dff9e', { emissive: '#2e8b57' }));
      return m;
    })()
  })
];

// ————————————————————————— заклинания —————————————————————————

const SPELLS = [
  card({
    id: 'arrows', name: 'Стрелы', rarity: 'common', type: 'spell', cost: 3,
    desc: 'Град стрел накрывает большую площадь.',
    spell: { radius: 4.0, damage: 215, effect: 'damage', targetsAir: true, targetsGround: true },
    model: {
      parts: [
        P('cone', [-0.4, 1.2, 0.2], [0.12, 0.8, 0.12], '#8a5a2b', { rot: [2.6, 0, 0.3] }),
        P('cone', [0.0, 1.5, 0.0], [0.12, 0.9, 0.12], '#8a5a2b', { rot: [2.8, 0, 0] }),
        P('cone', [0.4, 1.3, -0.2], [0.12, 0.85, 0.12], '#8a5a2b', { rot: [2.7, 0, -0.3] }),
        P('box', [-0.4, 1.75, 0.35], [0.22, 0.06, 0.06], '#c8ccd8', { rot: [2.6, 0, 0.3] }),
        P('box', [0.0, 2.1, 0.0], [0.22, 0.06, 0.06], '#c8ccd8', { rot: [2.8, 0, 0] })
      ]
    }
  }),
  card({
    id: 'zap', name: 'Разряд', rarity: 'common', type: 'spell', cost: 2,
    desc: 'Электрический разряд по площади. Оглушает врагов.',
    spell: { radius: 2.5, damage: 155, effect: 'stun', duration: 0.5, targetsAir: true, targetsGround: true },
    model: {
      parts: [
        P('cone', [0, 1.8, 0], [0.35, 1.3, 0.2], '#ffe066', { emissive: '#c2a03c', rot: [3.14, 0, 0.25] }),
        P('cone', [0.15, 0.9, 0], [0.28, 1.0, 0.16], '#fff2b0', { emissive: '#ffe066', rot: [3.14, 0, -0.35] }),
        P('sphere', [0, 1.3, 0], [0.14, 0.14, 0.14], '#ffffff', { emissive: '#ffe066' })
      ]
    }
  }),
  card({
    id: 'fireball', name: 'Огненный шар', rarity: 'rare', type: 'spell', cost: 4,
    desc: 'Мощный взрыв в выбранной области.',
    spell: { radius: 2.8, damage: 465, effect: 'damage', targetsAir: true, targetsGround: true },
    model: {
      parts: [
        P('sphere', [0, 1.2, 0], [0.65, 0.65, 0.65], '#ff8b3c', { emissive: '#c2532b' }),
        P('sphere', [-0.25, 1.55, 0.15], [0.22, 0.22, 0.22], '#ffd08a', { emissive: '#ff8b3c' }),
        P('cone', [0.35, 0.75, -0.3], [0.2, 0.55, 0.2], '#c2532b', { emissive: '#8a3b2b', rot: [0.7, 0, -0.6] }),
        P('torus', [0, 1.2, 0], [0.85, 0.85, 0.85], '#ffb03c', { emissive: '#c2532b', rot: [1.2, 0, 0] })
      ]
    }
  }),
  card({
    id: 'rocket', name: 'Ракета', rarity: 'rare', type: 'spell', cost: 6,
    desc: 'Огромный урон по небольшой области. Для крупных целей.',
    spell: { radius: 2.2, damage: 820, effect: 'damage', targetsAir: true, targetsGround: true },
    model: {
      parts: [
        P('cylinder', [0, 1.3, 0], [0.3, 1.1, 0.3], '#8a8fa3', { rot: [0.35, 0, 0] }),
        P('cone', [0.28, 2.05, 0], [0.3, 0.55, 0.3], '#c23b3b', { rot: [0.35, 0, 0] }),
        P('box', [-0.3, 0.65, 0], [0.08, 0.45, 0.35], '#5b5f73', { rot: [0.35, 0, 0.5] }),
        P('box', [-0.3, 0.65, 0], [0.08, 0.45, 0.35], '#5b5f73', { rot: [0.35, 0, -0.5] }),
        P('sphere', [-0.45, 0.35, 0], [0.18, 0.18, 0.18], '#ff8b3c', { emissive: '#c2532b' })
      ]
    }
  }),
  card({
    id: 'freeze', name: 'Заморозка', rarity: 'epic', type: 'spell', cost: 4,
    desc: 'Замораживает все вражеские отряды и постройки в области.',
    spell: { radius: 3.5, damage: 0, effect: 'freeze', duration: 4.0, targetsAir: true, targetsGround: true },
    model: {
      parts: [
        P('torus', [0, 0.9, 0], [1.1, 1.1, 1.1], '#9adcff', { emissive: '#6bc8ff', rot: [1.57, 0, 0] }),
        P('cone', [-0.5, 1.5, 0], [0.22, 0.85, 0.22], '#c8ecff', { emissive: '#9adcff' }),
        P('cone', [0.5, 1.5, 0], [0.22, 0.85, 0.22], '#c8ecff', { emissive: '#9adcff' }),
        P('cone', [0, 1.75, -0.45], [0.22, 0.85, 0.22], '#c8ecff', { emissive: '#9adcff' }),
        P('sphere', [0, 1.15, 0], [0.3, 0.3, 0.3], '#e8f8ff', { emissive: '#9adcff' })
      ]
    }
  }),
  card({
    id: 'rage', name: 'Ярость', rarity: 'epic', type: 'spell', cost: 2,
    desc: 'Союзники в области ускоряются и бьют быстрее.',
    spell: { radius: 3.5, damage: 0, effect: 'rage', duration: 8.0, targetsAir: true, targetsGround: true },
    model: {
      parts: [
        P('torus', [0, 0.85, 0], [1.05, 1.05, 1.05], '#c26bf2', { emissive: '#8a2be2', rot: [1.57, 0, 0] }),
        P('cone', [0, 1.6, 0], [0.55, 1.1, 0.55], '#8a2be2', { emissive: '#c26bf2' }),
        P('sphere', [0, 2.25, 0], [0.22, 0.22, 0.22], '#e8c8ff', { emissive: '#c26bf2' })
      ]
    }
  }),
  card({
    id: 'heal', name: 'Лечение', rarity: 'rare', type: 'spell', cost: 3,
    desc: 'Восстанавливает здоровье союзникам в области.',
    spell: { radius: 3.5, heal: 620, effect: 'heal', duration: 2.5, targetsAir: true, targetsGround: true },
    model: {
      parts: [
        P('torus', [0, 0.85, 0], [1.05, 1.05, 1.05], '#7dff9e', { emissive: '#2e8b57', rot: [1.57, 0, 0] }),
        P('box', [0, 1.35, 0], [0.3, 1.05, 0.3], '#c8ffd8', { emissive: '#7dff9e' }),
        P('box', [0, 1.35, 0], [1.05, 0.3, 0.3], '#c8ffd8', { emissive: '#7dff9e' }),
        P('sphere', [0, 1.35, 0], [0.25, 0.25, 0.25], '#ffffff', { emissive: '#7dff9e' })
      ]
    }
  }),
  card({
    id: 'poison', name: 'Ядовитое облако', rarity: 'epic', type: 'spell', cost: 4,
    desc: 'Враги в области получают урон каждую секунду.',
    spell: { radius: 3.8, damage: 75, effect: 'poison', duration: 8.0, targetsAir: true, targetsGround: true },
    model: {
      parts: [
        P('sphere', [0, 0.75, 0], [1.1, 0.55, 1.1], '#7dbb5a', { emissive: '#4a8a2b' }),
        P('sphere', [-0.55, 1.15, 0.2], [0.5, 0.4, 0.5], '#8fcc6a', { emissive: '#5ba83b' }),
        P('sphere', [0.55, 1.05, -0.25], [0.55, 0.45, 0.55], '#a8e87a', { emissive: '#6bc84a' }),
        P('sphere', [0, 1.55, 0], [0.35, 0.3, 0.35], '#c8ff9e', { emissive: '#8fcc6a' })
      ]
    }
  }),
  card({
    id: 'lightning', name: 'Молния', rarity: 'epic', type: 'spell', cost: 6,
    desc: 'Три мощнейших удара молнии по самым живучим целям.',
    spell: { radius: 3.5, damage: 585, effect: 'stun', duration: 0.5, targetsAir: true, targetsGround: true, maxTargets: 3 },
    model: {
      parts: [
        P('cone', [-0.45, 1.7, 0], [0.3, 1.25, 0.18], '#ffe066', { emissive: '#c2a03c', rot: [3.14, 0, 0.35] }),
        P('cone', [0.45, 1.65, 0.1], [0.3, 1.3, 0.18], '#fff2b0', { emissive: '#ffe066', rot: [3.14, 0, -0.35] }),
        P('cone', [0, 1.9, -0.3], [0.32, 1.35, 0.2], '#ffe066', { emissive: '#c2a03c', rot: [3.14, 0, 0.05] }),
        P('sphere', [0, 0.85, 0], [0.3, 0.18, 0.3], '#ffffff', { emissive: '#ffe066' })
      ]
    }
  }),
  card({
    id: 'tornado', name: 'Смерч', rarity: 'legendary', type: 'spell', cost: 3,
    desc: 'Стягивает и отбрасывает врагов к центру.',
    spell: { radius: 3.8, damage: 95, effect: 'knockback', duration: 1.0, targetsAir: true, targetsGround: true },
    model: {
      parts: [
        P('torus', [0, 0.55, 0], [1.15, 1.15, 1.15], '#9adcff', { emissive: '#6bc8ff', rot: [1.57, 0, 0] }),
        P('torus', [0, 1.05, 0], [0.85, 0.85, 0.85], '#c8ecff', { emissive: '#9adcff', rot: [1.57, 0, 0.4] }),
        P('torus', [0, 1.5, 0], [0.55, 0.55, 0.55], '#e8f8ff', { emissive: '#c8ecff', rot: [1.57, 0, 0.8] }),
        P('cone', [0, 2.15, 0], [0.28, 0.75, 0.28], '#ffffff', { emissive: '#c8ecff' })
      ]
    }
  })
];

// ————————————————————————— здания —————————————————————————

const BUILDINGS = [
  card({
    id: 'cannon', name: 'Пушка', rarity: 'common', type: 'building', cost: 3,
    desc: 'Дешёвая оборонительная пушка. Бьёт только по земле.',
    hp: 850, damage: 130, hitSpeed: 0.85, range: 5.5, speed: 0, targets: 'ground',
    building: { lifetime: 30 },
    model: building('#6b5c44', '#b09a76', '#5b5f73', '#e8c860')
  }),
  card({
    id: 'tesla', name: 'Тесла', rarity: 'common', type: 'building', cost: 4,
    desc: 'Электрическая башня, бьющая и по земле, и по воздуху.',
    hp: 950, damage: 155, hitSpeed: 1.0, range: 6.0, speed: 0, targets: 'both',
    building: { lifetime: 30 },
    model: turret('#9aa3b5', '#3b5bb5', '#66e0ff')
  }),
  card({
    id: 'watchtower', name: 'Сторожевая башня', rarity: 'common', type: 'building', cost: 3,
    desc: 'Башня лучников для долгой обороны.',
    hp: 1000, damage: 115, hitSpeed: 0.9, range: 6.2, speed: 0, targets: 'both',
    building: { lifetime: 35 },
    model: turret('#a89a76', '#8a5a2b', '#e8c860')
  }),
  card({
    id: 'mortar', name: 'Мортира', rarity: 'rare', type: 'building', cost: 4,
    desc: 'Бьёт с огромного расстояния по площади. Только по земле.',
    hp: 1000, damage: 260, hitSpeed: 3.2, range: 9.5, speed: 0, targets: 'ground', splash: 2.0,
    building: { lifetime: 30 },
    model: building('#5b5f73', '#8b8fa3', '#3b3b44', '#ff8b3c')
  }),
  card({
    id: 'tombstone', name: 'Могила', rarity: 'rare', type: 'building', cost: 3,
    desc: 'Постоянно поднимает скелетов. После разрушения — ещё трое.',
    hp: 780, damage: 0, hitSpeed: 1, range: 0, speed: 0, targets: 'ground',
    building: { lifetime: 30 },
    abilities: [{ type: 'spawnTroops', cardId: 'skeletons', interval: 3.5, max: 1 }, { type: 'spawnOnDeath', cardId: 'skeletons', count: 3 }],
    model: building('#4a4a55', '#6b6b75', '#3b3b44', '#8a8a9c')
  }),
  card({
    id: 'barracks', name: 'Казармы', rarity: 'rare', type: 'building', cost: 5,
    desc: 'Готовит мечников, которые атакуют ближайшего врага.',
    hp: 1250, damage: 0, hitSpeed: 1, range: 0, speed: 0, targets: 'ground',
    building: { lifetime: 40 },
    abilities: [{ type: 'spawnTroops', cardId: 'swordsmen', interval: 6.0, max: 2 }],
    model: building('#8a5a2b', '#c8a860', '#8a3b2b', '#e8c860')
  }),
  card({
    id: 'goblin_hut', name: 'Хижина гоблинов', rarity: 'rare', type: 'building', cost: 4,
    desc: 'Выпускает копейщиков через равные промежутки времени.',
    hp: 1050, damage: 0, hitSpeed: 1, range: 0, speed: 0, targets: 'ground',
    building: { lifetime: 40 },
    abilities: [{ type: 'spawnTroops', cardId: 'spear_goblins', interval: 6.5, max: 2 }],
    model: building('#4a7d3a', '#8fcc6a', '#6b422b', '#c2e86a')
  }),
  card({
    id: 'dragon_lair', name: 'Логово дракона', rarity: 'epic', type: 'building', cost: 5,
    desc: 'Из логова вылетают детёныши дракона.',
    hp: 1350, damage: 0, hitSpeed: 1, range: 0, speed: 0, targets: 'ground',
    building: { lifetime: 40 },
    abilities: [{ type: 'spawnTroops', cardId: 'dragonet', interval: 8.0, max: 2 }],
    model: building('#8a3b2b', '#c2532b', '#4a2b1c', '#ff8b3c')
  }),
  card({
    id: 'altar', name: 'Алтарь жизни', rarity: 'rare', type: 'building', cost: 4,
    desc: 'Исцеляет всех союзников вокруг.',
    hp: 950, damage: 0, hitSpeed: 1, range: 0, speed: 0, targets: 'ground',
    building: { lifetime: 30 },
    abilities: [{ type: 'healAura', hps: 130, radius: 4.2 }],
    model: building('#e8d8a0', '#fff2c8', '#7dd8c2', '#7dff9e')
  }),
  card({
    id: 'obelisk', name: 'Обелиск', rarity: 'epic', type: 'building', cost: 6,
    desc: 'Магический обелиск с лучом смерти. Очень высокий урон.',
    hp: 1450, damage: 145, hitSpeed: 0.55, range: 7.0, speed: 0, targets: 'both',
    building: { lifetime: 35 },
    model: turret('#2c2c4a', '#6d5bb5', '#c26bf2')
  })
];

// ————————————————————————— служебные карты (призыв) —————————————————————————

const HIDDEN = [
  card({
    id: 'golemites', name: 'Големыши', rarity: 'epic', type: 'troop', cost: 2, hidden: true, count: 1,
    hp: 1350, damage: 145, hitSpeed: 1.3, range: 1.0, speed: 0.95, targets: 'ground',
    abilities: [{ type: 'deathDamage', damage: 160, radius: 1.5 }],
    model: golem('#a8a8b8', '#7b7b8c', '#66e0ff')
  }),
  card({
    id: 'magmalings', name: 'Магмовые искры', rarity: 'epic', type: 'troop', cost: 1, hidden: true, count: 1,
    hp: 240, damage: 85, hitSpeed: 1.1, range: 1.0, speed: 1.35, targets: 'both', flying: true,
    model: spirit('#ff8b3c', '#ffd08a')
  }),
  card({
    id: 'dragonet', name: 'Детёныш дракона', rarity: 'epic', type: 'troop', cost: 2, hidden: true, count: 1,
    hp: 520, damage: 125, hitSpeed: 1.3, range: 2.4, speed: 1.35, targets: 'both', flying: true, splash: 1.1,
    model: dragon('#3f8f4f', '#cfe8a8', '#2e6b3a')
  }),
  card({
    id: 'swordsmen', name: 'Мечник', rarity: 'rare', type: 'troop', cost: 2, hidden: true, count: 1,
    hp: 560, damage: 145, hitSpeed: 1.1, range: 0.8, speed: 1.15, targets: 'ground',
    model: humanoid('#8a5a2b', '#e8b88a', { helmet: '#c8b89a', weapon: '#c8ccd8' })
  }),
  card({
    id: 'phoenix_egg', name: 'Яйцо феникса', rarity: 'legendary', type: 'troop', cost: 5, hidden: true, count: 1,
    desc: 'Через мгновение из яйца восстанет новый феникс.',
    hp: 900, damage: 0, hitSpeed: 1, range: 0, speed: 0, targets: 'ground',
    abilities: [{ type: 'spawnOnDeath', cardId: 'phoenix_reborn', count: 1 }],
    model: {
      parts: [
        P('sphere', [0, 0.75, 0], [0.75, 0.95, 0.75], '#e8c860', { emissive: '#c2a03c' }),
        P('torus', [0, 0.75, 0], [0.95, 0.95, 0.95], '#ff8b3c', { emissive: '#c2532b', rot: [1.57, 0, 0] }),
        P('sphere', [0, 1.45, 0], [0.25, 0.25, 0.25], '#ffd08a', { emissive: '#ff8b3c' })
      ]
    }
  }),
  card({
    id: 'phoenix_reborn', name: 'Возрождённый феникс', rarity: 'legendary', type: 'troop', cost: 5, hidden: true, count: 1,
    hp: 950, damage: 230, hitSpeed: 1.3, range: 1.8, speed: 1.25, targets: 'both', flying: true, splash: 1.2,
    model: dragon('#ff8b3c', '#ffd08a', '#e87a2b')
  })
];

export const ALL_CARDS = [...TROOPS, ...SPELLS, ...BUILDINGS, ...HIDDEN];
export const RARITY = R;

const byId = new Map(ALL_CARDS.map((c) => [c.id, c]));
export function getCard(id) {
  return byId.get(id) || null;
}

// Собирает полный список карт (база + пользовательские) для игры и UI.
export function withCustom(customCards) {
  const map = new Map(ALL_CARDS.map((c) => [c.id, c]));
  for (const c of customCards) map.set(c.id, c);
  return [...map.values()];
}

export const COLLECTION_IDS = ALL_CARDS.filter((c) => !c.hidden).map((c) => c.id);
