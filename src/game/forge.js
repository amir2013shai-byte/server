// Кузница: эволюция карт звёздами (0–3). Каждая звезда даёт +5% к HP и урону,
// 3 звезды — «мифическая» редкость (золотое свечение).

export const EVO_MAX = 3;

// стоимость перехода stars → stars+1
export function evoCost(stars) {
  return [
    { gold: 200, copies: 10 },
    { gold: 500, copies: 25 },
    { gold: 1200, copies: 60 }
  ][Math.max(0, Math.min(EVO_MAX - 1, stars))];
}

export function evoMultiplier(stars) {
  return 1 + 0.05 * Math.max(0, Math.min(EVO_MAX, stars));
}

// карта с учётом эволюции (копия, исходник не трогаем)
export function applyEvo(card, stars) {
  const mult = evoMultiplier(stars);
  if (!stars) return card;
  return {
    ...card,
    hp: card.hp ? Math.round(card.hp * mult) : card.hp,
    damage: card.damage ? Math.round(card.damage * mult) : card.damage,
    evo: stars
  };
}

export function isMythic(stars) {
  return stars >= EVO_MAX;
}

export function evoLabel(stars) {
  return ['Без эволюции', '⭐ Эволюция I', '⭐⭐ Эволюция II', '⭐⭐⭐ Мифическая'][Math.max(0, Math.min(EVO_MAX, stars))];
}
