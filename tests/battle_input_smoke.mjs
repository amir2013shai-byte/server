// Ввод 2D-вида битвы: маппинг экран→арена, жесты высадки, отмена.
const errors = [];
const step = (name, fn) => {
  try { fn(); console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); errors.push(name + ': ' + e.message); }
};

// минимальные глобалы до импорта модулей
global.window = {
  PointerEvent: class PointerEvent {}, // принудительно ветка pointer-событий
  devicePixelRatio: 1,
  addEventListener() {}, removeEventListener() {}
};
global.document = { createElement: () => ({ style: {}, remove() {}, classList: { add() {} }, getContext: () => null, width: 0, height: 0 }) };

const { BattleView } = await import('../src/render/battleView.js');
const { Battle } = await import('../src/game/engine.js');
const { ALL_CARDS } = await import('../src/data/cards.js');

// объект без конструктора: только то, что нужно вводу
function makeView(w, h, onDeploy) {
  const bv = Object.create(BattleView.prototype);
  bv.pointer = { down: false, x: 0, y: 0 };
  bv.pendingCard = null;
  bv.opts = { onDeployRequest: onDeploy };
  bv._t = 0;
  bv.projectiles = [];
  bv.fx = [];
  bv.floating = [];
  bv._disposed = false;
  const listeners = new Map();
  bv.canvas = {
    width: w, height: h, style: {},
    addEventListener: (t, fn) => listeners.set(t, (listeners.get(t) || []).concat(fn)),
    removeEventListener: (t, fn) => listeners.set(t, (listeners.get(t) || []).filter((f) => f !== fn)),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    remove: () => {},
    fire: (type, ev) => (listeners.get(type) || []).forEach((fn) => fn(ev))
  };
  bv._bindInput();
  bv._updateGhost = () => {};
  // боевой движок для проверки canPlaceAt призрака
  const cardsById = new Map(ALL_CARDS.map((c) => [c.id, c]));
  bv.battle = new Battle({
    playerDeck: ['knight', 'archers', 'fireball', 'giant'],
    enemyDeck: ['valkyrie', 'minions', 'rocket', 'golem'],
    cardsById
  });
  return bv;
}

const W = 400, H = 870; // телефон

console.log('— маппинг экран → арена —');
step('низ экрана → своя половина', () => {
  const bv = makeView(W, H, () => {});
  const p = bv.screenToGround(W / 2, H - 2);
  if (!p) throw new Error('точка не посчиталась');
  if (p.y > -1.2) throw new Error('низ экрана не на своей половине: y=' + p.y.toFixed(2));
  console.log('    низ → y=' + p.y.toFixed(2), 'x=' + p.x.toFixed(2));
});

step('верх экрана → вражеская половина', () => {
  const bv = makeView(W, H, () => {});
  const p = bv.screenToGround(W / 2, 2);
  if (!p) throw new Error('точка не посчиталась');
  if (p.y < 1.2) throw new Error('верх экрана не на вражеской половине: y=' + p.y.toFixed(2));
  console.log('    верх → y=' + p.y.toFixed(2), 'x=' + p.x.toFixed(2));
});

step('центр арены и края соответствуют мировым координатам', () => {
  const bv = makeView(W, H, () => {});
  const c = bv.screenToGround(W / 2, H / 2);
  if (Math.abs(c.x) > 0.5 || Math.abs(c.y) > 0.5) throw new Error('центр экрана не в центре арены: ' + JSON.stringify(c));
  const left = bv.screenToGround(0, H / 2);
  const right = bv.screenToGround(W, H / 2);
  if (!(left.x < -8 && right.x > 8)) throw new Error('края не соответствуют ширине арены');
});

console.log('— жесты высадки —');
step('pointerdown+up на арене вызывает deploy с id, а не объектом', () => {
  const calls = [];
  const bv = makeView(W, H, (id, x, y) => calls.push({ id, x, y }));
  bv.setPendingCard({ id: 'knight', type: 'troop' });
  bv.canvas.fire('pointerdown', { clientX: W / 2, clientY: H - 2, preventDefault() {} });
  bv.canvas.fire('pointerup', { clientX: W / 2, clientY: H - 2, preventDefault() {} });
  if (calls.length !== 1) throw new Error('deploy не вызван: ' + calls.length);
  if (typeof calls[0].id !== 'string') throw new Error('id не строка: ' + typeof calls[0].id);
  if (calls[0].id !== 'knight') throw new Error('id не тот: ' + calls[0].id);
});

step('pointercancel НЕ вызывает deploy', () => {
  const calls = [];
  const bv = makeView(W, H, (id, x, y) => calls.push({ id, x, y }));
  bv.setPendingCard({ id: 'knight', type: 'troop' });
  bv.canvas.fire('pointerdown', { clientX: W / 2, clientY: H - 2, preventDefault() {} });
  bv.canvas.fire('pointercancel', {});
  bv.canvas.fire('pointerup', { clientX: W / 2, clientY: H - 2, preventDefault() {} });
  if (calls.length !== 0) throw new Error('deploy вызван после cancel');
});

step('без выбранной карты deploy не вызывается', () => {
  const calls = [];
  const bv = makeView(W, H, (id, x, y) => calls.push({ id, x, y }));
  bv.canvas.fire('pointerdown', { clientX: W / 2, clientY: H - 2, preventDefault() {} });
  bv.canvas.fire('pointerup', { clientX: W / 2, clientY: H - 2, preventDefault() {} });
  if (calls.length !== 0) throw new Error('deploy без карты');
});

step('после up без down ничего не происходит', () => {
  const calls = [];
  const bv = makeView(W, H, (id, x, y) => calls.push({ id, x, y }));
  bv.setPendingCard({ id: 'knight', type: 'troop' });
  bv.canvas.fire('pointerup', { clientX: W / 2, clientY: H - 2, preventDefault() {} });
  if (calls.length !== 0) throw new Error('deploy без нажатия');
});

console.log('— правила высадки (заклинания на любую половину) —');
step('войско — только своя половина, заклинание — любая', () => {
  const bv = makeView(W, H, () => {});
  const b = bv.battle;
  const troop = { type: 'troop' };
  const spell = { type: 'spell' };
  if (!b.canPlaceAt(0, -8, 'player', troop)) throw new Error('войско на своей половине отклонено');
  if (b.canPlaceAt(0, 8, 'player', troop)) throw new Error('войско на вражеской половине принято!');
  if (!b.canPlaceAt(0, -8, 'player', spell)) throw new Error('заклинание на своей половине отклонено');
  if (!b.canPlaceAt(0, 8, 'player', spell)) throw new Error('заклинание на вражеской половине отклонено!');
  if (b.canPlaceAt(20, -8, 'player', spell)) throw new Error('заклинание вне арены принято!');
  if (!b.canPlaceAt(0, 8, 'ai', troop)) throw new Error('ai-половина для войск ai не принимается');
});

step('главная башня спит и просыпается от урона', () => {
  const bv = makeView(W, H, () => {});
  const b = bv.battle;
  const king = b.towers.find((t) => t.kind === 'king' && t.team === 'ai');
  const princess = b.towers.find((t) => t.kind === 'left' && t.team === 'ai');
  if (king.activated) throw new Error('главная башня активна на старте');
  // боковая жива → главная всё ещё спит
  b._activateKing(king);
  if (!king.activated) throw new Error('главная башня не проснулась по вызову');
  // гибель боковой будит главную той же команды
  const king2 = b.towers.find((t) => t.kind === 'king' && t.team === 'player');
  if (king2.activated) throw new Error('главная игрока активна на старте');
  princess.hp = 0;
  b._kill(princess, null);
  const kingAi = b.towers.find((t) => t.kind === 'king' && t.team === 'ai');
  if (!kingAi.activated) throw new Error('гибель боковой не разбудила главную');
});

console.log('— итог —');
if (errors.length) {
  console.error('ОШИБКИ (' + errors.length + '):');
  for (const e of errors) console.error(' •', e);
  process.exit(1);
}
console.log('все сценарии прошли');
process.exit(0);
