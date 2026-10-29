// Достижения: условия проверяются по сводке прогресса (stats).
// check(stats) → true, когда условие выполнено.

export const ACHIEVEMENTS = [
  { id: 'first_win', icon: '🎉', title: 'Первая победа', desc: 'Выиграй первый бой', gold: 50,
    check: (s) => s.wins >= 1 },
  { id: 'wins_10', icon: '⚔️', title: 'Ветеран', desc: '10 побед в боях', gold: 100,
    check: (s) => s.wins >= 10 },
  { id: 'wins_50', icon: '🗡', title: 'Легенда арены', desc: '50 побед в боях', gold: 250,
    check: (s) => s.wins >= 50 },
  { id: 'arena_3', icon: '❄️', title: 'Ледяной воин', desc: 'Достигни арены «Ледяная гавань»', gold: 150,
    check: (s) => s.arenaIdx >= 2 },
  { id: 'arena_6', icon: '👑', title: 'Королевский гость', desc: 'Достигни арены «Королевский трон»', gold: 400,
    check: (s) => s.arenaIdx >= 5 },
  { id: 'campaign_5', icon: '📖', title: 'Первая глава', desc: 'Пройди 5 миссий кампании', gold: 120,
    check: (s) => s.campaignDone >= 5 },
  { id: 'campaign_20', icon: '🏁', title: 'Покоритель похода', desc: 'Пройди всю кампанию (20 миссий)', gold: 500,
    check: (s) => s.campaignDone >= 20 },
  { id: 'boss_1', icon: '👹', title: 'Убийца боссов', desc: 'Победи первого босса', gold: 150,
    check: (s) => s.bossKills >= 1 },
  { id: 'boss_6', icon: '🐲', title: 'Охотник на боссов', desc: 'Победи всех 6 боссов', gold: 400,
    check: (s) => s.bossKills >= 6 },
  { id: 'cup_win', icon: '🏆', title: 'Чемпион турнира', desc: 'Выиграй турнирную лигу', gold: 300,
    check: (s) => s.tournamentWins >= 1 },
  { id: 'coop_5', icon: '🤝', title: 'Надёжный союзник', desc: '5 побед в режиме 2×2', gold: 150,
    check: (s) => s.coopWins >= 5 },
  { id: 'clan_war', icon: '⚔️', title: 'Клановый воин', desc: 'Победи в клановом бою', gold: 150,
    check: (s) => s.clanWarWins >= 1 },
  { id: 'forge_1', icon: '🔥', title: 'Кузнец', desc: 'Эволюционируй первую карту', gold: 100,
    check: (s) => s.forges >= 1 },
  { id: 'mythic_1', icon: '✨', title: 'Мифический герой', desc: 'Доведи карту до 3 звёзд эволюции', gold: 300,
    check: (s) => s.mythics >= 1 },
  { id: 'level_10', icon: '⭐', title: 'Опытный игрок', desc: 'Достигни 10 уровня игрока', gold: 250,
    check: (s) => s.level >= 10 },
  { id: 'pass_10', icon: '🎖', title: 'Коллекционер наград', desc: 'Достигни 10 уровня бой-пропуска', gold: 200,
    check: (s) => s.passTier >= 10 }
];

// сводка прогресса для проверки условий
export function statsFrom(progress, extra = {}) {
  const p = progress || {};
  return {
    wins: p.wins || 0,
    arenaIdx: extra.arenaIdx || 0,
    campaignDone: Object.keys(p.campaignDone || {}).length,
    bossKills: p.bossKills || 0,
    tournamentWins: p.cupWins || 0,
    coopWins: p.coopWins || 0,
    clanWarWins: p.clanWarWins || 0,
    forges: p.forges || 0,
    mythics: p.mythics || 0,
    level: p.level || 1,
    passTier: extra.passTier || 0
  };
}
