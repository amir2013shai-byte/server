// Сценарии редактора рисунка карты в jsdom: штрихи, кадры, анимация, коды BA1.
import { JSDOM } from 'jsdom';

const errors = [];
const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="host"></div></body></html>`, {
  url: 'https://game.local/', pretendToBeVisual: true
});
const { window } = dom;
global.window = window;
global.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
global.localStorage = window.localStorage;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 4);
window.requestAnimationFrame = global.requestAnimationFrame;
window.HTMLCanvasElement.prototype.getContext = function () { return null; }; // canvas 2D нет — проверяем устойчивость

const { ArtEditor } = await import('../src/render/artEditor.js');
const { normalizeArt, emptyArt, drawStrokes, artFrameIndex, ART_SIZE } = await import('../src/render/art2d.js');
const { encodeArt, decodeArt } = await import('../src/share.js');

const $ = (s) => window.document.querySelector(s);
const $$ = (s) => [...window.document.querySelectorAll(s)];
const click = (el) => { if (!el) throw new Error('нет элемента'); el.dispatchEvent(new window.Event('click', { bubbles: true })); };
const step = (name, fn) => {
  try { fn(); console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); errors.push(name + ': ' + e.message); }
};

console.log('— редактор рисунка —');
let saved = null;
const editor = new ArtEditor($('#host'), null, { onSave: (a) => { saved = a; } });

step('панели редактора на месте', () => {
  if (!$('#art-palette') || !$('#art-frames') || !$('#art-anim')) throw new Error('нет панелей');
  if (!$('.me-draw') || !$('.me-preview')) throw new Error('нет холстов');
});

step('кисть добавляет штрих, undo убирает', () => {
  const before = editor.getArt().frames[0].length;
  editor.addStroke({ c: '#ff0000', w: 8, pts: [[10, 10], [40, 40]] });
  if (editor.getArt().frames[0].length !== before + 1) throw new Error('штрих не добавился');
  editor.undo();
  if (editor.getArt().frames[0].length !== before) throw new Error('undo не сработал');
});

step('штампы добавляются', () => {
  editor.addStamp('star', 64, 64, 30, '#ffe066');
  const strokes = editor.getArt().frames[editor.frame];
  const s = strokes[strokes.length - 1];
  if (s.shape !== 'star') throw new Error('штамп не добавился: ' + s.shape);
  if (s.x !== 64 || s.s !== 30) throw new Error('параметры штампа потерялись');
});

step('счётчик кадра обновляется вживую', () => {
  const label = () => {
    const el = window.document.querySelector(`[data-frame="${editor.frame}"] .muted`);
    return el ? el.textContent : null;
  };
  const n = editor.getArt().frames[editor.frame].length;
  if (label() !== `(${n})`) throw new Error(`счётчик ${label()} вместо (${n})`);
  editor.addStamp('circle', 32, 32, 24, '#ffffff');
  if (label() !== `(${n + 1})`) throw new Error('счётчик не вырос после штампа');
  editor.undo();
  if (label() !== `(${n})`) throw new Error('счётчик не уменьшился после undo');
  editor.clearFrame();
  if (label() !== '(0)') throw new Error('счётчик не обнулился после очистки');
  // вернуть содержимое для следующих шагов
  editor.addStamp('star', 64, 64, 30, '#ffe066');
});

step('кадры: добавление копирует рисунок', () => {
  const n0 = editor.getArt().frames.length;
  if (!editor.addFrame(true)) throw new Error('кадр не добавился');
  if (editor.getArt().frames.length !== n0 + 1) throw new Error('число кадров не выросло');
  const src = editor.getArt().frames[n0 - 1];
  const copy = editor.getArt().frames[n0];
  if (copy.length !== src.length) throw new Error('копия кадра пустая');
  if (copy === src) throw new Error('кадры разделяют один массив!');
});

step('удаление кадра, минимум 1 кадр', () => {
  const n0 = editor.getArt().frames.length;
  if (!editor.deleteFrame()) throw new Error('кадр не удалился');
  if (editor.getArt().frames.length !== n0 - 1) throw new Error('кадр не удалился (счётчик)');
  editor.deleteFrame();
  if (editor.getArt().frames.length < 1) throw new Error('удалили последний кадр');
});

step('анимация задаётся', () => {
  editor.setAnim({ type: 'bob', speed: 2 });
  const a = editor.getArt();
  if (a.anim.type !== 'bob') throw new Error('тип анимации не применился');
  if (a.anim.speed !== 2) throw new Error('скорость не применилась');
  editor.setAnim({ type: 'walk' });
  if (editor.getArt().anim.type !== 'walk') throw new Error('walk не применился');
});

step('сохранение отдаёт нормализованный рисунок', () => {
  click($('[data-act="save"]'));
  if (!saved) throw new Error('onSave не вызван');
  if (!saved.frames || !saved.frames.length) throw new Error('кадры пустые');
  if (!saved.anim) throw new Error('нет anim');
});

console.log('— коды рисунка BA1 —');
step('encodeArt → decodeArt сохраняет штрихи и анимацию', () => {
  const art = {
    frames: [[{ c: '#123456', w: 9, pts: [[5, 5], [50, 80], [100, 20]] }], [{ shape: 'heart', c: '#ff0000', x: 30, y: 40, s: 22 }]],
    anim: { type: 'pulse', speed: 1.7, fps: 8 }
  };
  const code = encodeArt(art);
  if (!code || !code.startsWith('BA1.')) throw new Error('код не BA1: ' + code);
  const back = decodeArt(code);
  if (!back) throw new Error('код не распознан');
  if (back.frames.length !== 2) throw new Error('кадры потерялись: ' + back.frames.length);
  if (back.frames[0][0].pts.length !== 3) throw new Error('штрихи потерялись');
  if (back.frames[1][0].shape !== 'heart') throw new Error('штамп потерялся');
  if (back.anim.type !== 'pulse' || back.anim.speed !== 1.7) throw new Error('анимация потерялась');
});

step('sanitizeArt: мусор и рамки', () => {
  const bad = normalizeArt({ frames: [['строка', null], []], anim: { type: 'хак', speed: 99 } });
  if (bad.frames.length > 4) throw new Error('слишком много кадров');
  if (bad.anim.speed > 4) throw new Error('скорость не ограничена');
  const big = normalizeArt({ frames: [[{ c: '#fff', w: 2, pts: [[9999, -5]] }]], anim: {} });
  const p = big.frames[0][0].pts[0];
  if (p[0] > ART_SIZE || p[1] < 0) throw new Error('координаты не зажаты: ' + p);
});

step('пустой рисунок и drawStrokes без ctx не падают', () => {
  const e = emptyArt();
  if (!e.frames[0]) throw new Error('emptyArt без кадра');
  drawStrokes(null, [{ c: '#fff', w: 3, pts: [[1, 1]] }], 64); // не должно бросить
  if (artFrameIndex(null, 1) !== 0) throw new Error('artFrameIndex(null)');
});

console.log('— итог —');
if (errors.length) {
  console.error('ОШИБКИ (' + errors.length + '):');
  for (const e of errors) console.error(' •', e);
  process.exit(1);
}
console.log('все сценарии прошли');
process.exit(0);
