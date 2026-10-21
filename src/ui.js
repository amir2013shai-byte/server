// UI приложения: меню, коллекция, конструктор колоды, редактор карт, бой, настройки.
import { storage } from './storage.js';
import { ALL_CARDS, COLLECTION_IDS, RARITY, getCard, withCustom } from './data/cards.js';
import { cardBalance, DEFAULT_BALANCE } from './data/balance.js';
import { accounts } from './accounts.js';
import { encodeCard, decodeCard, copyText } from './share.js';
import { Battle, MATCH_TIME } from './game/engine.js';
import { BattleAI } from './game/ai.js';
import { BattleView } from './render/battleView.js';
import { ModelEditor } from './render/modelEditor.js';

const TYPE_LABELS = { troop: 'Войско', spell: 'Заклинание', building: 'Здание' };
const TYPE_ICONS = { troop: '⚔️', spell: '✨', building: '🏰' };

const ABILITY_DEFS = {
  shield: { label: 'Щит (поглощает урон)', params: [['hp', 'HP щита', 200]] },
  freezeHit: { label: 'Заморозка при ударе/гибели', params: [['duration', 'Сек', 1.5], ['onDeath', 'Только при гибели (0/1)', 0]] },
  slowHit: { label: 'Замедление при ударе', params: [['factor', 'Множ. скорости', 0.55], ['duration', 'Сек', 2.5]] },
  stunHit: { label: 'Оглушение при ударе', params: [['duration', 'Сек', 0.5]] },
  chain: { label: 'Цепная молния', params: [['bounces', 'Отскоков', 3], ['damage', 'Урон (доля)', 0.75]] },
  lifesteal: { label: 'Вампиризм', params: [['percent', 'Доля урона', 1]] },
  knockback: { label: 'Отбрасывание', params: [['force', 'Сила', 2]] },
  charge: { label: 'Разгон (удар ×N)', params: [['multiplier', 'Множитель', 2], ['windup', 'Разгон, сек', 2.5]] },
  spawnOnDeath: { label: 'Призыв при гибели', params: [['cardId', 'ID карты (напр. skeletons)', 'skeletons'], ['count', 'Кол-во', 2]] },
  deathDamage: { label: 'Урон при гибели', params: [['damage', 'Урон', 200], ['radius', 'Радиус', 1.8]] },
  healAura: { label: 'Аура лечения', params: [['hps', 'HP/сек', 150], ['radius', 'Радиус', 3]] },
  spawnTroops: { label: 'Призыв войск (здания)', params: [['cardId', 'ID карты', 'skeletons'], ['interval', 'Сек', 5], ['max', 'Макс. на поле', 2]] },
  rageOnDeploy: { label: 'Ярость при высадке', params: [['duration', 'Сек', 6], ['radius', 'Радиус', 3], ['speedMul', 'Скорость ×', 1.3], ['attackMul', 'Атака ×', 1.3]] }
};

const SPELL_EFFECTS = {
  damage: 'Урон', heal: 'Лечение', freeze: 'Заморозка',
  stun: 'Урон + оглушение', rage: 'Ярость', poison: 'Яд (урон/сек)', knockback: 'Притяжение'
};

// ————— звук —————
class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }
  _ac() {
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { /* нет аудио */ }
    }
    return this.ctx;
  }
  play(type) {
    if (!this.enabled) return;
    const ac = this._ac();
    if (!ac) return;
    const t = ac.currentTime;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    const conf = {
      deploy: [220, 0.08, 'triangle', 0.12],
      hit: [160, 0.05, 'square', 0.05],
      spell: [340, 0.18, 'sawtooth', 0.1],
      boom: [90, 0.22, 'sawtooth', 0.16],
      tower: [70, 0.4, 'square', 0.2],
      win: [523, 0.5, 'triangle', 0.18],
      lose: [180, 0.5, 'sawtooth', 0.16],
      ui: [440, 0.05, 'sine', 0.08]
    }[type] || [300, 0.08, 'sine', 0.08];
    o.frequency.setValueAtTime(conf[0], t);
    if (type === 'win') o.frequency.linearRampToValueAtTime(784, t + conf[1]);
    if (type === 'lose') o.frequency.linearRampToValueAtTime(110, t + conf[1]);
    o.type = conf[2];
    g.gain.setValueAtTime(conf[3], t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + conf[1]);
    o.start(t); o.stop(t + conf[1] + 0.02);
  }
}

export class App {
  constructor(root) {
    this.root = root;
    this.sfx = new Sfx();
    this.customCards = sanitizeCards(storage.getCustomCards());
    storage.setCustomCards(this.customCards);
    this.deck = sanitizeDeck(storage.getDeck());
    storage.setDeck(this.deck);
    this.settings = storage.getSettings();
    this.sfx.enabled = this.settings.sound !== false;
    this.battle = null;
    this.battleView = null;
    this.battleRaf = 0;
    this.battleMode = 'normal';
    this.allCards = withCustom(this.customCards);
    this.balanceParams = accounts.getBalance();
    accounts.ensureGuest(this.deck, this.customCards);
    this.showMenu();
    // импорт карты по ссылке #card=BC1...
    this._checkHashImport();
  }

  _starterDeck() {
    return ['knight', 'archers', 'goblins', 'fireball', 'musketeer', 'giant', 'arrows', 'cannon']
      .filter((id) => getCard(id));
  }

  cards() {
    this.allCards = withCustom(this.customCards);
    return this.allCards;
  }

  // ————— профиль/баланс —————

  _persist() {
    storage.setDeck(this.deck);
    storage.setCustomCards(this.customCards);
    accounts.saveActive(this.deck, this.customCards);
  }

  balanceOf(card) {
    return cardBalance(card, this.balanceParams);
  }

  deckIssues() {
    return this.deck
      .map((id) => this.cards().find((c) => c.id === id))
      .filter((c) => c && !this.balanceOf(c).ok);
  }

  _checkHashImport() {
    try {
      const h = location.hash || '';
      if (!h.startsWith('#card=')) return;
      const draft = decodeCard(decodeURIComponent(h.slice(6)));
      history.replaceState(null, '', location.pathname + location.search);
      if (!draft) return;
      this.confirmModal('Импорт карты', `Получена карта «${draft.name}». Открыть её в редакторе?`, [
        { label: 'Открыть', value: true, primary: true },
        { label: 'Позже', value: false }
      ]).then((ok) => {
        if (ok) this.showCardEditor(null, draft);
      });
    } catch { /* мусорный hash */ }
  }

  // ————— утилиты UI —————

  setScreen(html) {
    this._stopBattle();
    this.root.innerHTML = html;
  }

  toast(msg, ms = 2200) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  confirmModal(title, text, buttons) {
    return new Promise((resolve) => {
      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.innerHTML = `
        <div class="modal">
          <h2>${title}</h2>
          <p>${text}</p>
          <div class="row" style="justify-content:center;flex-wrap:wrap">
            ${buttons.map((b, i) => `<button class="btn ${b.primary ? 'btn-primary' : 'btn-ghost'}" data-i="${i}">${b.label}</button>`).join('')}
          </div>
        </div>`;
      ov.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-i]');
        if (!btn) return;
        ov.remove();
        resolve(buttons[parseInt(btn.dataset.i, 10)].value);
      });
      document.body.appendChild(ov);
    });
  }

  cardIconHtml(card) {
    const letter = (card.name || '?').trim().charAt(0).toUpperCase();
    return `<div class="card-icon">${letter}<span style="position:absolute;margin:26px 0 0 26px;font-size:12px">${TYPE_ICONS[card.type] || ''}</span></div>`;
  }

  // ————— главное меню —————

  showMenu() {
    const stats = storage.getStats();
    const user = accounts.current();
    const clan = accounts.myClan();
    this.setScreen(`
      <div class="screen">
        <div class="screen-scroll">
          <div class="menu-hero">
            <div class="menu-logo">👑⚔️</div>
            <div class="menu-title">Королевские Схватки</div>
            <div class="menu-sub">3D-битвы • Свои карты • Редактор моделей</div>
          </div>
          <button class="account-bar" id="m-account">
            ${user
              ? `👤 <b>${escapeHtml(user.name)}</b> ${user.isAdmin ? '• <span style="color:#f0d890">админ</span>' : ''} • 🏆 ${user.trophies || 0}`
              : '👤 Гость — <b>войти в аккаунт</b>'}
            ${clan ? ` • 🛡 [${escapeHtml(clan.tag)}]` : ''}
          </button>
          <div class="menu-buttons">
            <button class="btn btn-primary btn-big" id="m-battle">⚔️ В бой!</button>
            <button class="btn btn-blue" id="m-deck">🃏 Моя колода (${this.deck.length}/8)</button>
            <button class="btn btn-ghost" id="m-cards">📚 Коллекция карт</button>
            <button class="btn btn-ghost" id="m-editor">🛠 Редактор карт</button>
            <button class="btn btn-ghost" id="m-friends">👥 Друзья (${accounts.friends().length})</button>
            <button class="btn btn-ghost" id="m-clan">🛡 Клан${clan ? ` [${escapeHtml(clan.tag)}]` : ''}</button>
            ${user && user.isAdmin ? '<button class="btn btn-chip" id="m-admin">⚙️ Админ-панель</button>' : ''}
            <button class="btn btn-ghost" id="m-settings">⚙️ Настройки</button>
            ${/^https?:$/.test(location.protocol) ? '<button class="btn btn-primary" id="m-apk">📥 Скачать APK на телефон</button>' : ''}
          </div>
          <div class="menu-stats">
            Побед: <b style="color:#7dff9e">${stats.wins}</b> из <b>${stats.battles}</b> боёв
            <br>Карт в базе: ${this.cards().filter((c) => !c.hidden).length} • включая ваших: ${this.customCards.length}
          </div>
        </div>
      </div>
    `);
    this.root.querySelector('#m-battle').onclick = () => { this.sfx.play('ui'); this.showBattleMenu(); };
    this.root.querySelector('#m-deck').onclick = () => { this.sfx.play('ui'); this.showDeck(); };
    this.root.querySelector('#m-cards').onclick = () => { this.sfx.play('ui'); this.showCollection(); };
    this.root.querySelector('#m-editor').onclick = () => { this.sfx.play('ui'); this.showCardList(); };
    this.root.querySelector('#m-friends').onclick = () => { this.sfx.play('ui'); this.showFriends(); };
    this.root.querySelector('#m-clan').onclick = () => { this.sfx.play('ui'); this.showClan(); };
    this.root.querySelector('#m-settings').onclick = () => { this.sfx.play('ui'); this.showSettings(); };
    this.root.querySelector('#m-account').onclick = () => {
      this.sfx.play('ui');
      if (accounts.current()) this.showAccount();
      else this.showAuth();
    };
    const adminBtn = this.root.querySelector('#m-admin');
    if (adminBtn) adminBtn.onclick = () => { this.sfx.play('ui'); this.showAdmin(); };
    const apkBtn = this.root.querySelector('#m-apk');
    if (apkBtn) apkBtn.onclick = () => { this.sfx.play('ui'); location.href = './battle-cards-royale-1.0.apk'; };
  }

  // ————— вход/регистрация —————

  showAuth(mode = 'login') {
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">Аккаунт</div>
            <div class="top-sub">Прогресс сохраняется на устройстве</div>
          </div>
        </div>
        <div class="screen-scroll">
          <div class="filter-row">
            <button class="btn btn-chip ${mode === 'login' ? 'active' : ''}" data-m="login">Вход</button>
            <button class="btn btn-chip ${mode === 'register' ? 'active' : ''}" data-m="register">Регистрация</button>
          </div>
          <div class="form-section">
            <h3>${mode === 'login' ? 'Вход в аккаунт' : 'Новый аккаунт'}</h3>
            <div class="form-grid">
              <div class="form-field full"><label>Имя</label><input class="input" id="a-name" maxlength="24" placeholder="Например, Рыцарь2026"></div>
              <div class="form-field full"><label>Пароль</label><input class="input" id="a-pass" type="password" maxlength="64" placeholder="Минимум 4 символа"></div>
            </div>
            <button class="btn btn-primary btn-block btn-big" id="a-go" style="margin-top:12px">
              ${mode === 'login' ? '🔓 Войти' : '✨ Создать аккаунт'}
            </button>
            <div class="muted mt12" style="text-align:center">
              Аккаунты локальные (офлайн-игра без сервера):<br>каждый профиль хранится на этом телефоне.
            </div>
          </div>
          <button class="btn btn-ghost btn-block" id="a-guest">Продолжить как гость</button>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
    this.root.querySelectorAll('[data-m]').forEach((b) => {
      b.onclick = () => this.showAuth(b.dataset.m);
    });
    this.root.querySelector('#a-guest').onclick = () => {
      accounts.logout();
      this.showMenu();
    };
    this.root.querySelector('#a-go').onclick = () => {
      const name = this.root.querySelector('#a-name').value;
      const pw = this.root.querySelector('#a-pass').value;
      const r = mode === 'login' ? accounts.login(name, pw) : accounts.register(name, pw);
      if (!r.ok) {
        this.toast(r.error);
        return;
      }
      this._applyProfileFromAccount(r.user);
      this.toast(mode === 'login' ? `С возвращением, ${r.user.name}!` : `Аккаунт ${r.user.name} создан!`);
      this.showMenu();
    };
  }

  _applyProfileFromAccount(user) {
    // профиль аккаунта становится активным (storage + память)
    const prof = (user && user.profile) || { deck: null, customCards: [] };
    this.customCards = sanitizeCards(prof.customCards);
    this.deck = sanitizeDeck(prof.deck);
    if (!this.deck.length) this.deck = this._starterDeck();
    this._persist();
    this.cards();
  }

  showAccount() {
    const u = accounts.current();
    if (!u) return this.showAuth();
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">Мой аккаунт</div>
            <div class="top-sub">${escapeHtml(u.name)}</div>
          </div>
        </div>
        <div class="screen-scroll">
          <div class="form-section">
            <h3>👤 ${escapeHtml(u.name)} ${u.isAdmin ? '<span style="color:#f0d890">• админ</span>' : ''}</h3>
            <div class="info-list">
              Трофеи: <b>🏆 ${u.trophies || 0}</b><br>
              Побед: <b>${u.wins || 0}</b> из <b>${u.battles || 0}</b><br>
              Код друга: <b class="friend-code">${u.friendCode}</b><br>
              Клан: <b>${accounts.myClan() ? '[' + escapeHtml(accounts.myClan().tag) + '] ' + escapeHtml(accounts.myClan().name) : 'нет'}</b>
            </div>
          </div>
          <div class="form-section">
            <h3>Сменить пароль</h3>
            <div class="form-grid">
              <div class="form-field full"><label>Старый пароль</label><input class="input" id="p-old" type="password"></div>
              <div class="form-field full"><label>Новый пароль</label><input class="input" id="p-new" type="password"></div>
            </div>
            <button class="btn btn-blue btn-block" id="p-save" style="margin-top:10px">Сменить пароль</button>
          </div>
          <button class="btn btn-ghost btn-block" id="logout" style="margin-bottom:30px">Выйти из аккаунта</button>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
    this.root.querySelector('#p-save').onclick = () => {
      const r = accounts.changePassword(
        this.root.querySelector('#p-old').value,
        this.root.querySelector('#p-new').value
      );
      this.toast(r.ok ? 'Пароль изменён' : r.error);
    };
    this.root.querySelector('#logout').onclick = async () => {
      const ok = await this.confirmModal('Выйти из аккаунта?', 'Прогресс аккаунта сохранится на устройстве.', [
        { label: 'Выйти', value: true, primary: true },
        { label: 'Отмена', value: false }
      ]);
      if (!ok) return;
      accounts.saveActive(this.deck, this.customCards);
      accounts.logout();
      this.toast('Вы вышли из аккаунта');
      this.showMenu();
    };
  }

  // ————— выбор режима боя —————

  showBattleMenu() {
    const issues = this.deckIssues();
    const friends = accounts.friends();
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">В бой!</div>
            <div class="top-sub">Выберите режим</div>
          </div>
        </div>
        <div class="screen-scroll">
          <button class="btn btn-primary btn-big btn-block" id="b-normal" style="margin-bottom:12px">
            ⚔️ Обычный бой
            <div class="muted" style="font-size:11px;margin-top:4px">
              ${issues.length
                ? `<span style="color:#ff9c9c">⚠ В колоде дисбалансные карты: ${issues.map((c) => escapeHtml(c.name)).join(', ')}</span>`
                : 'Только сбалансированные карты • соперник — ИИ'}
            </div>
          </button>
          <button class="btn btn-blue btn-big btn-block" id="b-friendly" style="margin-bottom:16px">
            🤝 Дружеский бой
            <div class="muted" style="font-size:11px;margin-top:4px">Можно играть дисбалансными картами</div>
          </button>
          <div class="form-section">
            <h3>Дружеский бой с другом</h3>
            ${friends.length
              ? `<div class="row wrap">${friends.map((f) => `
                  <button class="btn btn-chip" data-friend="${escapeHtml(f.name)}">🤝 ${escapeHtml(f.name)}</button>`).join('')}</div>`
              : '<div class="muted">Список друзей пуст. Добавьте друзей в разделе «👥 Друзья».</div>'}
            <button class="btn btn-ghost btn-block" id="b-friend-rand" style="margin-top:10px">🎲 Дружеский бой со случайным соперником</button>
          </div>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
    this.root.querySelector('#b-normal').onclick = () => {
      const bad = this.deckIssues();
      if (this.deck.length < 4) {
        this.toast('В колоде должно быть минимум 4 карты');
        return;
      }
      if (bad.length) {
        this.confirmModal(
          'Дисбалансные карты',
          `В колоде карты без баланса: ${bad.map((c) => `«${c.name}»`).join(', ')}. Они разрешены только в дружеском бою.`,
          [
            { label: 'Играть дружеский', value: 'friendly', primary: true },
            { label: 'Править колоду', value: 'deck' },
            { label: 'Отмена', value: null }
          ]
        ).then((v) => {
          if (v === 'friendly') this.startBattle('friendly');
          else if (v === 'deck') this.showDeck();
        });
        return;
      }
      this.sfx.play('ui');
      this.startBattle('normal');
    };
    this.root.querySelector('#b-friendly').onclick = () => { this.sfx.play('ui'); this.startBattle('friendly'); };
    this.root.querySelector('#b-friend-rand').onclick = () => { this.sfx.play('ui'); this.startBattle('friendly', null); };
    this.root.querySelectorAll('[data-friend]').forEach((el) => {
      el.onclick = () => {
        const f = accounts.friends().find((x) => x.name === el.dataset.friend);
        this.sfx.play('ui');
        this.startBattle('friendly', f || null);
      };
    });
  }

  // ————— коллекция —————

  showCollection(filter = 'all') {
    const list = this.cards().filter((c) => !c.hidden);
    const filtered = list.filter((c) => {
      if (filter === 'all') return true;
      if (filter === 'custom') return !!c.custom;
      return c.type === filter;
    });
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">Коллекция</div>
            <div class="top-sub">${filtered.length} карт</div>
          </div>
        </div>
        <div class="screen-scroll">
          <div class="filter-row">
            ${[['all', 'Все'], ['troop', 'Войска'], ['spell', 'Заклинания'], ['building', 'Здания'], ['custom', 'Мои']]
              .map(([k, l]) => `<button class="btn btn-chip ${filter === k ? 'active' : ''}" data-f="${k}">${l}</button>`).join('')}
          </div>
          <div class="cards-grid">
            ${filtered.map((c) => `
              <div class="card-tile rarity-${c.rarity} ${this.deck.includes(c.id) ? 'in-deck' : ''}" data-id="${c.id}">
                <div class="card-cost">${c.cost}</div>
                ${!this.balanceOf(c).ok ? '<div class="bal-badge">⚠</div>' : ''}
                ${this.cardIconHtml(c)}
                <div class="card-name">${c.name}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
    this.root.querySelectorAll('[data-f]').forEach((b) => {
      b.onclick = () => this.showCollection(b.dataset.f);
    });
    this.root.querySelectorAll('[data-id]').forEach((el) => {
      el.onclick = () => this.showCardDetail(el.dataset.id);
    });
  }

  showCardDetail(id) {
    const c = this.cards().find((x) => x.id === id);
    if (!c) return;
    const abilities = (c.abilities || []).map((a) => {
      const def = ABILITY_DEFS[a.type];
      return def ? def.label : a.type;
    });
    const stats = c.type === 'spell'
      ? `Радиус: <b>${c.spell?.radius}</b> • Эффект: <b>${SPELL_EFFECTS[c.spell?.effect] || c.spell?.effect}</b>` +
        (c.spell?.damage ? ` • Урон: <b>${c.spell.damage}</b>` : '') +
        (c.spell?.heal ? ` • Лечение: <b>${c.spell.heal}</b>` : '')
      : `HP: <b>${c.hp}</b> • Урон: <b>${c.damage}</b> • Скор. атаки: <b>${c.hitSpeed}с</b><br>
         Дальность: <b>${c.range}</b> • Скорость: <b>${c.speed || 0}</b> • Цели: <b>${c.targets === 'both' ? 'земля+воздух' : 'земля'}</b>${c.flying ? ' • <b>летает</b>' : ''}${c.buildingOnly ? ' • <b>только здания</b>' : ''}${c.splash ? ` • Урон по площади: <b>${c.splash}</b>` : ''}`;

    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="modal" style="text-align:left">
        <div class="row">
          <div class="card-tile rarity-${c.rarity}" style="width:86px">
            <div class="card-cost">${c.cost}</div>
            ${this.cardIconHtml(c)}
          </div>
          <div style="flex:1">
            <h2 style="margin:0">${c.name}</h2>
            <div class="muted">${RARITY[c.rarity]?.label || c.rarity} • ${TYPE_LABELS[c.type]} • ${c.cost} эликсира${c.count > 1 ? ` • ×${c.count}` : ''}</div>
          </div>
        </div>
        <p style="color:#b8c0d8; margin:12px 0">${c.desc || ''}</p>
        <div class="info-list">${stats}</div>
        ${(() => {
          const bal = this.balanceOf(c);
          return `<div class="mt12" style="font-size:12px">
            <b style="color:#f0d890">Баланс:</b> бюджет <b>${bal.budget}</b> • потрачено <b>${bal.spent}</b> •
            остаток <b style="color:${bal.ok ? '#7dff9e' : '#ff7d7d'}">${bal.remaining > 0 ? '+' : ''}${bal.remaining}</b>
            ${bal.ok ? '✅' : '⚠️ <span style="color:#ff9c9c">только для дружеского боя</span>'}
          </div>`;
        })()}
        ${abilities.length ? `<div class="mt12"><b style="color:#f0d890">Абилки:</b> ${abilities.join(', ')}</div>` : ''}
        <div class="row mt16" style="flex-wrap:wrap">
          <button class="btn btn-primary" data-a="deck">${this.deck.includes(c.id) ? 'Убрать из колоды' : 'В колоду'}</button>
          <button class="btn btn-blue" data-a="share">🔗 Поделиться</button>
          <button class="btn btn-ghost" data-a="close">Закрыть</button>
        </div>
      </div>`;
    ov.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'close') return ov.remove();
      if (b.dataset.a === 'share') {
        this.showShareModal(c);
        return;
      }
      if (b.dataset.a === 'deck') {
        if (this.deck.includes(c.id)) {
          this.deck = this.deck.filter((x) => x !== c.id);
          this.toast('Карта убрана из колоды');
        } else if (this.deck.length >= 8) {
          this.toast('В колоде уже 8 карт');
        } else {
          this.deck.push(c.id);
          this.toast('Карта добавлена в колоду');
        }
        this._persist();
        ov.remove();
        this.showCollection();
      }
    });
    document.body.appendChild(ov);
  }

  // ————— колода —————

  showDeck() {
    const render = () => {
      const all = this.cards().filter((c) => !c.hidden);
      const avg = this.deck.length
        ? (this.deck.reduce((s, id) => s + (this.cards().find((c) => c.id === id)?.cost || 0), 0) / this.deck.length).toFixed(1)
        : '0';
      this.setScreen(`
        <div class="screen">
          <div class="top-bar">
            <button class="btn btn-ghost" id="back">←</button>
            <div>
              <div class="top-title">Моя колода</div>
              <div class="top-sub">${this.deck.length}/8 карт</div>
            </div>
            <span class="deck-avg">💧 ${avg}</span>
          </div>
          <div class="screen-scroll">
            <div class="deck-bar">
              ${Array.from({ length: 8 }).map((_, i) => {
                const c = this.deck[i] ? this.cards().find((x) => x.id === this.deck[i]) : null;
                return c
                  ? `<div class="deck-slot filled rarity-${c.rarity}" data-drop="${c.id}">
                       <div class="card-cost">${c.cost}</div>
                       ${!this.balanceOf(c).ok ? '<div class="bal-badge">⚠</div>' : ''}
                       ${this.cardIconHtml(c)}
                       <div>${c.name}</div>
                     </div>`
                  : `<div class="deck-slot">пусто</div>`;
              }).join('')}
            </div>
            <div class="row wrap mb12">
              <button class="btn btn-chip" id="d-random">🎲 Случайная</button>
              <button class="btn btn-chip" id="d-clear">Очистить</button>
              <button class="btn btn-chip" id="d-starter">Базовая</button>
            </div>
            <div class="muted mb8">Нажмите на карту, чтобы добавить/убрать:</div>
            <div class="cards-grid">
              ${all.map((c) => `
                <div class="card-tile rarity-${c.rarity} ${this.deck.includes(c.id) ? 'in-deck' : ''}" data-id="${c.id}">
                  <div class="card-cost">${c.cost}</div>
                  ${!this.balanceOf(c).ok ? '<div class="bal-badge">⚠</div>' : ''}
                  ${this.cardIconHtml(c)}
                  <div class="card-name">${c.name}</div>
                </div>`).join('')}
            </div>
          </div>
        </div>
      `);
      this.root.querySelector('#back').onclick = () => this.showMenu();
      this.root.querySelector('#d-random').onclick = () => {
        const pool = all.map((c) => c.id);
        this.deck = [];
        while (this.deck.length < 8 && pool.length) {
          const i = Math.floor(Math.random() * pool.length);
          this.deck.push(pool.splice(i, 1)[0]);
        }
        this._persist();
        this.toast('Случайная колода готова!');
        render();
      };
      this.root.querySelector('#d-clear').onclick = () => {
        this.deck = [];
        this._persist();
        render();
      };
      this.root.querySelector('#d-starter').onclick = () => {
        this.deck = this._starterDeck();
        this._persist();
        render();
      };
      this.root.querySelectorAll('[data-id]').forEach((el) => {
        el.onclick = () => {
          const id = el.dataset.id;
          if (this.deck.includes(id)) {
            this.deck = this.deck.filter((x) => x !== id);
          } else if (this.deck.length >= 8) {
            this.toast('В колоде уже 8 карт');
            return;
          } else {
            this.deck.push(id);
          }
          this._persist();
          render();
        };
      });
      this.root.querySelectorAll('[data-drop]').forEach((el) => {
        el.onclick = () => {
          this.deck = this.deck.filter((x) => x !== el.dataset.drop);
          this._persist();
          render();
        };
      });
    };
    render();
  }

  // ————— список карт для редактора —————

  showCardList() {
    const list = this.cards().filter((c) => !c.hidden);
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">Редактор карт</div>
            <div class="top-sub">Свои карты и абилки</div>
          </div>
          <button class="btn btn-ghost" id="import">📥</button>
          <button class="btn btn-primary" id="new">＋ Новая</button>
        </div>
        <div class="screen-scroll">
          <div class="muted mb12">Нажмите на карту, чтобы изменить характеристики, абилки и 3D-модель. Пользовательские карты помечены ✏️.</div>
          <div class="cards-grid">
            ${list.map((c) => `
              <div class="card-tile rarity-${c.rarity}" data-edit="${c.id}">
                <div class="card-cost">${c.cost}</div>
                ${!this.balanceOf(c).ok ? '<div class="bal-badge">⚠</div>' : ''}
                ${this.cardIconHtml(c)}
                <div class="card-name">${c.custom ? '✏️ ' : ''}${c.name}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
    this.root.querySelector('#new').onclick = () => this.showCardEditor(null);
    this.root.querySelector('#import').onclick = () => this.showImportModal();
    this.root.querySelectorAll('[data-edit]').forEach((el) => {
      el.onclick = () => this.showCardEditor(el.dataset.edit);
    });
  }

  // ————— редактор карты —————

  showCardEditor(cardId, draftOverride = null) {
    const source = cardId ? this.cards().find((c) => c.id === cardId) : null;
    let draft;
    if (draftOverride) {
      draft = JSON.parse(JSON.stringify(draftOverride));
    } else if (source && source.custom) {
      draft = JSON.parse(JSON.stringify(source));
    } else if (source) {
      // базовая карта: редактируем копию как пользовательскую
      draft = JSON.parse(JSON.stringify(source));
      draft.id = 'custom_' + Date.now();
      draft.name = source.name + ' (моя)';
      draft.custom = true;
    } else {
      draft = {
          id: 'custom_' + Date.now(),
          name: 'Новая карта',
          desc: 'Описание вашей карты',
          rarity: 'common',
          type: 'troop',
          cost: 3, count: 1,
          hp: 800, damage: 150, hitSpeed: 1.2, range: 1, speed: 1.1,
          targets: 'ground', flying: false, buildingOnly: false, splash: 0, sight: 5.5,
          abilities: [], spell: null, building: null, hidden: false,
          custom: true,
          model: { parts: [{ shape: 'box', pos: [0, 0.85, 0], rot: [0, 0, 0], scale: [0.62, 0.62, 0.36], color: '#3b6fd4', emissive: '#000000' }, { shape: 'sphere', pos: [0, 1.32, 0], rot: [0, 0, 0], scale: [0.34, 0.36, 0.34], color: '#e8b88a', emissive: '#000000' }] }
      };
    }

    const abilityRow = (a, i) => `
      <div class="ability-row" data-ab="${i}">
        <span class="ability-tag">${ABILITY_DEFS[a.type]?.label || a.type}</span>
        ${(ABILITY_DEFS[a.type]?.params || []).map(([key, label, def]) => {
          const val = a[key] !== undefined ? a[key] : def;
          return `<label class="muted" style="display:flex;flex-direction:column;gap:3px">${label}
            <input class="input" data-abf="${key}" value="${val}" style="width:86px;padding:7px">
          </label>`;
        }).join('')}
        <button class="btn btn-chip danger" data-abdel="${i}">✕</button>
      </div>`;

    const render = () => {
      this.setScreen(`
        <div class="screen">
          <div class="top-bar">
            <button class="btn btn-ghost" id="back">←</button>
            <div>
              <div class="top-title">${draft.custom ? 'Редактор карты' : 'Карта'}</div>
              <div class="top-sub">${draft.name}</div>
            </div>
            <button class="btn btn-primary" id="save">💾</button>
          </div>
          <div class="screen-scroll">
            <div class="form-section">
              <h3>Основное</h3>
              <div class="form-grid">
                <div class="form-field full"><label>Название</label><input class="input" id="f-name" value="${escapeHtml(draft.name)}"></div>
                <div class="form-field full"><label>Описание</label><textarea class="input" id="f-desc">${escapeHtml(draft.desc || '')}</textarea></div>
                <div class="form-field"><label>Редкость</label>
                  <select class="input" id="f-rarity">
                    ${Object.entries(RARITY).map(([k, v]) => `<option value="${k}" ${draft.rarity === k ? 'selected' : ''}>${v.label}</option>`).join('')}
                  </select>
                </div>
                <div class="form-field"><label>Тип</label>
                  <select class="input" id="f-type">
                    ${Object.entries(TYPE_LABELS).map(([k, v]) => `<option value="${k}" ${draft.type === k ? 'selected' : ''}>${v}</option>`).join('')}
                  </select>
                </div>
                <div class="form-field"><label>Стоимость (эликсир)</label><input class="input" type="number" min="0" max="10" id="f-cost" value="${draft.cost}"></div>
                <div class="form-field"><label>Кол-во при высадке</label><input class="input" type="number" min="1" max="12" id="f-count" value="${draft.count || 1}"></div>
              </div>
            </div>

            <div class="form-section" id="bal-section">
              <h3>⚖️ Баланс</h3>
              <div id="bal-meter"></div>
              <div class="muted" style="margin-top:8px">Бюджет — число, из которого вычитается цена HP, урона и механик.
              Дисбалансные карты можно играть только в дружеском бою.</div>
            </div>

            ${draft.type === 'troop' || draft.type === 'building' ? `
            <div class="form-section">
              <h3>Характеристики</h3>
              <div class="form-grid">
                <div class="form-field"><label>HP</label><input class="input" type="number" id="f-hp" value="${draft.hp || 500}"></div>
                <div class="form-field"><label>Урон</label><input class="input" type="number" id="f-damage" value="${draft.damage || 100}"></div>
                <div class="form-field"><label>Скор. атаки (сек)</label><input class="input" type="number" step="0.05" id="f-hit" value="${draft.hitSpeed || 1}"></div>
                <div class="form-field"><label>Дальность</label><input class="input" type="number" step="0.1" id="f-range" value="${draft.range ?? 1}"></div>
                <div class="form-field"><label>Скорость</label><input class="input" type="number" step="0.05" id="f-speed" value="${draft.speed ?? 1}"></div>
                <div class="form-field"><label>Радиус атаки (пл.)</label><input class="input" type="number" step="0.1" id="f-splash" value="${draft.splash || 0}"></div>
                <div class="form-field"><label>Цели</label>
                  <select class="input" id="f-targets">
                    <option value="ground" ${draft.targets === 'ground' ? 'selected' : ''}>Только земля</option>
                    <option value="both" ${draft.targets === 'both' ? 'selected' : ''}>Земля и воздух</option>
                  </select>
                </div>
                <div class="form-field"><label>Полёт</label>
                  <select class="input" id="f-flying"><option value="0" ${!draft.flying ? 'selected' : ''}>Нет</option><option value="1" ${draft.flying ? 'selected' : ''}>Да</option></select>
                </div>
                <div class="form-field"><label>Только здания</label>
                  <select class="input" id="f-bo"><option value="0" ${!draft.buildingOnly ? 'selected' : ''}>Нет</option><option value="1" ${draft.buildingOnly ? 'selected' : ''}>Да</option></select>
                </div>
                ${draft.type === 'building' ? `<div class="form-field"><label>Время жизни (сек)</label><input class="input" type="number" id="f-life" value="${draft.building?.lifetime ?? 30}"></div>` : ''}
              </div>
            </div>` : ''}

            ${draft.type === 'spell' ? `
            <div class="form-section">
              <h3>Заклинание</h3>
              <div class="form-grid">
                <div class="form-field"><label>Радиус</label><input class="input" type="number" step="0.1" id="f-sradius" value="${draft.spell?.radius ?? 2.5}"></div>
                <div class="form-field"><label>Эффект</label>
                  <select class="input" id="f-seffect">
                    ${Object.entries(SPELL_EFFECTS).map(([k, v]) => `<option value="${k}" ${(draft.spell?.effect || 'damage') === k ? 'selected' : ''}>${v}</option>`).join('')}
                  </select>
                </div>
                <div class="form-field"><label>Урон</label><input class="input" type="number" id="f-sdamage" value="${draft.spell?.damage ?? 200}"></div>
                <div class="form-field"><label>Лечение</label><input class="input" type="number" id="f-sheal" value="${draft.spell?.heal ?? 0}"></div>
                <div class="form-field"><label>Длительность (сек)</label><input class="input" type="number" step="0.1" id="f-sdur" value="${draft.spell?.duration ?? 0}"></div>
              </div>
            </div>` : ''}

            <div class="form-section">
              <h3>Абилки</h3>
              <div id="ab-list">
                ${(draft.abilities || []).map(abilityRow).join('')}
              </div>
              <div class="row wrap">
                <select class="input" id="ab-new" style="flex:1;min-width:180px">
                  ${Object.entries(ABILITY_DEFS).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
                </select>
                <button class="btn btn-blue" id="ab-add">＋ Добавить</button>
              </div>
            </div>

            <div class="form-section">
              <h3>3D-модель</h3>
              <div class="muted mb12">Простой редактор моделей: примитивы, цвета, размеры и повороты.</div>
              <button class="btn btn-blue btn-block" id="open-model">🧊 Открыть 3D-редактор</button>
              <button class="btn btn-ghost btn-block" id="share-card" style="margin-top:8px">🔗 Поделиться картой</button>
            </div>

            <div class="row" style="margin:6px 0 30px">
              <button class="btn btn-primary btn-block btn-big" id="save2">💾 Сохранить карту</button>
            </div>
            ${this.customCards.some((c) => c.id === draft.id) ? `<button class="btn btn-chip danger" id="delete">Удалить карту</button>` : ''}
          </div>
        </div>
      `);

      const bind = (id, fn) => {
        const el = this.root.querySelector(id);
        if (el) el.onchange = () => fn(el);
      };
      this.root.querySelector('#back').onclick = () => this.showCardList();
      this.root.querySelector('#save').onclick = () => save();
      this.root.querySelector('#save2').onclick = () => save();
      this.root.querySelector('#open-model').onclick = () => {
        collect();
        this.showModelEditorScreen(draft, (m) => {
          draft.model = m;
          this.showCardEditor(null, draft);
        });
      };

      const del = this.root.querySelector('#delete');
      if (del) {
        del.onclick = async () => {
          const ok = await this.confirmModal('Удалить карту?', `«${draft.name}» будет удалена без возможности восстановления.`, [
            { label: 'Удалить', value: true, primary: true },
            { label: 'Отмена', value: false }
          ]);
          if (ok) {
            this.customCards = this.customCards.filter((c) => c.id !== draft.id);
            this.deck = this.deck.filter((x) => x !== draft.id);
            this._persist();
            this.toast('Карта удалена');
            this.showCardList();
          }
        };
      }

      // абилки
      this.root.querySelector('#ab-add').onclick = () => {
        collect();
        const type = this.root.querySelector('#ab-new').value;
        const def = ABILITY_DEFS[type];
        const a = { type };
        for (const [key, , defVal] of def.params) a[key] = defVal;
        draft.abilities = draft.abilities || [];
        draft.abilities.push(a);
        render();
      };
      this.root.querySelectorAll('[data-abdel]').forEach((b) => {
        b.onclick = () => {
          collect();
          draft.abilities.splice(parseInt(b.dataset.abdel, 10), 1);
          render();
        };
      });

      const collect = () => {
        const q = (sel) => this.root.querySelector(sel);
        draft.name = q('#f-name')?.value || draft.name;
        draft.desc = q('#f-desc')?.value || '';
        draft.rarity = q('#f-rarity')?.value || draft.rarity;
        draft.type = q('#f-type')?.value || draft.type;
        draft.cost = clampNum(q('#f-cost')?.value, 0, 10, 3);
        draft.count = clampNum(q('#f-count')?.value, 1, 12, 1);
        if (q('#f-hp')) draft.hp = clampNum(q('#f-hp').value, 1, 99999, 500);
        if (q('#f-damage')) draft.damage = clampNum(q('#f-damage').value, 0, 99999, 100);
        if (q('#f-hit')) draft.hitSpeed = clampNum(q('#f-hit').value, 0.2, 20, 1);
        if (q('#f-range')) draft.range = clampNum(q('#f-range').value, 0, 20, 1);
        if (q('#f-speed')) draft.speed = clampNum(q('#f-speed').value, 0, 5, 1);
        if (q('#f-splash')) draft.splash = clampNum(q('#f-splash').value, 0, 8, 0);
        if (q('#f-targets')) draft.targets = q('#f-targets').value;
        if (q('#f-flying')) draft.flying = q('#f-flying').value === '1';
        if (q('#f-bo')) draft.buildingOnly = q('#f-bo').value === '1';
        if (q('#f-life')) draft.building = { lifetime: clampNum(q('#f-life').value, 5, 120, 30) };
        if (q('#f-sradius')) {
          draft.spell = {
            radius: clampNum(q('#f-sradius').value, 0.5, 12, 2.5),
            effect: q('#f-seffect').value,
            damage: clampNum(q('#f-sdamage').value, 0, 99999, 200),
            heal: clampNum(q('#f-sheal').value, 0, 99999, 0),
            duration: clampNum(q('#f-sdur').value, 0, 60, 0),
            targetsAir: true,
            targetsGround: true
          };
        }
        // абилки
        this.root.querySelectorAll('[data-ab]').forEach((rowEl) => {
          const i = parseInt(rowEl.dataset.ab, 10);
          const a = draft.abilities[i];
          if (!a) return;
          rowEl.querySelectorAll('[data-abf]').forEach((inp) => {
            const key = inp.dataset.abf;
            const raw = inp.value;
            a[key] = key === 'cardId' ? raw : (isNaN(parseFloat(raw)) ? raw : parseFloat(raw));
            if (key === 'onDeath') a[key] = Number(raw) === 1;
          });
        });
      };

      // живой счётчик баланса
      const meterUI = () => {
        const el = this.root.querySelector('#bal-meter');
        if (!el) return;
        const bal = cardBalance(draft, this.balanceParams);
        const pct = Math.min(100, Math.round((100 * bal.spent) / Math.max(1, bal.budget)));
        el.innerHTML = `
          <div class="bal-row">
            <span>Бюджет: <b>${bal.budget}</b></span>
            <span>Потрачено: <b>${bal.spent}</b></span>
            <span>Остаток: <b style="color:${bal.ok ? '#7dff9e' : '#ff7d7d'}">${bal.remaining > 0 ? '+' : ''}${bal.remaining}</b></span>
            <span>${bal.ok ? '✅ Сбалансирована' : '⚠️ Дисбаланс'}</span>
          </div>
          <div class="bal-bar"><div class="bal-fill ${bal.ok ? '' : 'over'}" style="width:${pct}%"></div></div>
          <div class="bal-parts">${bal.parts.slice(0, 10).map((p) => `${escapeHtml(p.label)}: −${p.value}`).join(' • ') || 'Пока ничего не стоит'}</div>
          ${bal.ok ? '' : '<div class="bal-warn">⚠ Такую карту можно играть только в дружеском бою</div>'}
        `;
      };
      this.root.oninput = () => { collect(); meterUI(); };
      meterUI();

      this.root.querySelector('#share-card').onclick = () => {
        collect();
        this.showShareModal(draft);
      };

      const save = () => {
        collect();
        if (!draft.name.trim()) draft.name = 'Новая карта';
        draft.custom = true;
        const idx = this.customCards.findIndex((c) => c.id === draft.id);
        if (idx >= 0) this.customCards[idx] = draft;
        else this.customCards.push(draft);
        this._persist();
        this.cards();
        this.toast(`Карта «${draft.name}» сохранена!`);
        this.showCardList();
      };
    };
    render();
  }

  // ————— обмен картами —————

  showShareModal(card) {
    const code = encodeCard(card);
    const link = location.href.split('#')[0] + '#card=' + code;
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="modal" style="text-align:left">
        <h2>🔗 Поделиться картой</h2>
        <p class="muted">«${escapeHtml(card.name)}» — отправьте код другу, он вставит его в «Импорт по коду».</p>
        <textarea class="input" id="share-code" readonly style="width:100%;height:110px;font-size:11px;word-break:break-all">${code}</textarea>
        <div class="row mt12" style="flex-wrap:wrap">
          <button class="btn btn-primary" data-a="copy">📋 Копировать код</button>
          <button class="btn btn-blue" data-a="sys">📤 Поделиться…</button>
          <button class="btn btn-ghost" data-a="close">Закрыть</button>
        </div>
        <div class="muted mt12" style="font-size:11px;word-break:break-all">Ссылка: ${escapeHtml(link.slice(0, 80))}…</div>
      </div>`;
    ov.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'close') return ov.remove();
      if (b.dataset.a === 'copy') {
        const ok = await copyText(code);
        this.toast(ok ? 'Код скопирован!' : 'Скопируйте код вручную');
      }
      if (b.dataset.a === 'sys') {
        try {
          if (navigator.share) {
            await navigator.share({ title: `Карта «${card.name}»`, text: code });
          } else {
            const ok = await copyText(code);
            this.toast(ok ? 'Код скопирован!' : 'Скопируйте код вручную');
          }
        } catch { /* пользователь отменил */ }
      }
    });
    document.body.appendChild(ov);
  }

  showImportModal() {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="modal" style="text-align:left">
        <h2>📥 Импорт по коду</h2>
        <p class="muted">Вставьте код карты (начинается с BC1.)</p>
        <textarea class="input" id="imp-code" style="width:100%;height:110px;font-size:11px;word-break:break-all" placeholder="BC1.…"></textarea>
        <div class="row mt12">
          <button class="btn btn-primary" data-a="go">Импортировать</button>
          <button class="btn btn-ghost" data-a="close">Отмена</button>
        </div>
      </div>`;
    ov.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'close') return ov.remove();
      const draft = decodeCard(ov.querySelector('#imp-code').value);
      if (!draft) {
        this.toast('Код не распознан');
        return;
      }
      ov.remove();
      this.toast(`Карта «${draft.name}» получена — сохраните её`);
      this.showCardEditor(null, draft);
    });
    document.body.appendChild(ov);
  }

  // ————— друзья —————

  showFriends() {
    const user = accounts.current();
    const friends = accounts.friends();
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">Друзья</div>
            <div class="top-sub">${friends.length} друзей</div>
          </div>
        </div>
        <div class="screen-scroll">
          ${user ? `
          <div class="form-section">
            <h3>Мой код друга</h3>
            <div class="friend-code" id="my-code">${user.friendCode}</div>
            <button class="btn btn-blue btn-block" id="copy-code" style="margin-top:8px">📋 Копировать код</button>
          </div>
          <div class="form-section">
            <h3>Добавить друга</h3>
            <div class="row">
              <input class="input" id="f-input" placeholder="Код друга (буквы/цифры)" style="flex:1;min-width:150px">
              <button class="btn btn-primary" id="f-add">＋</button>
            </div>
            <div class="muted mt8">Код друга — из его аккаунта. Можно добавить и по имени.</div>
          </div>` : `
          <div class="form-section">
            <h3>Нужен аккаунт</h3>
            <div class="muted mb12">Друзья и дружеские бои привязаны к аккаунту.</div>
            <button class="btn btn-primary btn-block" id="go-auth">Создать аккаунт / войти</button>
          </div>`}
          <div class="form-section">
            <h3>Мои друзья</h3>
            ${friends.length ? friends.map((f) => `
              <div class="friend-row">
                <div style="flex:1">
                  <b>${escapeHtml(f.name)}</b>
                  <div class="muted" style="font-size:11px">код: ${escapeHtml(f.code)}</div>
                </div>
                <button class="btn btn-chip" data-duel="${escapeHtml(f.name)}">⚔️</button>
                <button class="btn btn-chip danger" data-del="${escapeHtml(f.name)}">✕</button>
              </div>`).join('') : '<div class="muted">Пока никого нет</div>'}
          </div>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
    const goAuth = this.root.querySelector('#go-auth');
    if (goAuth) goAuth.onclick = () => this.showAuth();
    const copyBtn = this.root.querySelector('#copy-code');
    if (copyBtn) copyBtn.onclick = async () => {
      const ok = await copyText(user.friendCode);
      this.toast(ok ? 'Код друга скопирован' : 'Скопируйте код вручную');
    };
    const addBtn = this.root.querySelector('#f-add');
    if (addBtn) addBtn.onclick = () => {
      const r = accounts.addFriend(this.root.querySelector('#f-input').value);
      this.toast(r.ok ? `Друг «${r.friend.name}» добавлен` : r.error);
      if (r.ok) this.showFriends();
    };
    this.root.querySelectorAll('[data-del]').forEach((el) => {
      el.onclick = () => {
        accounts.removeFriend(el.dataset.del);
        this.toast('Друг удалён');
        this.showFriends();
      };
    });
    this.root.querySelectorAll('[data-duel]').forEach((el) => {
      el.onclick = () => {
        const f = accounts.friends().find((x) => x.name === el.dataset.duel);
        this.startBattle('friendly', f || null);
      };
    });
  }

  // ————— клан —————

  showClan() {
    const user = accounts.current();
    const clan = accounts.myClan();
    if (!user) {
      this.setScreen(`
        <div class="screen">
          <div class="top-bar">
            <button class="btn btn-ghost" id="back">←</button>
            <div><div class="top-title">Клан</div><div class="top-sub">Нужен аккаунт</div></div>
          </div>
          <div class="screen-scroll">
            <div class="form-section">
              <h3>Кланы доступны с аккаунтом</h3>
              <button class="btn btn-primary btn-block" id="go-auth">Создать аккаунт / войти</button>
            </div>
          </div>
        </div>
      `);
      this.root.querySelector('#back').onclick = () => this.showMenu();
      this.root.querySelector('#go-auth').onclick = () => this.showAuth();
      return;
    }

    if (clan) {
      const members = [...clan.members].sort((a, b) => (b.trophies || 0) - (a.trophies || 0));
      this.setScreen(`
        <div class="screen">
          <div class="top-bar">
            <button class="btn btn-ghost" id="back">←</button>
            <div>
              <div class="top-title">🛡 [${escapeHtml(clan.tag)}] ${escapeHtml(clan.name)}</div>
              <div class="top-sub">${clan.members.length} участников</div>
            </div>
          </div>
          <div class="screen-scroll">
            <div class="form-section">
              <h3>Участники</h3>
              ${members.map((m) => `
                <div class="friend-row">
                  <div style="flex:1">
                    <b>${m.role === 'leader' ? '👑 ' : ''}${escapeHtml(m.name)}</b>
                    ${m.name === user.name ? '<span class="muted">(вы)</span>' : ''}
                  </div>
                  <span>🏆 ${m.trophies || 0}</span>
                </div>`).join('')}
            </div>
            <div class="form-section">
              <h3>События</h3>
              ${(clan.log || []).slice(-8).reverse().map((l) => `
                <div class="muted" style="font-size:11px">• ${escapeHtml(l.msg)}</div>`).join('')}
            </div>
            <button class="btn btn-ghost btn-block danger" id="leave" style="margin-bottom:30px">Выйти из клана</button>
          </div>
        </div>
      `);
      this.root.querySelector('#back').onclick = () => this.showMenu();
      this.root.querySelector('#leave').onclick = async () => {
        const ok = await this.confirmModal('Выйти из клана?', `Вы покинете [${clan.tag}] ${clan.name}.`, [
          { label: 'Выйти', value: true, primary: true },
          { label: 'Отмена', value: false }
        ]);
        if (!ok) return;
        accounts.leaveClan();
        this.toast('Вы покинули клан');
        this.showClan();
      };
      return;
    }

    const all = accounts.allClans();
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div><div class="top-title">Клан</div><div class="top-sub">Создайте свой или вступите</div></div>
        </div>
        <div class="screen-scroll">
          <div class="form-section">
            <h3>Создать клан</h3>
            <div class="form-grid">
              <div class="form-field"><label>Название</label><input class="input" id="c-name" maxlength="24" placeholder="Короли Арены"></div>
              <div class="form-field"><label>Тег</label><input class="input" id="c-tag" maxlength="8" placeholder="KNG"></div>
            </div>
            <button class="btn btn-primary btn-block" id="c-create" style="margin-top:10px">Создать клан</button>
          </div>
          <div class="form-section">
            <h3>Вступить по тегу</h3>
            <div class="row">
              <input class="input" id="c-join" maxlength="8" placeholder="Тег клана" style="flex:1">
              <button class="btn btn-blue" id="c-join-btn">Вступить</button>
            </div>
          </div>
          ${all.length ? `
          <div class="form-section">
            <h3>Кланы на устройстве</h3>
            ${all.map((cl) => `
              <div class="friend-row">
                <div style="flex:1"><b>[${escapeHtml(cl.tag)}]</b> ${escapeHtml(cl.name)}
                  <div class="muted" style="font-size:11px">${cl.members.length} участников</div>
                </div>
                <button class="btn btn-chip" data-join="${escapeHtml(cl.tag)}">Вступить</button>
              </div>`).join('')}
          </div>` : ''}
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
    this.root.querySelector('#c-create').onclick = () => {
      const r = accounts.createClan(
        this.root.querySelector('#c-name').value,
        this.root.querySelector('#c-tag').value
      );
      this.toast(r.ok ? `Клан [${r.clan.tag}] создан!` : r.error);
      if (r.ok) this.showClan();
    };
    this.root.querySelector('#c-join-btn').onclick = () => {
      const r = accounts.joinClan(this.root.querySelector('#c-join').value);
      this.toast(r.ok ? `Вы вступили в [${r.clan.tag}]` : r.error);
      if (r.ok) this.showClan();
    };
    this.root.querySelectorAll('[data-join]').forEach((el) => {
      el.onclick = () => {
        const r = accounts.joinClan(el.dataset.join);
        this.toast(r.ok ? `Вы вступили в [${r.clan.tag}]` : r.error);
        if (r.ok) this.showClan();
      };
    });
  }

  // ————— админ-панель —————

  showAdmin() {
    const u = accounts.current();
    if (!u || !u.isAdmin) {
      this.toast('Только для админа');
      return;
    }
    const P = this.balanceParams;
    const numRow = (key, label, obj, step = '1') => `
      <div class="form-field"><label>${label}</label>
        <input class="input" type="number" step="${step}" data-p="${obj ? obj + '.' + key : key}" value="${obj ? P[obj][key] : P[key]}">
      </div>`;
    const roster = this.cards().filter((c) => !c.hidden);
    const badCount = roster.filter((c) => !this.balanceOf(c).ok).length;
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">⚙️ Админ-панель</div>
            <div class="top-sub">Настройка баланса карт</div>
          </div>
        </div>
        <div class="screen-scroll">
          <div class="form-section">
            <h3>Бюджет</h3>
            <div class="form-grid">
              ${numRow('base', 'Базовый бюджет')}
              ${numRow('perElixir', 'Бюджет за эликсир')}
            </div>
          </div>
          <div class="form-section">
            <h3>Цены характеристик</h3>
            <div class="form-grid">
              ${numRow('hp', 'Цена 1 HP', null, '0.01')}
              ${numRow('dps', 'Цена 1 DPS', null, '0.1')}
              ${numRow('range', 'Цена дальности', null, '1')}
              ${numRow('speed', 'Цена скорости', null, '1')}
              ${numRow('splash', 'Цена сплэша', null, '1')}
              ${numRow('flying', 'Цена полёта')}
              ${numRow('countExtra', 'Цена +юнит')}
              ${numRow('targetsAir', 'Цена «бьёт по воздуху»')}
              ${numRow('lifetime', 'Цена сек. жизни', null, '0.5')}
              ${numRow('spellRadius', 'Цена радиуса закл.', null, '1')}
              ${numRow('spellPower', 'Цена урона закл.', null, '0.05')}
            </div>
          </div>
          <div class="form-section">
            <h3>Цены эффектов заклинаний</h3>
            <div class="form-grid">
              ${Object.keys(P.spellEffect).map((k) => numRow(k, SPELL_EFFECTS[k] || k, 'spellEffect')).join('')}
            </div>
          </div>
          <div class="form-section">
            <h3>Цены механик (абилок)</h3>
            <div class="form-grid">
              ${Object.keys(P.ability).map((k) => numRow(k, (ABILITY_DEFS[k]?.label || k).slice(0, 28), 'ability')).join('')}
            </div>
          </div>
          <div class="form-section">
            <h3>Сводка</h3>
            <div class="info-list">Дисбалансных карт в базе: <b style="color:${badCount ? '#ff9c9c' : '#7dff9e'}">${badCount} из ${roster.length}</b></div>
            <button class="btn btn-ghost btn-block" id="p-reset" style="margin-top:10px">Вернуть значения по умолчанию</button>
          </div>
          <button class="btn btn-primary btn-block btn-big" id="p-save" style="margin:10px 0 30px">💾 Сохранить баланс</button>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
    this.root.querySelector('#p-reset').onclick = async () => {
      const ok = await this.confirmModal('Сбросить баланс?', 'Все цены вернутся к значениям по умолчанию.', [
        { label: 'Сбросить', value: true, primary: true },
        { label: 'Отмена', value: false }
      ]);
      if (!ok) return;
      this.balanceParams = accounts.setBalance(DEFAULT_BALANCE);
      this.toast('Баланс сброшен к дефолту');
      this.showAdmin();
    };
    this.root.querySelector('#p-save').onclick = () => {
      const next = JSON.parse(JSON.stringify(this.balanceParams));
      this.root.querySelectorAll('[data-p]').forEach((inp) => {
        const v = parseFloat(inp.value);
        if (!Number.isFinite(v)) return;
        const [a, b] = inp.dataset.p.split('.');
        if (b) next[a][b] = v;
        else next[a] = v;
      });
      this.balanceParams = accounts.setBalance(next);
      this.toast('Баланс сохранён');
      this.showAdmin();
    };
  }

  // ————— 3D-редактор —————

  showModelEditorScreen(cardDraft, onDone) {
    this.setScreen(`
      <div class="screen" style="padding:0">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">3D-редактор модели</div>
            <div class="top-sub">${escapeHtml(cardDraft.name)}</div>
          </div>
        </div>
        <div id="me-host" style="flex:1;min-height:0"></div>
      </div>
    `);
    const host = this.root.querySelector('#me-host');
    const editor = new ModelEditor(host, cardDraft.model, {
      onSave: (m) => {
        editor.dispose();
        onDone(m);
      }
    });
    this.root.querySelector('#back').onclick = () => {
      editor.dispose();
      onDone(cardDraft.model);
    };
    this._activeModelEditor = editor;
  }

  // ————— настройки —————

  showSettings() {
    const stats = storage.getStats();
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div class="top-title">Настройки</div>
        </div>
        <div class="screen-scroll">
          <div class="form-section">
            <h3>Звук</h3>
            <div class="row">
              <span>Звуковые эффекты</span>
              <span class="spacer"></span>
              <button class="btn ${this.settings.sound !== false ? 'btn-primary' : 'btn-ghost'}" id="s-sound">${this.settings.sound !== false ? 'Вкл' : 'Выкл'}</button>
            </div>
          </div>
          <div class="form-section">
            <h3>Статистика</h3>
            <div class="info-list">
              Боёв: <b>${stats.battles}</b><br>
              Побед: <b>${stats.wins}</b><br>
              Пользовательских карт: <b>${this.customCards.length}</b>
            </div>
          </div>
          <div class="form-section">
            <h3>Данные</h3>
            <div class="muted mb12">Все карты, колода и настройки хранятся на устройстве.</div>
            <button class="btn btn-chip danger" id="s-reset">Сбросить все данные</button>
          </div>
          <div class="form-section">
            <h3>О игре</h3>
            <div class="info-list">
              <b>Королевские Схватки</b> — 3D карточные бои в реальном времени.
              <br><br>• Полный ростер карт-архетипов<br>
              • Конструктор собственных карт<br>
              • Настройка абилок<br>
              • Встроенный 3D-редактор моделей<br>
              • Упаковка в APK через Capacitor (см. APK_BUILD.md)
            </div>
          </div>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
    this.root.querySelector('#s-sound').onclick = () => {
      this.settings.sound = this.settings.sound === false;
      storage.setSettings(this.settings);
      this.sfx.enabled = this.settings.sound;
      this.showSettings();
    };
    this.root.querySelector('#s-reset').onclick = async () => {
      const ok = await this.confirmModal('Сбросить данные?', 'Все пользовательские карты, колода и статистика будут удалены.', [
        { label: 'Сбросить', value: true, primary: true },
        { label: 'Отмена', value: false }
      ]);
      if (ok) {
        storage.reset();
        this.customCards = [];
        this.deck = this._starterDeck();
        this.toast('Данные сброшены');
        this.showSettings();
      }
    };
  }

  // ————— бой —————

  startBattle(mode = 'normal', friend = null) {
    if (this.deck.length < 4) {
      this.toast('В колоде должно быть минимум 4 карты');
      return;
    }
    this.battleMode = mode;
    if (mode === 'normal') {
      const bad = this.deckIssues();
      if (bad.length) {
        this.toast('Дисбалансные карты — только в дружеском бою');
        this.showBattleMenu();
        return;
      }
    }
    const all = this.cards().filter((c) => !c.hidden);
    let enemyDeck;
    if (friend && Array.isArray(friend.deck) && friend.deck.length >= 4) {
      enemyDeck = friend.deck.slice(0, 8);
    } else {
      const enemyPool = all.map((c) => c.id).filter((id) => !this.deck.includes(id));
      enemyDeck = [];
      while (enemyDeck.length < 8 && enemyPool.length) {
        enemyDeck.push(enemyPool.splice(Math.floor(Math.random() * enemyPool.length), 1)[0]);
      }
      while (enemyDeck.length < 8) enemyDeck.push(this.deck[enemyDeck.length % this.deck.length]);
    }

    const cardsById = new Map(this.cards().map((c) => [c.id, c]));

    this.setScreen(`
      <div class="battle-screen">
        <div class="battle-top">
          <button class="btn btn-ghost" id="b-pause" style="padding:8px 12px">☰</button>
          <div class="battle-timer" id="b-timer">3:00</div>
          <div class="crowns">
            <span class="crown-p">👑<span id="b-cp">0</span></span>
            <span class="muted">:</span>
            <span class="crown-a"><span id="b-ca">0</span>👑</span>
          </div>
          <span class="spacer"></span>
          <button class="btn btn-ghost" id="b-mute" style="padding:8px 12px">${this.sfx.enabled ? '🔊' : '🔇'}</button>
        </div>
        <div class="battle-canvas-wrap" id="b-canvas"></div>
        <div class="battle-bottom">
          <div class="elixir-row">
            <div class="elixir-bar"><div class="elixir-fill" id="b-elixir"></div></div>
            <div class="elixir-num" id="b-elixir-num">5</div>
            <div class="elixir-x2" id="b-x2" style="display:none">×2</div>
          </div>
          <div class="hand-row" id="b-hand"></div>
          <div class="battle-hint">${this.battleMode === 'friendly' ? '🤝 Дружеский бой — можно любые карты. ' : ''}Перетащите карту на арену или тапните карту → тапните свою половину</div>
        </div>
      </div>
    `);

    // бой создаётся ПОСЛЕ setScreen: иначе _stopBattle внутри setScreen его обнулит
    this.battle = new Battle({
      playerDeck: this.deck.slice(),
      enemyDeck,
      cardsById
    });
    this.ai = new BattleAI(this.battle, 'ai');

    const canvasHost = this.root.querySelector('#b-canvas');
    requestAnimationFrame(() => {
      try {
        this.battleView = new BattleView(canvasHost, this.battle, {
          team: 'player',
          onDeployRequest: (cardId, x, y) => this._tryDeploy(cardId, x, y)
        });
        this.battleView.resize();
      } catch (e) {
        console.error('3D недоступно:', e);
        canvasHost.innerHTML = `
          <div class="fallback-wrap">
            <div style="font-size:34px">🎮</div>
            <div style="font-size:14px;font-weight:700">3D-режим недоступен — упрощённая арена</div>
            <div class="fallback-arena" id="b-farena">
              <div class="fa-half fa-enemy">⚔️ Вражеская половина</div>
              <div class="fa-half fa-own">🛡️ Своя половина — нажмите, чтобы поставить карту</div>
            </div>
          </div>`;
        const fa = canvasHost.querySelector('#b-farena');
        if (fa) {
          fa.querySelectorAll('.fa-half').forEach((halfEl) => {
            halfEl.addEventListener('click', (ev) => {
              if (!this.selectedCard) { this.toast('Сначала выберите карту внизу'); return; }
              const own = halfEl.classList.contains('fa-own');
              if (!own) { this.toast('Ставьте карты только на свою половину арены!'); return; }
              const r = halfEl.getBoundingClientRect();
              const fx = Math.min(1, Math.max(0, (ev.clientX - r.left) / (r.width || 1)));
              const fy = Math.min(1, Math.max(0, (ev.clientY - r.top) / (r.height || 1)));
              const x = -8.5 + fx * 17;
              const y = -15.5 + fy * 14; // своя половина: от -15.5 (низ) до -1.5 (у реки)
              this._tryDeploy(this.selectedCard, x, y);
            });
          });
        }
      }
    });

    this._bindHandDrag();

    this.root.querySelector('#b-pause').onclick = () => this._pauseMenu();
    this.root.querySelector('#b-mute').onclick = () => {
      this.sfx.enabled = !this.sfx.enabled;
      this.settings.sound = this.sfx.enabled;
      storage.setSettings(this.settings);
      this.root.querySelector('#b-mute').textContent = this.sfx.enabled ? '🔊' : '🔇';
    };

    this.selectedCard = null;
    this._renderHand();
    this._battleLoop();
  }

  _renderHand() {
    const handEl = this.root.querySelector('#b-hand');
    if (!handEl || !this.battle) return;
    const hand = this.battle.teams.player.hand;
    const elixir = this.battle.teams.player.elixir;
    handEl.innerHTML = hand.map((id) => {
      const c = this.cards().find((x) => x.id === id);
      if (!c) return '<div class="deck-slot">?</div>';
      const afford = elixir >= c.cost;
      return `
        <div class="hand-card ${afford ? '' : 'unaffordable'} ${this.selectedCard === id ? 'active' : ''}" data-hand="${id}">
          <div class="card-cost">${c.cost}</div>
          ${this.cardIconHtml(c)}
          <div class="card-name">${c.name}</div>
        </div>`;
    }).join('');
    handEl.querySelectorAll('[data-hand]').forEach((el) => {
      const id = el.dataset.hand;
      // тап — выбрать/снять выбор; перетаскивание — высадить на арену (как в Clash-игрушках)
      const down = (ev) => this._handDown(ev, id, el);
      if (typeof window !== 'undefined' && window.PointerEvent) {
        el.addEventListener('pointerdown', down);
      } else {
        el.addEventListener('touchstart', (ev) => {
          ev.preventDefault();
          const t = ev.touches[0];
          if (t) this._handDown(t, id, el, ev);
        }, { passive: false });
        el.addEventListener('mousedown', (ev) => this._handDown(ev, id, el));
      }
    });
  }

  // ——— перетаскивание карты из руки ———

  _handDown(pt, id, el, origEvent) {
    if (!this.battle || this.battle.finished) return;
    if (origEvent && origEvent.preventDefault) origEvent.preventDefault();
    this._handDrag = {
      id,
      el,
      x0: pt.clientX,
      y0: pt.clientY,
      moved: false,
      wasSelected: this.selectedCard === id
    };
    this._handDragMoved = false;
  }

  _handMove(pt) {
    const d = this._handDrag;
    if (!d || !pt) return;
    const dx = pt.clientX - d.x0;
    const dy = pt.clientY - d.y0;
    if (!d.moved && Math.hypot(dx, dy) > 10) {
      d.moved = true;
      // выбрать карту и показать призрак под пальцем
      this.selectedCard = d.id;
      this.root.querySelectorAll('[data-hand]').forEach((e2) => {
        e2.classList.toggle('active', e2.dataset.hand === d.id);
      });
      const c = this.cards().find((x2) => x2.id === d.id);
      if (this.battleView && c) this.battleView.setPendingCard(c);
    }
    if (d.moved && this.battleView) this.battleView.ghostTo(pt.clientX, pt.clientY);
  }

  _handUp(pt) {
    const d = this._handDrag;
    this._handDrag = null;
    if (!d) return;
    if (d.moved) {
      // жест «перетащил на арену» → высадка в точке отпускания
      const p = this.battleView && pt ? this.battleView.screenToGround(pt.clientX, pt.clientY) : null;
      if (p) {
        this._tryDeploy(d.id, p.x, p.y);
      } else if (this.battleView) {
        // отпустили мимо арены — отмена
        this.selectedCard = null;
        this.battleView.setPendingCard(null);
        this._renderHand();
      } else {
        // без 3D: оставляем карту выбранной — клик по 2D-арене высадит её
        this._renderHand();
      }
    } else {
      // обычный тап: выбрать/снять выбор
      this.selectedCard = d.wasSelected ? null : d.id;
      const c = this.selectedCard ? this.cards().find((x2) => x2.id === this.selectedCard) : null;
      if (this.battleView) this.battleView.setPendingCard(c || null);
      this._renderHand();
    }
  }

  _bindHandDrag() {
    const doc = window.document;
    const move = (ev) => {
      if (!this._handDrag) return;
      const t = (ev.touches && ev.touches[0]) || (ev.changedTouches && ev.changedTouches[0]) || ev;
      if (ev.cancelable) ev.preventDefault();
      this._handMove(t);
    };
    const up = (ev) => {
      if (!this._handDrag) return;
      const t = (ev.changedTouches && ev.changedTouches[0]) || (ev.touches && ev.touches[0]) || ev;
      this._handUp(t);
    };
    if (typeof window !== 'undefined' && window.PointerEvent) {
      doc.addEventListener('pointermove', move);
      doc.addEventListener('pointerup', up);
      doc.addEventListener('pointercancel', up);
    } else {
      doc.addEventListener('touchmove', move, { passive: false });
      doc.addEventListener('touchend', up);
      doc.addEventListener('touchcancel', up);
      doc.addEventListener('mousemove', move);
      doc.addEventListener('mouseup', up);
    }
    this._handDocHandlers = { move, up };
  }

  _unbindHandDrag() {
    if (!this._handDocHandlers) return;
    const doc = window.document;
    const { move, up } = this._handDocHandlers;
    if (typeof window !== 'undefined' && window.PointerEvent) {
      doc.removeEventListener('pointermove', move);
      doc.removeEventListener('pointerup', up);
      doc.removeEventListener('pointercancel', up);
    } else {
      doc.removeEventListener('touchmove', move);
      doc.removeEventListener('touchend', up);
      doc.removeEventListener('touchcancel', up);
      doc.removeEventListener('mousemove', move);
      doc.removeEventListener('mouseup', up);
    }
    this._handDocHandlers = null;
    this._handDrag = null;
  }

  _tryDeploy(cardId, x, y) {
    const b = this.battle;
    if (!b || b.finished) return;
    // battleView может передать как id, так и объект карты — нормализуем
    const id = cardId && typeof cardId === 'object' ? cardId.id : cardId;
    const c = this.cards().find((x2) => x2.id === id);
    if (!c) return;
    // все карты (включая заклинания) ставятся только на свою половину
    if (!b.canPlaceAt(x, y, 'player')) {
      this.toast('Ставьте карты только на свою половину арены!');
      return;
    }
    if (!b.canDeploy('player', id)) {
      this.toast('Не хватает эликсира');
      return;
    }
    b.deploy(id, x, y, 'player');
    this.sfx.play(c.type === 'spell' ? 'spell' : 'deploy');
    this.selectedCard = null;
    if (this.battleView) {
      this.battleView.setPendingCard(null);
    }
    this._renderHand();
  }

  _battleLoop() {
    let last = performance.now();
    let handSignature = '';
    const step = (now) => {
      if (!this.battle) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (!this.battle.finished) {
        this.battle.update(dt);
        this.ai.update(dt);
      }
      const events = this.battle.drainEvents();
      if (this.battleView) {
        try {
          this.battleView.update(dt, events);
        } catch (e) {
          console.error('3D-ошибка, отключаю вид:', e);
          try { this.battleView.dispose(); } catch { /* ignore */ }
          this.battleView = null;
        }
      }

      // HUD
      const b = this.battle;
      const remain = Math.max(0, MATCH_TIME - b.time);
      const mm = Math.floor(remain / 60);
      const ss = Math.floor(remain % 60);
      const timerEl = this.root.querySelector('#b-timer');
      if (timerEl) {
        timerEl.textContent = `${mm}:${ss.toString().padStart(2, '0')}`;
        timerEl.classList.toggle('overtime', remain < 30);
      }
      const xe = this.root.querySelector('#b-elixir');
      if (xe) {
        xe.style.width = `${(b.teams.player.elixir / 10) * 100}%`;
        this.root.querySelector('#b-elixir-num').textContent = Math.floor(b.teams.player.elixir);
      }
      const x2 = this.root.querySelector('#b-x2');
      if (x2) x2.style.display = b.time >= 120 ? '' : 'none';
      const cp = this.root.querySelector('#b-cp');
      if (cp) cp.textContent = b.crowns.player;
      const ca = this.root.querySelector('#b-ca');
      if (ca) ca.textContent = b.crowns.ai;

      const sig = b.teams.player.hand.join('|') + '|' + Math.floor(b.teams.player.elixir / 1) + '|' + (this.selectedCard || '');
      if (sig !== handSignature && !this._handDrag) {
        handSignature = sig;
        this._renderHand();
      }

      // события звука
      for (const e of events) {
        if (e.type === 'towerShot' || e.type === 'attack') this.sfx.play('hit');
        else if (e.type === 'boom') this.sfx.play('boom');
        else if (e.type === 'towerDown') this.sfx.play('tower');
        else if (e.type === 'finish') this._showResult();
      }

      this.battleRaf = requestAnimationFrame(step);
    };
    this.battleRaf = requestAnimationFrame(step);
  }

  _showResult() {
    if (this._resultShown) return;
    this._resultShown = true;
    const b = this.battle;
    const res = b.result || { winner: 'draw' };
    const stats = storage.addBattleResult(res.winner === 'player');
    const u = accounts.addBattle(res.winner === 'player', this.battleMode !== 'friendly', res.winner === 'draw');
    this.sfx.play(res.winner === 'player' ? 'win' : res.winner === 'draw' ? 'ui' : 'lose');

    const title = res.winner === 'player' ? 'Победа!' : res.winner === 'draw' ? 'Ничья' : 'Поражение';
    const icon = res.winner === 'player' ? '🏆' : res.winner === 'draw' ? '🤝' : '💀';
    const trophyLine = u && this.battleMode !== 'friendly' && res.winner !== 'draw'
      ? `<br>Трофеи: <b>🏆 ${u.trophies}</b> (${res.winner === 'player' ? '+30' : '−15'})`
      : (this.battleMode === 'friendly' ? '<br><span class="muted">Дружеский бой — трофеи не меняются</span>' : '');
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="modal">
        <div class="result-big">${icon}</div>
        <h2>${title}</h2>
        <p>Короны: ${b.crowns.player} : ${b.crowns.ai}<br>Всего побед: ${stats.wins} из ${stats.battles}${trophyLine}</p>
        <button class="btn btn-primary" data-a="menu">В меню</button>
        <button class="btn btn-blue" data-a="again">Ещё бой</button>
      </div>`;
    ov.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-a]');
      if (!btn) return;
      ov.remove();
      this._resultShown = false;
      if (btn.dataset.a === 'again') this.startBattle(this.battleMode || 'normal');
      else this.showMenu();
    });
    document.body.appendChild(ov);
  }

  _pauseMenu() {
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="modal">
        <h2>Пауза</h2>
        <p>Битва продолжается в фоне — возвращайтесь скорее!</p>
        <button class="btn btn-primary" data-a="resume">Продолжить</button>
        <button class="btn btn-ghost" data-a="menu">Выйти в меню</button>
      </div>`;
    ov.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-a]');
      if (!btn) return;
      ov.remove();
      if (btn.dataset.a === 'menu') this.showMenu();
    });
    document.body.appendChild(ov);
  }

  _stopBattle() {
    if (this.battleRaf) cancelAnimationFrame(this.battleRaf);
    this.battleRaf = 0;
    this._unbindHandDrag();
    if (this.battleView) {
      this.battleView.dispose();
      this.battleView = null;
    }
    if (this._activeModelEditor) {
      this._activeModelEditor = null;
    }
    this.battle = null;
    this._resultShown = false;
    this.selectedCard = null;
  }
}

// ————— мелкие помощники —————

// Очистка пользовательского хранилища от мусора (битые карты/колоды от старых сессий).
function sanitizeCards(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const c of list) {
    if (!c || typeof c !== 'object') continue;
    if (!c.id || typeof c.id !== 'string' || !c.name) continue;
    const card = {
      id: c.id,
      name: String(c.name).slice(0, 40),
      desc: typeof c.desc === 'string' ? c.desc.slice(0, 300) : '',
      rarity: RARITY[c.rarity] ? c.rarity : 'common',
      type: TYPE_LABELS[c.type] ? c.type : 'troop',
      cost: clampNum(c.cost, 0, 10, 3),
      count: clampNum(c.count, 1, 12, 1),
      hp: clampNum(c.hp, 1, 99999, 500),
      damage: clampNum(c.damage, 0, 99999, 100),
      hitSpeed: clampNum(c.hitSpeed, 0.2, 20, 1),
      range: clampNum(c.range, 0, 20, 1),
      speed: clampNum(c.speed, 0, 5, 1),
      splash: clampNum(c.splash, 0, 8, 0),
      sight: 5.5,
      targets: c.targets === 'both' ? 'both' : 'ground',
      flying: !!c.flying,
      buildingOnly: !!c.buildingOnly,
      hidden: false,
      custom: true,
      abilities: Array.isArray(c.abilities) ? c.abilities.filter((a) => a && ABILITY_DEFS[a.type]) : [],
      spell: c.spell && typeof c.spell === 'object' ? c.spell : null,
      building: c.building && typeof c.building === 'object' ? c.building : null,
      model: c.model && Array.isArray(c.model.parts) && c.model.parts.length
        ? c.model
        : { parts: [{ shape: 'box', pos: [0, 0.85, 0], rot: [0, 0, 0], scale: [0.62, 0.62, 0.36], color: '#3b6fd4', emissive: '#000000' }] }
    };
    out.push(card);
  }
  return out;
}

function sanitizeDeck(deck) {
  const valid = new Set([...ALL_CARDS.map((c) => c.id), ...storage.getCustomCards().map((c) => c && c.id)]);
  let list = Array.isArray(deck) ? deck.filter((id) => typeof id === 'string' && valid.has(id)) : [];
  list = [...new Set(list)].slice(0, 8);
  if (list.length < 4) {
    for (const id of ['knight', 'archers', 'goblins', 'fireball', 'musketeer', 'giant', 'arrows', 'cannon']) {
      if (list.length >= 8) break;
      if (!list.includes(id)) list.push(id);
    }
  }
  return list;
}

function clampNum(v, min, max, def) {
  const n = parseFloat(v);
  if (isNaN(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
