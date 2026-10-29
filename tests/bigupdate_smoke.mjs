// Тесты крупного обновления: кампания, боссы, командиры, кузница, пропуск, достижения.
import { readFileSync } from 'node:fs';
import { ALL_CARDS, getCard } from '../src/data/cards.js';
import { Battle, ARENA } from '../src/game/engine.js';
import { MISSIONS, CHAPTERS, BOSSES, missionById, chapterMissions, isUnlocked } from '../src/data/campaign.js';
import { BossController } from '../src/game/bosses.js';
import { CommanderAI } from '../src/game/commanders.js';
import { PASS_REWARDS, PASS_TIERS, PASS_XP_PER_TIER, PREMIUM_COST, tierForXp, passReward } from '../src/data/pass.js';
import { ACHIEVEMENTS, statsFrom } from '../src/data/achievements.js';
import { EVO_MAX, evoCost, evoMultiplier, applyEvo, isMythic, evoLabel } from '../src/game/forge.js';
import { levelFromXp, xpForLevel, normalizeProgress, chestByType } from '../src/progress.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log('  ✓', name);
  else { console.error('  ✗', name); failed++; }
}

const deckP = ['knight', 'archers', 'goblins', 'zap', 'giant', 'musketeer', 'cannon', 'fireball'];
const deckA = ['barbarians', 'minions', 'valkyrie', 'arrows', 'golem', 'wizard', 'tesla', 'rocket'];
const cardsById = new Map(ALL_CARDS.map((c) => [c.id, c]));

// ——— кампания ———
check('4 главы', CHAPTERS.length === 4);
check('20 миссий', MISSIONS.length === 20);
check('5 миссий в главе', CHAPTERS.every((ch) => chapterMissions(ch.id).length === 5));
check('у миссий есть история, враг и награды', MISSIONS.every((m) =>
  m.story && m.enemyName && m.rewards && m.rewards.gold > 0 && m.deck.length === 8 && m.rules));
check('все карты кампании существуют', MISSIONS.every((m) => m.deck.every((id) => getCard(id))));
check('6 боссов, у каждого способности', Object.keys(BOSSES).length === 6 &&
  Object.values(BOSSES).every((b) => b.abilities && b.abilities.length && b.hpBonus > 0));
check('боссовые миссии ссылаются на боссов', MISSIONS.filter((m) => m.boss).length === 4 &&
  MISSIONS.every((m) => !m.boss || BOSSES[m.boss]));
check('миссии разблокируются по цепочке', isUnlocked('m01', {}) && !isUnlocked('m02', {}) &&
  isUnlocked('m02', { m01: 3 }) && isUnlocked('m20', { m19: 1 }));
check('missionById находит миссии', missionById('m05') && missionById('m05').boss === 'spore_lord' && missionById('нет') === null);

// ——— BossController в реальном бою ———
{
  const b = new Battle({ playerDeck: deckP, enemyDeck: deckA, cardsById });
  b.deploy('knight', 0, -4, 'player', { free: true });
  const boss = new BossController(b, 'ai', BOSSES.frost_golem);
  let fired = 0;
  for (let t = 0; t < 60 && !b.finished; t += 0.05) {
    b.update(0.05);
    boss.update(0.05);
  }
  fired = boss.log.length;
  check('босс применяет способности в бою', fired >= 2);
  check('лог босса содержит метеор/призыв', boss.log.some((e) => e.type === 'meteor' || e.type === 'summon'));
}

// ——— CommanderAI (2×2) ———
{
  const b = new Battle({ playerDeck: deckP, enemyDeck: deckA, cardsById });
  const ally = new CommanderAI(b, 'player', deckA, 1);
  const foe2 = new CommanderAI(b, 'ai', deckP, 1);
  let placed = 0;
  const orig = b.deploy.bind(b);
  b.deploy = (...args) => { const r = orig(...args); if (r && args[3] && args[4] && args[4].free) placed++; return r; };
  for (let t = 0; t < 40 && !b.finished; t += 0.05) {
    b.update(0.05);
    ally.update(0.05);
    foe2.update(0.05);
  }
  check('командиры играют и выставляют юнитов', placed >= 2);
  check('командир ведёт свой эликсир 0..10', ally.elixir >= 0 && ally.elixir <= 10);
}

// ——— кузница ———
check('эволюция: множители 1.00/1.05/1.10/1.15', [0, 1, 2, 3].map((s) => evoMultiplier(s)).join(',') === '1,1.05,1.1,1.15');
check('стоимости эволюции растут', evoCost(0).gold === 200 && evoCost(1).copies === 25 && evoCost(2).gold === 1200);
check('максимум 3 звезды', EVO_MAX === 3 && isMythic(3) && !isMythic(2));
{
  const base = getCard('knight');
  const up = applyEvo(base, 3);
  check('applyEvo множит hp/урон', up.hp === Math.round(base.hp * 1.15) && up.damage === Math.round(base.damage * 1.15) && up.evo === 3);
  check('исходная карта не меняется', base.evo === undefined);
}
check('подписи эволюции', evoLabel(3).includes('Мифическая'));

// ——— бой-пропуск ———
check('20 уровней пропуска', PASS_TIERS === 20 && PASS_REWARDS.length === 20);
check('уровни идут по порядку', PASS_REWARDS.every((r, i) => r.tier === i + 1));
check('двухтрековые награды с иконками', PASS_REWARDS.every((r) =>
  r.free && r.free.icon && r.free.label && r.premium && r.premium.icon && r.premium.label));
check('tierForXp: 100 XP = уровень', tierForXp(0) === 0 && tierForXp(99) === 0 && tierForXp(100) === 1 && tierForXp(2000) === 20);
check('passReward выдаёт треки', passReward(5, 'free').chest === 'wood' && passReward(5, 'premium').chest === 'iron');
check('премиум стоит золото', PREMIUM_COST === 500);

// ——— достижения ———
check('16 достижений', ACHIEVEMENTS.length === 16);
check('у достижений условия и награды', ACHIEVEMENTS.every((a) => a.id && a.title && a.desc && a.gold > 0 && typeof a.check === 'function'));
check('условие first_win срабатывает', ACHIEVEMENTS.find((a) => a.id === 'first_win').check({ wins: 1 }));
check('statsFrom считает сводку', statsFrom({ wins: 5, campaignDone: { m01: 3, m02: 2 }, level: 3 }).campaignDone === 2);

// ——— уровень игрока ———
check('опыт уровней растёт', xpForLevel(1) === 100 && xpForLevel(5) === 400);
check('levelFromXp считает уровень', levelFromXp(0).level === 1 && levelFromXp(150).level === 2 && levelFromXp(200000).level === 50);
check('normalizeProgress сохраняет новые поля', (() => {
  const n = normalizeProgress({ wins: 7, level: 4, xp: 300, evo: { knight: 2 }, campaignDone: { m01: 3 }, cup: { round: 1, wins: 1, active: true }, ach: { first_win: true }, pass: { season: 'X', xp: 250, premium: true, claimed: [1], claimedPremium: [] } });
  return n.wins === 7 && n.level === 4 && n.evo.knight === 2 && n.campaignDone.m01 === 3 &&
    n.cup.active === true && n.ach.first_win === true && n.pass.premium === true && n.pass.claimed.length === 1;
})());
check('chestByType выдаёт нужный тип', chestByType('royal').type === 'royal' && chestByType('wood').type === 'wood');

// ——— интеграция с UI ———
const uiSrc = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
check('экраны: кампания/турнир/кузница/2×2/война/профиль/пропуск',
  ['showCampaign', 'showTournament', 'showForge', 'showCoop', 'showClanWar', 'showProfile', 'showPass'].every((s) => uiSrc.includes(s)));
check('бой-пропуск в меню (m-pass)', uiSrc.includes('m-pass') && uiSrc.includes('pass-hero'));
check('награды: опыт и достижения в конце боя', uiSrc.includes('_grantXp') && uiSrc.includes('_checkAchievements'));
check('босс и командиры в боевом цикле', uiSrc.includes('_bossCtl') && uiSrc.includes('_commanders'));

// ——— баланс, новые карты, погода, музыка, драфт ———
import { ALL_CARDS as ALL2 } from '../src/data/cards.js';
import { cardBalance } from '../src/data/balance.js';

check('все карты сбалансированы (0 дисбалансных)', ALL2.every((c) => cardBalance(c).ok));
const NEW_IDS = ['frost_titan', 'thunder_dragon', 'blood_knight', 'frost_archer', 'shield_maiden', 'griffin', 'light_priest', 'thorn_golem', 'meteor_strike', 'frost_nova'];
check('10 новых карт в базе', NEW_IDS.every((id) => ALL2.find((c) => c.id === id)));
check('новые карты с моделями', NEW_IDS.every((id) => {
  const c = ALL2.find((x) => x.id === id);
  return c.model && c.model.parts && c.model.parts.length > 0;
}));
const bvSrc = readFileSync(new URL('../src/render/battleView.js', import.meta.url), 'utf8');
check('погода в бою (rain/snow/night/sunset)', ['_drawWeather', '_stepWeather', 'rain', 'snow', 'night', 'sunset'].every((s) => bvSrc.includes(s)));
check('музыка и звуки событий', uiSrc.includes('class Music') && uiSrc.includes('music.setMode') && uiSrc.includes('towerDown'));
check('кнопка драфта есть во вкладке «В бой»', uiSrc.includes('id="m-draft"') && uiSrc.includes('startBattle(\'draft\')'));
check('кнопка драфта НЕ на главном экране', !uiSrc.includes('<button class="btn btn-ghost" id="m-draft"'));
check('функция драфта доступна в коде', uiSrc.includes('showDraft'));
check('режим «Экзамен» удалён из файлов', !uiSrc.includes('showExam'));

if (failed) {
  console.error('\nПРОВАЛЕНО:', failed);
  process.exit(1);
}
console.log('\nВСЕ ТЕСТЫ ПРОЙДЕНЫ');
