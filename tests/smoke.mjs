// Смоук-тест боевого движка без рендера (node).
import { ALL_CARDS, withCustom, getCard } from '../src/data/cards.js';
import { Battle, MATCH_TIME } from '../src/game/engine.js';
import { BattleAI } from '../src/game/ai.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log('  ✓', name);
  else { console.error('  ✗', name); failed++; }
}

console.log('Карты в базе:', ALL_CARDS.length);
check('карт больше 60', ALL_CARDS.length > 60);
check('все модели имеют части', ALL_CARDS.every((c) => c.model && c.model.parts && c.model.parts.length > 0));
check('у войск есть hp', ALL_CARDS.filter((c) => c.type === 'troop').every((c) => c.hp > 0));
check('стоимость 0..10', ALL_CARDS.every((c) => c.cost >= 0 && c.cost <= 10));
check('spell имеет spell-блок', ALL_CARDS.filter((c) => c.type === 'spell').every((c) => c.spell && c.spell.effect));
check('building имеет building-блок', ALL_CARDS.filter((c) => c.type === 'building').every((c) => c.building && c.building.lifetime > 0));

// ссылки spawnOnDeath/spawnTroops существуют
const ids = new Set(ALL_CARDS.map((c) => c.id));
let refsOk = true;
for (const c of ALL_CARDS) {
  for (const ab of c.abilities || []) {
    if ((ab.type === 'spawnOnDeath' || ab.type === 'spawnTroops') && ab.cardId && !ids.has(ab.cardId)) {
      console.error('   нет карты-призыва:', c.id, '→', ab.cardId);
      refsOk = false;
    }
  }
}
check('все ссылки на призываемых существуют', refsOk);

// дуэль: 20 секунд симуляции
const cardsById = new Map(ALL_CARDS.map((c) => [c.id, c]));
const deckP = ['knight', 'archers', 'goblins', 'fireball', 'musketeer', 'giant', 'arrows', 'cannon'];
const deckA = ['valkyrie', 'skeletons', 'minions', 'rocket', 'wizard', 'golem', 'zap', 'tesla'];
const battle = new Battle({ playerDeck: deckP, enemyDeck: deckA, cardsById });
const ai = new BattleAI(battle, 'ai');

check('6 башен на старте', battle.towers.length === 6);
check('рука из 4 карт', battle.teams.player.hand.length === 4);

// высадка и симуляция
const u = battle.deploy('giant', 4, -6, 'player');
check('гигант создан', !!u && u.hp > 0);
battle.deploy('archers', -3, -8, 'player');
battle.deploy('fireball', 0, 5, 'player', { free: true });
battle.deploy('witch', 0, 4, 'ai', { free: true });
battle.deploy('golem', -5, 8, 'ai', { free: true });
battle.deploy('tombstone', 3, -7, 'ai', { free: true });
battle.deploy('freeze', 0, -6, 'ai', { free: true });

let ticks = 0;
const seen = new Set();
for (let t = 0; t < 20; t += 0.05) {
  battle.update(0.05);
  ai.update(0.05);
  ticks++;
  for (const e of battle.drainEvents()) seen.add(e.type);
  if (battle.finished) break;
}
check(`симуляция ${ticks} тиков без падения`, ticks > 100);
check('есть события deploy/spawn/attack', seen.has('deploy') && seen.has('spawn'));
check('эликсир растёт', battle.teams.player.elixir > 0);
check('юниты на поле', battle.units.length > 0);
check('никто не в NaN', [...battle.units, ...battle.towers].every((e) => Number.isFinite(e.x) && Number.isFinite(e.y)));

// полный матч до конца (ускоренно)
const battle2 = new Battle({ playerDeck: deckP, enemyDeck: deckA, cardsById });
const ai2 = new BattleAI(battle2, 'ai');
battle2.deploy('giant', 0, -5, 'player');
battle2.deploy('golem', 0, 5, 'ai');
let simT = 0;
while (simT < MATCH_TIME + 30 && !battle2.finished) {
  battle2.update(0.05);
  ai2.update(0.05);
  simT += 0.05;
  if (simT % 3 < 0.05) {
    battle2.deploy('knight', Math.random() * 10 - 5, -4 - Math.random() * 6, 'player');
    battle2.deploy('valkyrie', Math.random() * 10 - 5, 4 + Math.random() * 6, 'ai');
  }
}
check('матч завершился', battle2.finished && !!battle2.result);
console.log('   результат:', JSON.stringify(battle2.result), 'короны:', battle2.crowns);

// пользовательская карта с абилками
const custom = {
  id: 'custom_test', name: 'Тест-карта', rarity: 'epic', type: 'troop', cost: 3,
  count: 1, hp: 900, damage: 120, hitSpeed: 1, range: 1.2, speed: 1.2,
  targets: 'both', flying: false, buildingOnly: false, splash: 1.5, sight: 5.5,
  custom: true, hidden: false,
  abilities: [
    { type: 'shield', hp: 300 },
    { type: 'spawnOnDeath', cardId: 'skeletons', count: 2 },
    { type: 'freezeHit', duration: 1, onDeath: false },
    { type: 'chain', bounces: 2, damage: 0.5 }
  ],
  spell: null, building: null,
  model: { parts: [{ shape: 'box', pos: [0, 1, 0], rot: [0, 0, 0], scale: [1, 1, 1], color: '#ff0000', emissive: '#000000' }] }
};
const all2 = withCustom([custom]);
check('пользовательская карта добавляется', all2.some((c) => c.id === 'custom_test'));
const b3 = new Battle({ playerDeck: ['custom_test', ...deckP.slice(0, 7)], enemyDeck: deckA, cardsById: new Map(all2.map((c) => [c.id, c])) });
const cu = b3.deploy('custom_test', 0, -4, 'player');
check('кастомная карта с щитом', cu && cu.shieldHp === 300);
b3.update(0.05);

// новые правила: заклинания на любую половину, спящая главная башня
const b4 = new Battle({ playerDeck: deckP, enemyDeck: deckA, cardsById });
check('заклинание можно кидать на вражескую половину', b4.canPlaceAt(0, 8, 'player', getCard('fireball')));
check('войско нельзя ставить на вражескую половину', !b4.canPlaceAt(0, 8, 'player', getCard('knight')));
check('войско можно на свою половину', b4.canPlaceAt(0, -8, 'player', getCard('knight')));
check('главные башни спят на старте', b4.towers.filter((t) => t.kind === 'king').every((t) => !t.activated));
const kingAi = b4.towers.find((t) => t.kind === 'king' && t.team === 'ai');
const leftAi = b4.towers.find((t) => t.kind === 'left' && t.team === 'ai');
leftAi.hp = 0;
b4._kill(leftAi, null);
check('гибель боковой будит главную', kingAi.activated === true);
const kingP = b4.towers.find((t) => t.kind === 'king' && t.team === 'player');
b4._damage(kingP, 10, {});
check('урон по главной будит её', kingP.activated === true);

if (failed) {
  console.error('\nПРОВАЛЕНО:', failed);
  process.exit(1);
}
console.log('\nВСЕ ТЕСТЫ ПРОЙДЕНЫ');
