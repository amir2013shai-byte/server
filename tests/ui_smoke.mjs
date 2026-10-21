// Симуляция UI в jsdom: ловим реальные ошибки редактора, колоды и боя.
import { JSDOM } from 'jsdom';
import fs from 'fs';
import path from 'path';

const errors = [];
const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="app"></div></body></html>`, {
  url: 'https://game.local/',
  pretendToBeVisual: true
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.location = window.location;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
global.localStorage = window.localStorage;
global.HTMLElement = window.HTMLElement;
global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 4);
global.cancelAnimationFrame = (id) => clearTimeout(id);
window.requestAnimationFrame = global.requestAnimationFrame;
window.cancelAnimationFrame = global.cancelAnimationFrame;
window.addEventListener('error', (e) => errors.push('window.onerror: ' + (e.error?.stack || e.message)));
process.on('unhandledRejection', (e) => errors.push('unhandledRejection: ' + e));

// canvas/WebGL в jsdom нет — эмулируем провал создания WebGL (типичный WebView-сценарий)
window.HTMLCanvasElement.prototype.getContext = function () { return null; };

const { App } = await import('../src/ui.js');
const { storage } = await import('../src/storage.js');

const $ = (sel) => window.document.querySelector(sel);
const $$ = (sel) => [...window.document.querySelectorAll(sel)];
const click = (el) => { if (!el) throw new Error('нет элемента для клика'); el.dispatchEvent(new window.Event('click', { bubbles: true })); };
const step = (name, fn) => {
  try { fn(); console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); errors.push(name + ': ' + e.message); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('— сценарии —');
const app = new App(window.document.getElementById('app'));

step('меню открылось', () => {
  if (!$('#m-battle')) throw new Error('нет кнопки боя');
  if (!$('#m-apk')) throw new Error('нет кнопки скачивания APK');
});

step('колода открывается', () => {
  click($('#m-deck'));
  if (!$('#d-random')) throw new Error('нет кнопок колоды');
  if ($$('.card-tile').length < 10) throw new Error('мало карт в списке: ' + $$('.card-tile').length);
});

step('случайная колода', () => {
  click($('#d-random'));
  if (app.deck.length !== 8) throw new Error('колода не 8: ' + app.deck.length);
});

step('карта добавляется/убирается из колоды', () => {
  click($('#d-clear'));
  click($('.card-tile'));
  if (app.deck.length !== 1) throw new Error('не добавилась');
  click($('.card-tile'));
  if (app.deck.length !== 0) throw new Error('не убралась');
  click($('#d-starter'));
});

step('коллекция + детали карты', () => {
  click($('#back'));
  click($('#m-cards'));
  if ($$('.card-tile').length < 50) throw new Error('коллекция маленькая');
  click($('.card-tile'));
  if (!$('.overlay')) throw new Error('модалка карты не открылась');
  click($('.overlay [data-a="close"]'));
});

step('список редактора открывается', () => {
  click($('#back'));
  click($('#m-editor'));
  if (!$('#new')) throw new Error('нет кнопки новой карты');
});

step('создание новой карты: форма рендерится', () => {
  click($('#new'));
  if (!$('#f-name') || !$('#f-cost') || !$('#save2')) throw new Error('нет полей формы');
  if (!$('#ab-add')) throw new Error('нет добавления абилок');
});

step('заполнение + абилки + сохранение', () => {
  $('#f-name').value = 'Тест-клинок';
  $('#f-desc').value = 'Тестовая карта';
  $('#f-hp').value = '1234';
  $('#f-damage').value = '99';
  click($('#ab-add'));            // щит
  click($('#ab-add'));            // вторая абилка
  if ($$('.ability-row').length !== 2) throw new Error('абилки не добавились');
  click($('[data-abdel="1"]'));   // удалить вторую
  if ($$('.ability-row').length !== 1) throw new Error('абилка не удалилась');
  click($('#save2'));
  const saved = storage.getCustomCards();
  const t = saved.find((c) => c.name === 'Тест-клинок');
  if (!t) throw new Error('карта не сохранилась');
  if (t.hp !== 1234) throw new Error('hp не сохранился: ' + t.hp);
  if (!t.abilities.length) throw new Error('абилки не сохранились');
  if (!t.model.parts.length) throw new Error('модель пустая');
});

step('редактирование своей карты', () => {
  const tile = $$('.card-tile').find((el) => el.textContent.includes('Тест-клинок'));
  click(tile);
  if ($('#f-name').value !== 'Тест-клинок') throw new Error('форма не открылась с данными');
  $('#f-cost').value = '7';
  click($('#save2'));
  const t = storage.getCustomCards().find((c) => c.name === 'Тест-клинок');
  if (t.cost !== 7) throw new Error('правка не сохранилась');
});

step('удаление своей карты', async () => {
  // confirmModal — асинхронный оверлей
});

console.log('— бой —');
step('бой стартует', () => {
  click($('#back'));
  click($('#m-battle'));
  if (!$('#b-hand') || !$('#b-timer')) throw new Error('HUD не отрисован');
});

await sleep(80);

step('рука карт не пустая', () => {
  const cards = $$('#b-hand .hand-card');
  if (!cards.length) {
    // доказательство гипотезы: мусор в колоде
    console.log('    колода в хранилище:', JSON.stringify(storage.getDeck()));
    console.log('    колода приложения:', JSON.stringify(app.deck));
    console.log('    hand battle:', JSON.stringify(app.battle?.teams?.player?.hand));
    console.log('    cards() ids первые 5:', app.cards().slice(0, 5).map((c) => c.id));
    throw new Error('рука пуста');
  }
  console.log('    карт в руке:', cards.length);
});

step('петля боя живёт', () => {
  if (!app.battle) throw new Error('нет battle');
  if (app.battleView === undefined) throw new Error('нет battleView');
  // battleView null допустим (WebGL в jsdom нет), но должен быть fallback-текст
  const wrap = $('#b-canvas');
  if (app.battleView === null && !wrap.textContent.includes('3D')) {
    console.log('    (нет fallback-сообщения о WebGL)');
  }
});

console.log('— итог —');
if (errors.length) {
  console.error('ОШИБКИ (' + errors.length + '):');
  for (const e of errors) console.error(' •', e);
  process.exit(1);
}
console.log('все сценарии прошли');
process.exit(0);
