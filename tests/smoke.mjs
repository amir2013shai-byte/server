// Смоук-тест боевого движка без рендера (node).
import { ALL_CARDS, withCustom, getCard } from '../src/data/cards.js';
import { Battle, MATCH_TIME, ARENA } from '../src/game/engine.js';
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

// ——— мосты и «хитбокс» воды ———
const b5 = new Battle({ playerDeck: deckP, enemyDeck: deckA, cardsById });
const walker = b5.deploy('giant', -7, -8, 'player', { free: true });
if (walker) walker.speed = Math.max(walker.speed, 1.4);
let inWaterOffBridge = 0;
for (let t = 0; t < 24; t += 0.05) {
  b5.update(0.05);
  for (const u of b5.units) {
    if (u.flying || u.isBuilding) continue;
    const onBridge = Math.abs(Math.abs(u.x) - ARENA.bridgeX) <= ARENA.bridgeHalfW + 0.26;
    if (Math.abs(u.y) < ARENA.riverY - 0.01 && !onBridge) inWaterOffBridge++;
  }
}
check('наземные юниты не заходят в воду вне мостов', inWaterOffBridge === 0);
check('гигант дошёл до моста/через реку', walker && (walker.y > ARENA.riverY || Math.abs(walker.y) < ARENA.riverY + 0.5));

// выталкивание из воды
const b6 = new Battle({ playerDeck: deckP, enemyDeck: deckA, cardsById });
const frog = b6._makeUnit(getCard('knight'), 'player', 0, 0, {});
b6._constrainToLand(frog);
check('юнит в центре реки вытолкнут с воды', Math.abs(frog.y) >= ARENA.riverY);
const onBridgeU = b6._makeUnit(getCard('knight'), 'player', ARENA.bridgeX, 0, {});
b6._constrainToLand(onBridgeU);
check('юнит на мосту не тронут', onBridgeU.y === 0 && onBridgeU.x === ARENA.bridgeX);
const bird = b6._makeUnit(getCard('minions'), 'player', 0, 0, {});
b6._constrainToLand(bird);
check('летающий юнит может быть над водой', bird.y === 0);

// ——— очередь через мост не застревает ———
const b7 = new Battle({ playerDeck: deckP, enemyDeck: deckA, cardsById });
const queue = [];
for (let i = 0; i < 7; i++) {
  const u = b7.deploy('knight', 5.2 + (i % 2) * 0.7, -6 - i * 1.5, 'player', { free: true });
  if (u) queue.push(u);
}
const crossed = new Set();
for (let t = 0; t < 45; t += 0.05) {
  b7.update(0.05);
  for (const u of queue) {
    if (u.y > ARENA.riverY + 0.3) crossed.add(u.id);
  }
}
check('колонна из 7 юнитов проходит мост без застревания', crossed.size === queue.length);

// ——— встречный поток входит на мост с обеих сторон ———
const b8 = new Battle({ playerDeck: deckP, enemyDeck: deckA, cardsById });
const s = b8.deploy('knight', 5.6, -6, 'player', { free: true });
const n = b8.deploy('knight', 4.8, 6, 'ai', { free: true });
let sOn = false, nOn = false;
for (let t = 0; t < 20; t += 0.05) {
  b8.update(0.05);
  if (s && s.alive && Math.abs(s.y) < ARENA.riverY + 1.2) sOn = true;
  if (n && n.alive && Math.abs(n.y) < ARENA.riverY + 1.2) nOn = true;
}
check('юниты с обеих сторон заходят на мост', sOn && nOn);

// ——— высадка не «захватывает» чужую территорию ———
const b9 = new Battle({ playerDeck: deckP, enemyDeck: deckA, cardsById });
b9.deploy('goblins', 0, -ARENA.riverY, 'player', { free: true });
b9.deploy('recruits', 2, -ARENA.riverY, 'player', { free: true });
const placed = b9.units.filter((u) => u.team === 'player');
check('отряды у самой линии не вылезают за свою половину',
  placed.length >= 4 && placed.every((u) => u.y <= -ARENA.riverY + 0.01));

// выталкивание из воды — всегда на СВОЙ берег
const b10 = new Battle({ playerDeck: deckP, enemyDeck: deckA, cardsById });
const wet = b10._makeUnit(getCard('knight'), 'player', 0, 0.3, {});
b10._constrainToLand(wet);
check('юнит в воде выносится на свой берег, а не на чужой', wet.y === -ARENA.riverY);
const wetAi = b10._makeUnit(getCard('knight'), 'ai', 0, -0.3, {});
b10._constrainToLand(wetAi);
check('вражеский юнит в воде — на своём берегу', wetAi.y === ARENA.riverY);

// ——— после сноса боковой вышки юнит идёт к мосту у ОСТАВШЕЙСЯ цели ———
const b11 = new Battle({ playerDeck: deckP, enemyDeck: deckA, cardsById });
const leftT = b11.towers.find((t) => t.team === 'ai' && t.kind !== 'king' && t.x < 0);
b11._damage(leftT, 99999, {});
const walker2 = b11.deploy('knight', -6, -6, 'player', { free: true });
let crossX = null;
for (let t = 0; t < 60 && crossX === null && walker2 && walker2.alive; t += 0.05) {
  b11.update(0.05);
  if (walker2.y > ARENA.riverY + 0.2) crossX = walker2.x;
}
check('нет левой вышки — юнит переправляется у правого моста', crossX !== null && crossX > 2);

// ——— баланс: одиночный юнит не сносит ГЛАВНУЮ вышку ———
const b12 = new Battle({ playerDeck: deckP, enemyDeck: deckA, cardsById });
for (const t of b12.towers.filter((t) => t.team === 'ai' && t.kind !== 'king')) b12._damage(t, 99999, {});
b12.deploy('magma_beast', 0, -2, 'player', { free: true });
for (let t = 0; t < 150; t += 0.05) b12.update(0.05);
const kingSolo1 = b12.towers.find((t) => t.team === 'ai' && t.kind === 'king');
check('магмовый зверь в одиночку не сносит главную вышку', kingSolo1.alive);
const b13 = new Battle({ playerDeck: deckP, enemyDeck: deckA, cardsById });
for (const t of b13.towers.filter((t) => t.team === 'ai' && t.kind !== 'king')) b13._damage(t, 99999, {});
b13.deploy('steel_golem', 0, -2, 'player', { free: true });
for (let t = 0; t < 150; t += 0.05) b13.update(0.05);
const kingSolo2 = b13.towers.find((t) => t.team === 'ai' && t.kind === 'king');
check('стальной голем в одиночку не сносит главную вышку', kingSolo2.alive);

if (failed) {
  console.error('\nПРОВАЛЕНО:', failed);
  process.exit(1);
}
console.log('\nВСЕ ТЕСТЫ ПРОЙДЕНЫ');
