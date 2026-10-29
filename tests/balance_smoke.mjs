// Юнит-тесты: баланс-бюджет, коды обмена картами, аккаунты/друзья/кланы/админ.
const errors = [];
const step = (name, fn) => {
  try { fn(); console.log('  ✓', name); }
  catch (e) { console.error('  ✗', name, '\n   ', e.message); errors.push(name + ': ' + e.message); }
};

// localStorage-заглушка для node
const store = new Map();
global.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k)
};

const { DEFAULT_BALANCE, cardBudget, cardSpend, cardBalance, mergeBalance } = await import('../src/data/balance.js');
const { encodeCard, decodeCard } = await import('../src/share.js');
const { accounts, ADMIN_NAME, hashPassword } = await import('../src/accounts.js');
const ADMIN_PASSWORD = 'Kl3sh-R0y@l-X9!2026'; // пароль админа для тестов

console.log('— баланс —');
step('бюджет растёт от стоимости', () => {
  const c1 = cardBudget({ cost: 1 });
  const c5 = cardBudget({ cost: 5 });
  if (!(c5 > c1)) throw new Error('бюджет не растёт от эликсира');
});

step('HP и абилки вычитаются из бюджета', () => {
  const base = { cost: 3, type: 'troop', hp: 500, damage: 100, hitSpeed: 1, range: 1, speed: 1, count: 1, abilities: [] };
  const s0 = cardSpend(base).total;
  const s1 = cardSpend({ ...base, hp: 2000 }).total;
  const s2 = cardSpend({ ...base, abilities: [{ type: 'freezeHit', duration: 2 }] }).total;
  if (!(s1 > s0)) throw new Error('HP не увеличивает траты');
  if (!(s2 > s0)) throw new Error('абилка не увеличивает траты');
});

step('огромные статы ломают баланс', () => {
  const b = cardBalance({ cost: 1, type: 'troop', hp: 99999, damage: 9999, hitSpeed: 0.2, range: 20, speed: 5, count: 12, abilities: [] });
  if (b.ok) throw new Error('мусорная карта прошла баланс');
  if (b.remaining >= 0) throw new Error('остаток должен быть отрицательным');
});

step('mergeBalance принимает правки админа', () => {
  const P = mergeBalance({ base: 777, ability: { shield: 5 } });
  if (P.base !== 777) throw new Error('base не применился');
  if (P.ability.shield !== 5) throw new Error('ability.shield не применился');
  if (P.hp !== DEFAULT_BALANCE.hp) throw new Error('незаданные поля должны браться из дефолта');
});

console.log('— шаринг карт —');
step('код карты — round trip', () => {
  const card = {
    id: 'x', name: 'Огненный Дракон 🐉', desc: 'Дышит огнём', rarity: 'epic', type: 'troop',
    cost: 5, count: 1, hp: 1200, damage: 210, hitSpeed: 1.3, range: 3.2, speed: 1.4, splash: 1.2,
    targets: 'both', flying: true, buildingOnly: false, abilities: [{ type: 'lifesteal', percent: 1 }],
    spell: null, building: null,
    model: { parts: [{ shape: 'sphere', pos: [0, 1, 0], rot: [0, 0, 0], scale: [1, 1, 1], color: '#f60', emissive: '#300' }] }
  };
  const code = encodeCard(card);
  const back = decodeCard(code);
  if (!back) throw new Error('не декодируется');
  if (back.name !== card.name) throw new Error('имя: ' + back.name);
  if (back.desc !== card.desc) throw new Error('описание потерялось');
  if (back.hp !== card.hp || back.damage !== card.damage) throw new Error('статы потерялись');
  if (!back.flying || back.targets !== 'both') throw new Error('флаги потерялись');
  if (!back.abilities.length || back.abilities[0].type !== 'lifesteal') throw new Error('абилки потерялись');
  if (back.model.parts[0].shape !== 'sphere') throw new Error('модель потерялась');
  if (!back.id.startsWith('shared_')) throw new Error('id должен быть новым');
});

step('мусорный код отклоняется', () => {
  if (decodeCard('BC1.!!!')) throw new Error('принят мусор');
  if (decodeCard('просто текст')) throw new Error('принят не-код');
  if (decodeCard('')) throw new Error('принят пустой');
});

console.log('— аккаунты —');
step('админ создан по умолчанию и входит', () => {
  const r = accounts.login(ADMIN_NAME, ADMIN_PASSWORD);
  if (!r.ok) throw new Error('админ не входит: ' + r.error);
  if (!accounts.current().isAdmin) throw new Error('нет флага админа');
  accounts.logout();
});

step('регистрация/вход/смена пароля', () => {
  let r = accounts.register('Игрок', 'пароль1');
  if (!r.ok) throw new Error('регистрация: ' + r.error);
  accounts.logout();
  if (accounts.login('Игрок', 'неверно').ok) throw new Error('вошли с неверным паролем');
  r = accounts.login('Игрок', 'пароль1');
  if (!r.ok) throw new Error('вход: ' + r.error);
  r = accounts.changePassword('пароль1', 'пароль2');
  if (!r.ok) throw new Error('смена пароля: ' + r.error);
  accounts.logout();
  if (!accounts.login('Игрок', 'пароль2').ok) throw new Error('новый пароль не работает');
});

step('хеш пароля солится', () => {
  if (hashPassword('abc', 's1') === hashPassword('abc', 's2')) throw new Error('соль не влияет');
  if (hashPassword('abc', 's') === hashPassword('abd', 's')) throw new Error('пароль не влияет');
});

step('друзья: по имени и по коду', () => {
  accounts.login(ADMIN_NAME, ADMIN_PASSWORD);
  const adminCode = accounts.current().friendCode;
  accounts.logout();
  accounts.login('Игрок', 'пароль2');
  let r = accounts.addFriend(adminCode); // по коду → находим локальный аккаунт admin
  if (!r.ok) throw new Error('по коду: ' + r.error);
  if (r.friend.name !== ADMIN_NAME) throw new Error('не нашли аккаунт по коду');
  r = accounts.addFriend('Просто Друг'); // по имени
  if (!r.ok) throw new Error('по имени: ' + r.error);
  if (accounts.friends().length !== 2) throw new Error('счётчик друзей: ' + accounts.friends().length);
  accounts.removeFriend('Просто Друг');
  if (accounts.friends().length !== 1) throw new Error('удаление не сработало');
});

step('кланы: создать/вступить/выйти', () => {
  // админ — лидер клана
  accounts.logout();
  accounts.login(ADMIN_NAME, ADMIN_PASSWORD);
  const r = accounts.createClan('Стальные Волки', 'WOLF');
  if (!r.ok) throw new Error('создание: ' + r.error);
  if (accounts.myClan().tag !== 'WOLF') throw new Error('мой клан не найден');
  if (accounts.createClan('Другой', 'ZZZ').ok) throw new Error('второй клан разрешили');
  accounts.logout();
  // игрок вступает и выходит
  accounts.login('Игрок', 'пароль2');
  const j = accounts.joinClan('WOLF');
  if (!j.ok) throw new Error('вступление: ' + j.error);
  if (!accounts.myClan() || accounts.myClan().tag !== 'WOLF') throw new Error('игрок не в клане');
  accounts.leaveClan();
  if (accounts.myClan()) throw new Error('после выхода клан остался');
  // клан жив, пока в нём есть админ
  if (!accounts.getClan('WOLF')) throw new Error('клан исчез, хотя лидер внутри');
});

step('трофеи: +30 победа / −15 поражение', () => {
  accounts.login('Игрок', 'пароль2');
  const t0 = accounts.current().trophies || 0;
  accounts.addBattle(true, true);
  if ((accounts.current().trophies || 0) !== t0 + 30) throw new Error('победа не дала +30');
  accounts.addBattle(false, true);
  if ((accounts.current().trophies || 0) !== t0 + 15) throw new Error('поражение не сняло 15');
  accounts.addBattle(false, true, true); // ничья в рейтинге — без изменений
  if ((accounts.current().trophies || 0) !== t0 + 15) throw new Error('ничья изменила трофеи');
  accounts.addBattle(true, false); // дружеский — без трофеев
  if ((accounts.current().trophies || 0) !== t0 + 15) throw new Error('дружеский бой изменил трофеи');
});

step('админ меняет баланс', () => {
  accounts.logout();
  accounts.login(ADMIN_NAME, ADMIN_PASSWORD);
  accounts.setBalance({ base: 999 });
  if (accounts.getBalance().base !== 999) throw new Error('новый base не применился');
  accounts.setBalance(DEFAULT_BALANCE);
  if (accounts.getBalance().base !== DEFAULT_BALANCE.base) throw new Error('сброс не применился');
});

console.log('— итог —');
if (errors.length) {
  console.error('ОШИБКИ (' + errors.length + '):');
  for (const e of errors) console.error(' •', e);
  process.exit(1);
}
console.log('все сценарии прошли');
process.exit(0);
