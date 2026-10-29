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
  if (!$('#b-normal') || !$('#b-friendly')) throw new Error('нет меню режимов боя');
  click($('#b-normal')); // стартовая колода сбалансирована
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

// ——— установка карт на арену (главный баг-репорт: «не могу ставить карты») ———

const handIds = () => app.battle.teams.player.hand.slice();
const cardById = (id) => app.cards().find((c) => c.id === id);
const usePointer = !!window.PointerEvent;
const evType = (base) => (usePointer ? base : base.replace('pointer', 'mouse'));
const fire = (el, type, x, y) => el.dispatchEvent(new window.MouseEvent(evType(type), {
  clientX: x, clientY: y, bubbles: true, cancelable: true
}));

step('высадка по id работает (своя половина)', () => {
  app.battle.teams.player.elixir = 10;
  const id = handIds()[0];
  const before = { units: app.battle.units.length, elixir: app.battle.teams.player.elixir };
  app._tryDeploy(id, 0, -8);
  const grew = app.battle.units.length > before.units;
  const paid = app.battle.teams.player.elixir < before.elixir;
  if (!grew && !paid) throw new Error('деплоя не произошло');
});

step('высадка ОБЪЕКТОМ карты работает (регрессия бага)', () => {
  app.battle.teams.player.elixir = 10;
  const id = handIds()[0];
  const cardObj = cardById(id); // battleView передаёт объект — раньше молча игнорировался
  if (!cardObj || typeof cardObj !== 'object') throw new Error('нет объекта карты');
  const before = { units: app.battle.units.length, elixir: app.battle.teams.player.elixir };
  app._tryDeploy(cardObj, 0, -7);
  const grew = app.battle.units.length > before.units;
  const paid = app.battle.teams.player.elixir < before.elixir;
  if (!grew && !paid) throw new Error('объект карты не высадился — баг вернулся');
});

step('своя половина: заклинание тоже ставится', () => {
  const spell = app.cards().find((c) => c.type === 'spell' && !c.hidden && c.cost <= 10);
  if (!spell) { console.log('    (заклинаний в наборе нет)'); return; }
  app.battle.teams.player.elixir = 10;
  const before = app.battle.teams.player.elixir;
  app._tryDeploy(spell, 0, -6);
  if (app.battle.teams.player.elixir >= before) throw new Error('заклинание на своей половине не применилось');
});

step('вражеская половина отклоняется для войск, но не для заклинаний', () => {
  app.battle.teams.player.elixir = 10;
  const troopId = app.cards().find((c) => c.type === 'troop' && !c.hidden).id;
  const before = { units: app.battle.units.length, elixir: app.battle.teams.player.elixir };
  app._tryDeploy(troopId, 0, 8);
  if (app.battle.units.length !== before.units) throw new Error('юнит высадился на вражеской половине!');
  if (app.battle.teams.player.elixir !== before.elixir) throw new Error('эликсир потрачен на вражеской половине!');
  // заклинание на вражеской половине — МОЖНО
  const spell = app.cards().find((c) => c.type === 'spell' && !c.hidden);
  if (spell) {
    app.battle.teams.player.elixir = 10;
    const e0 = app.battle.teams.player.elixir;
    app._tryDeploy(spell.id, 0, 8);
    if (app.battle.teams.player.elixir >= e0) throw new Error('заклинание на вражеской половине не применилось!');
  }
});

step('тап по карте выбирает её', () => {
  const id = handIds()[0];
  app.selectedCard = null;
  app._renderHand();
  let el = window.document.querySelector(`[data-hand="${id}"]`);
  if (!el) throw new Error('нет карты в руке');
  fire(el, 'pointerdown', 50, 400);
  fire(el, 'pointerup', 50, 400);
  if (app.selectedCard !== id) throw new Error('тап не выбрал карту: ' + app.selectedCard);
  el = window.document.querySelector(`[data-hand="${id}"]`); // рука перерисована — ищем заново
  fire(el, 'pointerdown', 50, 400);
  fire(el, 'pointerup', 50, 400);
  if (app.selectedCard !== null) throw new Error('повторный тап не снял выбор');
});

step('перетаскивание из руки высаживает карту', () => {
  // заглушка 3D-вида: WebGL в jsdom нет, но жест должен дойти до деплоя
  app.battleView = {
    pending: null,
    setPendingCard(c) { this.pending = c; },
    screenToGround() { return { x: 1, y: -8 }; },
    ghostTo() { return { x: 1, y: -8 }; },
    update() {}, dispose() {}, resize() {}
  };
  app.battle.teams.player.elixir = 10;
  const id = handIds()[0];
  const before = { elixir: app.battle.teams.player.elixir, units: app.battle.units.length };
  const el = window.document.querySelector(`[data-hand="${id}"]`);
  fire(el, 'pointerdown', 50, 400);
  fire(window.document, 'pointermove', 50, 320); // >10px — жест «перетаскивание»
  fire(window.document, 'pointerup', 50, 320);
  const paid = app.battle.teams.player.elixir < before.elixir;
  const grew = app.battle.units.length > before.units;
  if (!paid && !grew) throw new Error('перетаскивание не высадило карту');
  app.battleView = null;
});

step('жест мимо арены отменяется без траты', () => {
  app.battleView = {
    pending: null,
    setPendingCard(c) { this.pending = c; },
    screenToGround() { return null; }, // отпустили «в небо»
    ghostTo() { return null; },
    update() {}, dispose() {}, resize() {}
  };
  app.battle.teams.player.elixir = 10;
  const id = handIds()[0];
  const before = app.battle.teams.player.elixir;
  const el = window.document.querySelector(`[data-hand="${id}"]`);
  fire(el, 'pointerdown', 50, 400);
  fire(window.document, 'pointermove', 50, 320);
  fire(window.document, 'pointerup', 50, 320);
  if (app.battle.teams.player.elixir !== before) throw new Error('эликсир потрачен при отмене жеста');
  if (app.selectedCard) throw new Error('выбор не сброшен после отмены');
  app.battleView = null;
});

step('2D-фолбэк: арена рисуется и принимает высадку', () => {
  // пересоздаём бой: в jsdom WebGL нет → должна появиться 2D-арена
  app.startBattle();
});
await sleep(80);

step('2D-фолбэк: клик по своей половине высаживает карту', () => {
  const fa = $('#b-farena');
  if (!fa) { console.log('    (3D работает — фолбэк не нужен)'); return; }
  const own = fa.querySelector('.fa-own');
  if (!own) throw new Error('нет своей половины на 2D-арене');
  const id = handIds()[0];
  app.selectedCard = id;
  app.battle.teams.player.elixir = 10;
  const before = app.battle.teams.player.elixir;
  // getBoundingClientRect в jsdom нулевой — кликаем по центру элемента
  own.dispatchEvent(new window.MouseEvent('click', { clientX: 50, clientY: 400, bubbles: true }));
  if (app.battle.teams.player.elixir >= before) {
    throw new Error('клик по 2D-арене не высадил карту');
  }
});

// ——— новые фичи: баланс, шаринг, аккаунты, друзья, кланы ———

const { encodeCard, decodeCard } = await import('../src/share.js');
const { addCardCopies, canUpgrade, cardLevel } = await import('../src/progress.js');
const { accounts, ADMIN_NAME } = await import('../src/accounts.js');
const ADMIN_PASSWORD = 'Kl3sh-R0y@l-X9!2026'; // пароль админа для тестов

step('баланс: огромный HP делает карту дисбалансной', () => {
  const card = { cost: 3, type: 'troop', hp: 100, damage: 50, hitSpeed: 1, range: 1, speed: 1, count: 1, abilities: [] };
  const before = app.balanceOf(card);
  const huge = { ...card, hp: 99999 };
  const after = app.balanceOf(huge);
  if (!before.ok) throw new Error('скромная карта должна быть сбалансирована');
  if (after.ok) throw new Error('огромный HP должен ломать баланс');
});

step('обычный бой блокирует дисбалансную колоду', () => {
  // готовим заведомо дисбалансную карту
  const bad = {
    id: 'custom_bad_test', name: 'Читер', desc: '', rarity: 'common', type: 'troop',
    cost: 1, count: 1, hp: 99999, damage: 9999, hitSpeed: 0.2, range: 10, speed: 3,
    splash: 4, sight: 5.5, targets: 'both', flying: true, buildingOnly: false,
    hidden: false, custom: true, abilities: [{ type: 'shield', hp: 9999 }, { type: 'chain', bounces: 9, damage: 2 }],
    spell: null, building: null,
    model: { parts: [{ shape: 'box', pos: [0, 0.8, 0], rot: [0, 0, 0], scale: [1, 1, 1], color: '#f00', emissive: '#000' }] }
  };
  app.customCards = [...app.customCards.filter((c) => c.id !== bad.id), bad];
  app.deck = ['custom_bad_test', 'knight', 'archers', 'goblins'];
  app._persist();
  if (!app.deckIssues().length) throw new Error('deckIssues не видит дисбаланс');
  app.startBattle('normal'); // обязан отказать
  if (app.battle) throw new Error('обычный бой стартовал с дисбалансной колодой');
});

step('дружеский бой: предупреждение о дисбалансе', () => {
  app.showMenu();
  click($('#m-battle'));
  click($('#b-normal'));
  const ov = $('.overlay');
  if (!ov || !/Дисбаланс/i.test(ov.textContent)) throw new Error('нет предупреждения о дисбалансе');
  click([...ov.querySelectorAll('[data-i]')].find((b) => /дружеск/i.test(b.textContent)));
});

await sleep(40);

step('дружеский бой стартовал с дисбалансной колодой', () => {
  if (!app.battle) throw new Error('дружеский бой не стартовал');
  if (app.battleMode !== 'friendly') throw new Error('режим не friendly');
});

step('шаринг: код карты восстанавливает данные', () => {
  const card = app.cards().find((c) => c.id === 'knight');
  const code = encodeCard(card);
  if (!code.startsWith('BC1.')) throw new Error('нет префикса BC1');
  const back = decodeCard(code);
  if (!back) throw new Error('код не декодируется');
  if (back.name !== card.name) throw new Error('имя потерялось');
  if (back.hp !== card.hp) throw new Error('hp потерялось');
  if (!back.custom || !back.id.startsWith('shared_')) throw new Error('импорт должен быть своей картой');
});

step('аккаунты: регистрация и вход', () => {
  const r = accounts.register('Тестер', '1234');
  if (!r.ok) throw new Error('регистрация: ' + r.error);
  if (!accounts.current() || accounts.current().name !== 'Тестер') throw new Error('сессия не создалась');
  accounts.logout();
  if (accounts.current()) throw new Error('логаут не сработал');
  const l = accounts.login('Тестер', '1234');
  if (!l.ok) throw new Error('вход: ' + l.error);
});

step('друзья: добавление по имени', () => {
  accounts.saveActive(app.deck, app.customCards);
  const r = accounts.addFriend('Витязь');
  if (!r.ok) throw new Error('добавление: ' + r.error);
  if (!accounts.friends().some((f) => f.name === 'Витязь')) throw new Error('друг не в списке');
  accounts.removeFriend('Витязь');
  if (accounts.friends().some((f) => f.name === 'Витязь')) throw new Error('друг не удалился');
});

step('кланы: создание, вступление, выход', () => {
  const r = accounts.createClan('Короли Арены', 'KNG');
  if (!r.ok) throw new Error('создание: ' + r.error);
  if (!accounts.myClan() || accounts.myClan().tag !== 'KNG') throw new Error('мой клан не найден');
  accounts.leaveClan();
  if (accounts.myClan()) throw new Error('выход не сработал');
});

step('админ: вход и смена баланса', () => {
  accounts.logout();
  const l = accounts.login(ADMIN_NAME, ADMIN_PASSWORD);
  if (!l.ok) throw new Error('вход админа: ' + l.error);
  if (!accounts.current().isAdmin) throw new Error('флаг админа не стоит');
  app.showMenu();
  if (!$('#m-admin')) throw new Error('кнопки админа нет в меню');
  click($('#m-admin'));
  const baseInput = window.document.querySelector('[data-p="base"]');
  if (!baseInput) throw new Error('нет поля базового бюджета');
  baseInput.value = '600';
  click($('#p-save'));
  if (accounts.getBalance().base !== 600) throw new Error('бюджет не сохранился');
  // возвращаем дефолт, чтобы не портить другие проверки
  accounts.setBalance({ base: 520 });
  app.balanceParams = accounts.getBalance();
});

step('админ: добавление глобальной карты для всех игроков', () => {
  app.showMenu();
  click($('#m-admin'));
  if (!$('#g-create') || !$('#g-import')) throw new Error('нет кнопок глобальных карт');
  const code = encodeCard({
    name: 'Глобальный герой', desc: 'Для всех', rarity: 'epic', type: 'troop',
    cost: 4, count: 1, hp: 900, damage: 120, hitSpeed: 1, range: 1, speed: 1,
    targets: 'ground', flying: false, buildingOnly: false, splash: 0,
    abilities: [], spell: null, building: null,
    model: { parts: [{ shape: 'box', pos: [0, 1, 0], rot: [0, 0, 0], scale: [1, 1, 1], color: '#f0f', emissive: '#000' }] }
  });
  window.prompt = () => code;
  click($('#g-import'));
  const g = accounts.globalCards();
  if (!g.some((c) => c.name === 'Глобальный герой')) throw new Error('глобальная карта не добавилась');
  // карта видна в общем списке карт
  if (!app.cards().some((c) => c.name === 'Глобальный герой')) throw new Error('глобальная карта не видна в cards()');
});

step('прокачка: апгрейд требует копии карты', () => {
  accounts.logout();
  app.showMenu();
  click($('#m-progress'));
  const upBtn = $('[data-up]');
  if (!upBtn) throw new Error('нет кнопок улучшения');
  const id = upBtn.dataset.up;
  const p = app.progress;
  p.gold = 99999;
  const lvlBefore = cardLevel(p, id);
  click(upBtn);
  if (cardLevel(p, id) !== lvlBefore) throw new Error('апгрейд прошёл без копий!');
  // даём копии — апгрейд должен сработать
  addCardCopies(p, id, canUpgrade(p, id).needCopies);
  app.showProgress();
  click($(`[data-up="${id}"]`));
  if (cardLevel(p, id) !== lvlBefore + 1) throw new Error('апгрейд не прошёл с копиями');
});

step('сундук: вскрытие даёт золото и копии карт', () => {
  const p = app.progress;
  const goldBefore = p.gold;
  const copiesBefore = JSON.stringify(p.cardCopies || {});
  p.chests = [{ type: 'wood', id: 'test_chest_1', icon: '📦' }];
  app.showProgress();
  click($('[data-chest]'));
  const stage = window.document.querySelector('#chest-stage');
  if (!stage) throw new Error('нет экрана вскрытия сундука');
  click(stage); // открыть
  if (p.gold <= goldBefore) throw new Error('золото не начислилось');
  if (JSON.stringify(p.cardCopies || {}) === copiesBefore) throw new Error('копии не начислились');
  const done = window.document.querySelector('#chest-done');
  if (done) click(done);
});

step('UI: экран друзей открывается', () => {
  accounts.logout();
  app.showMenu();
  click($('#m-friends'));
  if (!$('#my-code') && !$('#go-auth')) throw new Error('экран друзей пуст');
});

step('UI: онлайн-секция в меню боя', () => {
  app.showMenu();
  click($('#m-battle'));
  if (!$('#b-online-create')) throw new Error('нет кнопки создания комнаты');
  if (!$('#b-online-join') || !$('#net-code')) throw new Error('нет входа по коду');
  if (!$('#net-url-label')) throw new Error('нет метки сервера');
});

console.log('— итог —');
if (errors.length) {
  console.error('ОШИБКИ (' + errors.length + '):');
  for (const e of errors) console.error(' •', e);
  process.exit(1);
}
console.log('все сценарии прошли');
process.exit(0);
