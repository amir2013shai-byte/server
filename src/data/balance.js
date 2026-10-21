// Система «баланса» карты: бюджет — число, из которого вычитается стоимость
// каждого добавленного параметра (HP, урон/сек, механики, абилки...).
// Остаток < 0 → карта «дисбалансная»: она играется только в дружеском бою.
// Коэффициенты может менять админ (аккаунт admin).

export const DEFAULT_BALANCE = {
  base: 520,          // базовый бюджет карты
  perElixir: 330,     // + за каждый эликсир стоимости
  hp: 0.36,           // цена 1 HP
  dps: 3.9,           // цена 1 урона/сек (damage / hitSpeed)
  range: 39,          // цена 1 ед. дальности
  speed: 110,         // цена 1 ед. скорости передвижения
  splash: 110,        // цена 1 ед. радиуса атаки (сплэш)
  flying: 128,        // надбавка за полёт
  countExtra: 110,    // за каждого юнита сверх первого
  targetsAir: 94,     // умение бить по воздуху
  lifetime: 6,        // здание: цена 1 секунды жизни
  spellRadius: 53,    // заклинание: цена 1 ед. радиуса
  spellPower: 0.89,   // заклинание: цена урона/лечения
  spellEffect: {      // заклинание: надбавка за эффект
    damage: 0, heal: 51, freeze: 110, stun: 102, rage: 94, poison: 85, knockback: 51
  },
  ability: {          // цена механик (абилок)
    shield: 102, freezeHit: 128, slowHit: 77, stunHit: 110, chain: 136,
    lifesteal: 102, knockback: 60, charge: 128, spawnOnDeath: 119,
    deathDamage: 85, healAura: 145, spawnTroops: 153, rageOnDeploy: 110
  }
};

const num = (v, d = 0) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

// бюджет = base + perElixir × стоимость
export function cardBudget(card, P = DEFAULT_BALANCE) {
  return num(P.base) + num(P.perElixir) * num(card && card.cost, 0);
}

// сколько «стоит» карта: возвращает разбивку для показа в редакторе
export function cardSpend(card, P = DEFAULT_BALANCE) {
  const parts = [];
  const add = (label, v) => { if (v > 0) parts.push({ label, value: Math.round(v) }); };
  if (!card) return { total: 0, parts };

  if (card.type === 'spell') {
    const sp = card.spell || {};
    add('Урон/лечение', num(sp.damage) * num(P.spellPower) + num(sp.heal) * num(P.spellPower) * 0.9);
    add('Радиус', num(sp.radius) * num(P.spellRadius));
    const eff = (P.spellEffect || {})[sp.effect];
    add('Эффект', num(eff));
    add('Длит.', num(sp.duration) * 35);
    if (card.count > 1) add('Кол-во', (num(card.count, 1) - 1) * num(P.countExtra));
  } else {
    // войско / здание
    add('HP', num(card.hp) * num(P.hp));
    const hit = Math.max(0.2, num(card.hitSpeed, 1));
    add('DPS', (num(card.damage) / hit) * num(P.dps));
    add('Дальность', num(card.range) * num(P.range));
    add('Скорость', num(card.speed) * num(P.speed));
    if (card.splash > 0) add('Сплэш', num(card.splash) * num(P.splash));
    if (card.flying) add('Полёт', num(P.flying));
    if (card.targets === 'both') add('Бьёт по воздуху', num(P.targetsAir));
    if (card.type === 'troop' && card.count > 1) add('Кол-во юнитов', (num(card.count, 1) - 1) * num(P.countExtra));
    if (card.type === 'building') add('Время жизни', num(card.building && card.building.lifetime) * num(P.lifetime));
    if (card.buildingOnly) add('Только здания', 40);
  }

  for (const ab of card.abilities || []) {
    const base = num((P.ability || {})[ab.type], 100);
    add('Абилка: ' + ab.type, base);
    // масштаб параметров абилки
    if (ab.type === 'shield') add('HP щита', num(ab.hp) * num(P.hp) * 0.7);
    if (ab.type === 'spawnOnDeath' || ab.type === 'spawnTroops') add('Призыв ×' + num(ab.count || ab.max), num(ab.count || ab.max) * 35);
    if (ab.type === 'deathDamage') add('Урон гибели', num(ab.damage) * num(P.spellPower) * 0.8);
    if (ab.type === 'chain') add('Отскоки', num(ab.bounces) * 25);
    if (ab.type === 'healAura') add('Аура HPS', num(ab.hps) * 0.25);
    if (ab.type === 'charge') add('Множ. разгона', (num(ab.multiplier, 1) - 1) * 120);
    if (ab.type === 'rageOnDeploy') add('Ярость', num(ab.duration) * 12);
    if (ab.type === 'freezeHit') add('Заморозка', num(ab.duration) * 30);
    if (ab.type === 'stunHit') add('Стан', num(ab.duration) * 60);
    if (ab.type === 'slowHit') add('Слоу', num(ab.duration) * 18);
    if (ab.type === 'lifesteal') add('Вампиризм', num(ab.percent) * 60);
  }

  const total = parts.reduce((s, p) => s + p.value, 0);
  return { total, parts };
}

export function cardBalance(card, P = DEFAULT_BALANCE) {
  const budget = cardBudget(card, P);
  const { total: spent, parts } = cardSpend(card, P);
  const remaining = Math.round(budget - spent);
  return { budget: Math.round(budget), spent: Math.round(spent), remaining, ok: remaining >= 0, parts };
}

export function isBalanced(card, P = DEFAULT_BALANCE) {
  return cardBalance(card, P).ok;
}

// слияние сохранённых параметров с дефолтами (админ мог менять часть)
export function mergeBalance(saved) {
  const P = JSON.parse(JSON.stringify(DEFAULT_BALANCE));
  if (!saved || typeof saved !== 'object') return P;
  for (const k of Object.keys(P)) {
    if (k === 'spellEffect' || k === 'ability') {
      if (saved[k] && typeof saved[k] === 'object') {
        for (const sk of Object.keys(P[k])) {
          if (Number.isFinite(parseFloat(saved[k][sk]))) P[k][sk] = parseFloat(saved[k][sk]);
        }
      }
    } else if (Number.isFinite(parseFloat(saved[k]))) {
      P[k] = parseFloat(saved[k]);
    }
  }
  return P;
}
