// Сценарии 3D-редактора моделей в jsdom: добавление/правка/удаление частей, шаблоны, сохранение.
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
window.HTMLCanvasElement.prototype.getContext = function () { return null; }; // WebGL нет — проверяем устойчивость
window.confirm = () => true;
window.prompt = () => '1'; // шаблон №1 «Гуманоид»

const { ModelEditor } = await import('../src/render/modelEditor.js');

const $ = (s) => window.document.querySelector(s);
const $$ = (s) => [...window.document.querySelectorAll(s)];
const click = (el) => { if (!el) throw new Error('нет элемента'); el.dispatchEvent(new window.Event('click', { bubbles: true })); };
const step = (name, fn) => {
  try { fn(); console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); errors.push(name + ': ' + e.message); }
};

console.log('— 3D-редактор —');
let saved = null;
const editor = new ModelEditor($('#host'), null, { onSave: (m) => { saved = m; } });

step('панель открылась без WebGL (устойчивость)', () => {
  if (!$('#me-parts') || !$('#me-props')) throw new Error('нет панелей');
  if (!$('[data-add="box"]')) throw new Error('нет кнопок добавления блоков');
});

step('стартовая модель (гуманоид по умолчанию)', () => {
  if (!editor.getModel().parts.length) throw new Error('модель пустая');
});

step('добавление блоков всех типов', () => {
  for (const s of ['box', 'sphere', 'cylinder', 'cone', 'torus', 'capsule']) {
    click($(`[data-add="${s}"]`));
  }
  const n = editor.getModel().parts.length;
  if (n < 6) throw new Error('блоки не добавились: ' + n);
  if ($$('.me-part').length !== n) throw new Error('список частей не обновился');
});

step('выбор части и рендер свойств', () => {
  click($$('.me-part')[2]);
  if (!$('.me-shape')) throw new Error('нет свойств');
  if (!$('input[data-f="pos"]')) throw new Error('нет слайдеров позиции');
  if (!$('input[type=color]')) throw new Error('нет выбора цвета');
});

step('правка позиции/размера/поворота', () => {
  const pos = $('input[data-f="pos"][data-axis="1"]');
  pos.value = '1.75';
  pos.dispatchEvent(new window.Event('input', { bubbles: true }));
  const part = editor.getModel().parts[2];
  if (Math.abs(part.pos[1] - 1.75) > 0.001) throw new Error('позиция не применилась: ' + part.pos[1]);
  const rot = $('input[data-f="rot"][data-axis="2"]');
  rot.value = '90';
  rot.dispatchEvent(new window.Event('input', { bubbles: true }));
  const part2 = editor.getModel().parts[2];
  if (Math.abs(part2.rot[2] - Math.PI / 2) > 0.01) throw new Error('поворот не применился: ' + part2.rot[2]);
  const sc = $('input[data-f="scale"][data-axis="0"]');
  sc.value = '2.5';
  sc.dispatchEvent(new window.Event('input', { bubbles: true }));
  if (Math.abs(editor.getModel().parts[2].scale[0] - 2.5) > 0.001) throw new Error('размер не применился');
});

step('правка цвета и свечения', () => {
  const col = $('input[data-f="color"]');
  col.value = '#ff0000';
  col.dispatchEvent(new window.Event('input', { bubbles: true }));
  const p = editor.getModel().parts[editor.selected];
  if (p.color !== '#ff0000') throw new Error('цвет не применился: ' + p.color);
});

step('смена формы примитива', () => {
  const sel = $('.me-shape');
  sel.value = 'torus';
  sel.dispatchEvent(new window.Event('change', { bubbles: true }));
  const p = editor.getModel().parts[editor.selected];
  if (p.shape !== 'torus') throw new Error('форма не сменилась');
});

step('номерной ввод позиции', () => {
  const num = $('input[data-num="pos"][data-axis="2"]');
  num.value = '-0.5';
  num.dispatchEvent(new window.Event('change', { bubbles: true }));
  const p = editor.getModel().parts[editor.selected];
  if (Math.abs(p.pos[2] + 0.5) > 0.001) throw new Error('номерной ввод не сработал: ' + p.pos[2]);
});

step('дублирование части', () => {
  const before = editor.getModel().parts.length;
  click($('[data-p="dup"]'));
  if (editor.getModel().parts.length !== before + 1) throw new Error('не продублировалось');
});

step('удаление части', () => {
  const before = editor.getModel().parts.length;
  click($('[data-p="del"]'));
  if (editor.getModel().parts.length !== before - 1) throw new Error('не удалилось');
});

step('шаблон «Гуманоид» через prompt', () => {
  click($('[data-act="template"]'));
  const parts = editor.getModel().parts.length;
  if (parts < 4) throw new Error('шаблон не применился: ' + parts);
});

step('кнопка «Вид» не падает', () => {
  click($('[data-act="reset-cam"]'));
});

step('сохранение возвращает модель', () => {
  click($('[data-act="save"]'));
  if (!saved || !saved.parts.length) throw new Error('onSave не вызван');
});

console.log('— итог —');
if (errors.length) {
  console.error('ОШИБКИ (' + errors.length + '):');
  for (const e of errors) console.error(' •', e);
  process.exit(1);
}
console.log('все сценарии редактора прошли');
process.exit(0);
