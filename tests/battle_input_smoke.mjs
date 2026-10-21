// Реальный код ввода BattleView (raycast + жесты) без WebGL: строим объект вручную.
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
global.document = { createElement: () => ({ style: {}, remove() {}, classList: { add() {} } }) };

const THREE = await import('three');
const { BattleView } = await import('../src/render/battleView.js');

// объект без конструктора: только то, что нужно вводу
function makeView(w, h, onDeploy) {
  const bv = Object.create(BattleView.prototype);
  bv.camera = new THREE.PerspectiveCamera(42.5, w / h, 0.1, 200);
  bv.camera.position.set(0, 36, -16);
  bv.camera.lookAt(0, 0, -2);
  bv.camera.updateMatrixWorld(true);
  bv.raycaster = new THREE.Raycaster();
  bv.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  bv.pointer = { down: false, x: 0, y: 0 };
  bv.pendingCard = null;
  bv.opts = { onDeployRequest: onDeploy };
  const listeners = new Map();
  bv._fakeEl = {
    addEventListener: (t, fn) => listeners.set(t, (listeners.get(t) || []).concat(fn)),
    removeEventListener: (t, fn) => listeners.set(t, (listeners.get(t) || []).filter((f) => f !== fn)),
    getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: h }),
    remove: () => {},
    fire: (type, ev) => (listeners.get(type) || []).forEach((fn) => fn(ev))
  };
  bv.renderer = { domElement: bv._fakeEl, dispose() {} };
  bv._updateGhost = () => {};
  return bv;
}

const W = 400, H = 870; // телефон, aspect ≈ 0.46

console.log('— raycast камеры —');
step('низ экрана → своя половина', () => {
  const bv = makeView(W, H, () => {});
  const p = bv.screenToGround(W / 2, H - 2);
  if (!p) throw new Error('луч не попал в землю');
  if (p.y > -1.2) throw new Error('низ экрана не на своей половине: y=' + p.y.toFixed(2));
  console.log('    низ → y=' + p.y.toFixed(2), 'x=' + p.x.toFixed(2));
});

step('верх экрана → вражеская половина', () => {
  const bv = makeView(W, H, () => {});
  const p = bv.screenToGround(W / 2, 2);
  if (!p) throw new Error('луч не попал в землю');
  if (p.y < 1.2) throw new Error('верх экрана не на вражеской половине: y=' + p.y.toFixed(2));
  console.log('    верх → y=' + p.y.toFixed(2), 'x=' + p.x.toFixed(2));
});

step('центр низа экрана кликабелен (своя земля у реки)', () => {
  const bv = makeView(W, H, () => {});
  const p = bv.screenToGround(W / 2, H * 0.62);
  if (!p) throw new Error('луч не попал в землю');
  console.log('    62% высоты → y=' + p.y.toFixed(2));
  if (p.y <= -16 || p.y >= 16) throw new Error('точка вне арены');
});

console.log('— жесты —');
step('pointerdown+up на арене вызывает deploy с id, а не объектом', () => {
  const calls = [];
  const bv = makeView(W, H, (id, x, y) => calls.push({ id, x, y }));
  bv.pendingCard = { id: 'test_knight', name: 'Тест' }; // как battleView получает из setPendingCard
  bv._bindInput();
  bv._fakeEl.fire('pointerdown', { clientX: W / 2, clientY: H - 2, preventDefault() {} });
  bv._fakeEl.fire('pointerup', { clientX: W / 2, clientY: H - 2, preventDefault() {} });
  if (calls.length !== 1) throw new Error('deploy не вызван: ' + calls.length);
  if (typeof calls[0].id !== 'string') throw new Error('передан не id, а ' + typeof calls[0].id);
  if (calls[0].id !== 'test_knight') throw new Error('неверный id: ' + calls[0].id);
  if (calls[0].y > -1.2) throw new Error('координаты не на своей половине');
});

step('pointercancel НЕ вызывает deploy', () => {
  const calls = [];
  const bv = makeView(W, H, (id, x, y) => calls.push({ id, x, y }));
  bv.pendingCard = { id: 'test_knight' };
  bv._bindInput();
  bv._fakeEl.fire('pointerdown', { clientX: W / 2, clientY: H - 2, preventDefault() {} });
  bv._fakeEl.fire('pointercancel', {});
  if (calls.length !== 0) throw new Error('отмена жеста всё-таки высадила карту');
});

step('клик без выбранной карты ничего не делает', () => {
  const calls = [];
  const bv = makeView(W, H, (id, x, y) => calls.push({ id, x, y }));
  bv.pendingCard = null;
  bv._bindInput();
  bv._fakeEl.fire('pointerdown', { clientX: W / 2, clientY: H - 2, preventDefault() {} });
  bv._fakeEl.fire('pointerup', { clientX: W / 2, clientY: H - 2, preventDefault() {} });
  if (calls.length !== 0) throw new Error('deploy без карты');
});

step('dispose снимает обработчики', () => {
  const calls = [];
  const bv = makeView(W, H, (id, x, y) => calls.push({ id, x, y }));
  bv.pendingCard = { id: 'test_knight' };
  bv._bindInput();
  bv.fxLayer = { remove() {} };
  bv.dispose();
  bv._fakeEl.fire('pointerdown', { clientX: W / 2, clientY: H - 2, preventDefault() {} });
  bv._fakeEl.fire('pointerup', { clientX: W / 2, clientY: H - 2, preventDefault() {} });
  if (calls.length !== 0) throw new Error('после dispose обработчики живы');
});

console.log('— итог —');
if (errors.length) {
  console.error('ОШИБКИ (' + errors.length + '):');
  for (const e of errors) console.error(' •', e);
  process.exit(1);
}
console.log('все сценарии прошли');
process.exit(0);
