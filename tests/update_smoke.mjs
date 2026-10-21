// Тесты обновления: новые абилки, режимы боя, прогрессия, реплеи.
const errors = [];
const step = (name, fn) => {
  try { fn(); console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); errors.push(name + ': ' + e.message); }
};

global.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const { Battle } = await import('../src/game/engine.js');
const {
  LEVEL_MAX, levelMultiplier, upgradeCost, leagueFor, nextLeague,
  cardLevel, scaleCard, rollChest, openChest, normalizeProgress, emptyProgress
} = await import('../src/progress.js');
const { ReplayRecorder, encodeReplay, decodeReplay, saveReplayToList, REPLAY_LIMIT } = await import('../src/replay.js');
const { encodeModel, decodeModel } = await import('../src/share.js');

// ——— прогрессия ———

console.log('— прогрессия —');
step('уровни: множитель растёт, апгрейд дорожает', () => {
  if (levelMultiplier(1) !== 1) throw new Error('базовый множитель не 1');
  if (!(levelMultiplier(13) > levelMultiplier(5))) throw new Error('множитель не растёт');
  if (!(upgradeCost(5) > upgradeCost(1))) throw new Error('апгрейд не дорожает');
  if (LEVEL_MAX !== 13) throw new Error('макс. уровень не 13');
});

step('scaleCard масштабирует HP и урон', () => {
  const card = { id: 'x', hp: 1000, damage: 100, count: 1 };
  const s = scaleCard(card, 6);
  if (s.hp <= 1000) throw new Error('HP не вырос');
  if (s.damage <= 100) throw new Error('урон не вырос');
  if (card.hp !== 1000) throw new Error('исходная карта изменена!');
  if (s.level !== 6) throw new Error('уровень не проставился');
});

step('лиги по трофеям', () => {
  if (leagueFor(0).name !== 'Бронза') throw new Error('0 → не Бронза');
  if (leagueFor(2900).name !== 'Легенда') throw new Error('2900 → не Легенда');
  if (nextLeague(0).name !== 'Серебро') throw new Error('следующая после Бронзы не Серебро');
  if (nextLeague(99999) !== null) throw new Error('у максимума есть «следующая»');
});

step('сундуки: выдача и открытие', () => {
  const winChest = rollChest(true);
  if (!winChest.type || !winChest.id) throw new Error('сундук без типа');
  const p = normalizeProgress(emptyProgress());
  const rew = openChest(winChest, ['knight', 'archers']);
  if (rew.gold <= 0) throw new Error('золота нет');
  if (rew.cards.length < 1) throw new Error('карт нет');
  p.gold += rew.gold;
  if (p.gold <= 150) throw new Error('золото не добавилось');
});

step('прогресс: уровни переживают нормализацию', () => {
  const p = normalizeProgress({ gold: 999, cardLevels: { knight: 7, bad: 99, evil: -1 }, chests: [{ type: 'wood', id: 'a' }, null], replays: [{ snaps: [1] }, { no: 1 }] });
  if (p.gold !== 999) throw new Error('золото потерялось');
  if (p.cardLevels.knight !== 7) throw new Error('уровень потерялся');
  if (p.cardLevels.bad !== undefined) throw new Error('уровень 99 прошёл!');
  if (p.chests.length !== 1) throw new Error('мусорные сундуки прошли');
  if (p.replays.length !== 1) throw new Error('мусорные реплеи прошли');
});

// ——— реплеи ———

console.log('— реплеи —');
step('реплей: запись → код → восстановление', () => {
  const rec = new ReplayRecorder({ mode: 'normal', playerDeck: ['knight'], enemyDeck: ['goblins'] });
  rec.record({ time: 0.3, units: [[1, 'knight', 'player', 0, -5, 100, 100, 0]], towers: [], crowns: { player: 0, ai: 0 }, elixir: [5, 5], hands: [[], []] });
  rec.record({ time: 1.0, units: [], towers: [], crowns: { player: 1, ai: 0 }, elixir: [4, 4], hands: [[], []] });
  rec.record({ time: 20, finished: true, result: { winner: 'player' }, units: [], towers: [], crowns: { player: 1, ai: 0 }, elixir: [8, 8], hands: [[], []] }, true);
  rec.setResult('win');
  const data = rec.toJSON();
  if (data.snaps.length !== 3) throw new Error('снапшоты не записались: ' + data.snaps.length);
  const code = encodeReplay(data);
  const back = decodeReplay(code);
  if (!back) throw new Error('код реплея не декодируется');
  if (back.snaps.length !== 3) throw new Error('кадры потерялись');
  if (back.meta.result !== 'win') throw new Error('результат потерялся');
});

step('лимит реплеев', () => {
  let list = [];
  for (let i = 0; i < REPLAY_LIMIT + 2; i++) {
    list = saveReplayToList(list, { meta: { i }, snaps: [{}] });
  }
  if (list.length !== REPLAY_LIMIT) throw new Error('лимит не работает: ' + list.length);
});

step('код модели: round trip', () => {
  const m = { parts: [{ shape: 'wedge', pos: [1, 2, 3], rot: [0, 1, 0], scale: [1, 1, 1], color: '#abc123', emissive: '#000000', tex: 'stripes', opacity: 0.5, anim: 'spin' }] };
  const back = decodeModel(encodeModel(m));
  if (!back || back.parts[0].shape !== 'wedge') throw new Error('форма потерялась');
  if (back.parts[0].tex !== 'stripes' || back.parts[0].anim !== 'spin') throw new Error('текстура/анимация потерялись');
  if (back.parts[0].opacity !== 0.5) throw new Error('прозрачность потерялась');
});

// ——— новые абилки в движке ———

function card(id, over = {}) {
  return {
    id, name: id, rarity: 'common', type: 'troop', cost: 1, count: 1,
    hp: 500, damage: 50, hitSpeed: 1, range: 1, speed: 1, sight: 6,
    targets: 'both', flying: false, abilities: [], spell: null, building: null,
    ...over
  };
}

function battleWith(cards, rules = {}) {
  const map = new Map(cards.map((c) => [c.id, c]));
  return new Battle({
    playerDeck: cards.map((c) => c.id),
    enemyDeck: cards.map((c) => c.id),
    cardsById: map,
    ...rules
  });
}

console.log('— новые абилки —');
step('dodge: шанс 1.0 даёт полное уклонение', () => {
  const dodger = card('dodger', { abilities: [{ type: 'dodge', chance: 1 }] });
  const b = battleWith([dodger]);
  const u = b._makeUnit(dodger, 'player', 0, -5, {});
  b._damage(u, 200, {});
  if (u.hp !== 500) throw new Error('урон прошёл сквозь уклонение: ' + u.hp);
});

step('crit: шанс 1.0 удваивает урон', () => {
  const critter = card('critter', { damage: 100, abilities: [{ type: 'crit', chance: 1, multiplier: 2 }] });
  const dummy = card('dummy');
  const b = battleWith([critter, dummy]);
  const u = b._makeUnit(critter, 'player', 0, -5, {});
  const t = b._makeUnit(dummy, 'ai', 0, -4, {});
  b._attack(u, t);
  if (t.hp >= 500 - 100) throw new Error('крит не сработал: hp=' + t.hp);
  if (t.hp > 500 - 199) throw new Error('крит не удвоил урон: hp=' + t.hp);
});

step('revive: поднимается один раз', () => {
  const zombie = card('zombie', { hp: 400, abilities: [{ type: 'revive', hpPercent: 0.5 }] });
  const b = battleWith([zombie]);
  const u = b._makeUnit(zombie, 'player', 0, -5, {});
  b._damage(u, 9999, {});
  if (!u.alive) throw new Error('не возродился');
  if (u.hp !== 200) throw new Error('HP после возрождения не 50%: ' + u.hp);
  b._damage(u, 9999, {});
  if (u.alive) throw new Error('возродился дважды');
});

step('thorns: возвращает урон атакующему', () => {
  const cactus = card('cactus', { abilities: [{ type: 'thorns', percent: 1 }] });
  const puncher = card('puncher', { damage: 100 });
  const b = battleWith([cactus, puncher]);
  const c = b._makeUnit(cactus, 'ai', 0, -5, {});
  const p = b._makeUnit(puncher, 'player', 0, -4, {});
  b._damage(c, 100, { source: p.id, team: 'player' });
  if (p.hp >= 500) throw new Error('шипы не вернули урон: ' + p.hp);
});

step('taunt: провокатор перехватывает цель', () => {
  const tank = card('tank', { abilities: [{ type: 'taunt', radius: 5 }] });
  const victim = card('victim');
  const attacker = card('attacker');
  const b = battleWith([tank, victim, attacker]);
  const t = b._makeUnit(tank, 'ai', 1, -5, {});
  const v = b._makeUnit(victim, 'ai', -1, -5, {});
  const a = b._makeUnit(attacker, 'player', 0, -3, {});
  const targetId = b._pickTarget(a);
  if (targetId !== t.id) throw new Error('цель не провокатор');
  // вне радиуса — провокация не работает
  t.x = 20; t.y = -20;
  const targetId2 = b._pickTarget(a);
  if (targetId2 === t.id) throw new Error('провокация работает вне радиуса');
});

step('buffAura: аура усиливает союзника', () => {
  const leader = card('leader', { abilities: [{ type: 'buffAura', radius: 4, damageMul: 1.5, speedMul: 1.2 }] });
  const pal = card('pal');
  const b = battleWith([leader, pal]);
  const l = b._makeUnit(leader, 'player', 0, -5, {});
  const f = b._makeUnit(pal, 'player', 1, -5, {});
  b.update(0.05);
  if (!(f.buffDmgMul >= 1.5)) throw new Error('аура урона не применилась: ' + f.buffDmgMul);
  if (!(f.buffSpeedMul >= 1.2)) throw new Error('аура скорости не применилась: ' + f.buffSpeedMul);
  if (!(l.buffDmgMul >= 1.5)) throw new Error('аура не на себя');
});

// ——— режимы боя ———

console.log('— режимы —');
step('внезапная смерть: первая башня завершает бой', () => {
  const b = battleWith([card('c1')], { suddenDeath: true, matchTime: 120 });
  const tower = b.towers.find((t) => t.kind === 'left' && t.team === 'ai');
  b._damage(tower, 99999, {});
  b.update(0.05);
  if (!b.finished) throw new Error('бой не завершился');
  if (b.result.winner !== 'player') throw new Error('победитель не игрок: ' + JSON.stringify(b.result));
  if (b.result.reason !== 'sudden') throw new Error('причина не sudden: ' + b.result.reason);
});

step('двойной эликсир: с начала быстрее', () => {
  const normal = battleWith([card('c1')]);
  const x2 = battleWith([card('c1')], { doubleElixirAt: 0 });
  for (let i = 0; i < 20; i++) { normal.update(0.05); x2.update(0.05); } // ~1 сек
  const gainN = normal.teams.player.elixir - 5;
  const gainX = x2.teams.player.elixir - 5;
  if (!(gainX > gainN * 1.5)) {
    throw new Error(`x2 не быстрее: +${gainX.toFixed(3)} vs +${gainN.toFixed(3)} за секунду`);
  }
});

step('обычный режим: правила по умолчанию', () => {
  const b = battleWith([card('c1')]);
  if (b.rules.matchTime !== 180) throw new Error('время не 180');
  if (b.rules.suddenDeath) throw new Error('suddenDeath в обычном');
});

console.log('— итог —');
if (errors.length) {
  console.error('ОШИБКИ (' + errors.length + '):');
  for (const e of errors) console.error(' •', e);
  process.exit(1);
}
console.log('все сценарии прошли');
process.exit(0);
