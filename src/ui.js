// UI приложения: меню, коллекция, конструктор колоды, редактор карт, бой, настройки.
import { storage } from './storage.js';
import { ALL_CARDS, COLLECTION_IDS, RARITY, getCard, withCustom } from './data/cards.js';
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
    this.customCards = storage.getCustomCards();
    this.deck = storage.getDeck() || this._starterDeck();
    this.settings = storage.getSettings();
    this.sfx.enabled = this.settings.sound !== false;
    this.battle = null;
    this.battleView = null;
    this.battleRaf = 0;
    this.allCards = withCustom(this.customCards);
    this.showMenu();
  }

  _starterDeck() {
    return ['knight', 'archers', 'goblins', 'fireball', 'musketeer', 'giant', 'arrows', 'cannon']
      .filter((id) => getCard(id));
  }

  cards() {
    this.allCards = withCustom(this.customCards);
    return this.allCards;
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
    this.setScreen(`
      <div class="screen">
        <div class="screen-scroll">
          <div class="menu-hero">
            <div class="menu-logo">👑⚔️</div>
            <div class="menu-title">Королевские Схватки</div>
            <div class="menu-sub">3D-битвы • Свои карты • Редактор моделей</div>
          </div>
          <div class="menu-buttons">
            <button class="btn btn-primary btn-big" id="m-battle">⚔️ В бой!</button>
            <button class="btn btn-blue" id="m-deck">🃏 Моя колода (${this.deck.length}/8)</button>
            <button class="btn btn-ghost" id="m-cards">📚 Коллекция карт</button>
            <button class="btn btn-ghost" id="m-editor">🛠 Редактор карт</button>
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
    this.root.querySelector('#m-battle').onclick = () => { this.sfx.play('ui'); this.startBattle(); };
    this.root.querySelector('#m-deck').onclick = () => { this.sfx.play('ui'); this.showDeck(); };
    this.root.querySelector('#m-cards').onclick = () => { this.sfx.play('ui'); this.showCollection(); };
    this.root.querySelector('#m-editor').onclick = () => { this.sfx.play('ui'); this.showCardList(); };
    this.root.querySelector('#m-settings').onclick = () => { this.sfx.play('ui'); this.showSettings(); };
    const apkBtn = this.root.querySelector('#m-apk');
    if (apkBtn) apkBtn.onclick = () => { this.sfx.play('ui'); location.href = './battle-cards-royale-1.0.apk'; };
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
        ${abilities.length ? `<div class="mt12"><b style="color:#f0d890">Абилки:</b> ${abilities.join(', ')}</div>` : ''}
        <div class="row mt16" style="flex-wrap:wrap">
          <button class="btn btn-primary" data-a="deck">${this.deck.includes(c.id) ? 'Убрать из колоды' : 'В колоду'}</button>
          <button class="btn btn-ghost" data-a="close">Закрыть</button>
        </div>
      </div>`;
    ov.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-a]');
      if (!b) return;
      if (b.dataset.a === 'close') return ov.remove();
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
        storage.setDeck(this.deck);
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
        storage.setDeck(this.deck);
        this.toast('Случайная колода готова!');
        render();
      };
      this.root.querySelector('#d-clear').onclick = () => {
        this.deck = [];
        storage.setDeck(this.deck);
        render();
      };
      this.root.querySelector('#d-starter').onclick = () => {
        this.deck = this._starterDeck();
        storage.setDeck(this.deck);
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
          storage.setDeck(this.deck);
          render();
        };
      });
      this.root.querySelectorAll('[data-drop]').forEach((el) => {
        el.onclick = () => {
          this.deck = this.deck.filter((x) => x !== el.dataset.drop);
          storage.setDeck(this.deck);
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
          <button class="btn btn-primary" id="new">＋ Новая</button>
        </div>
        <div class="screen-scroll">
          <div class="muted mb12">Нажмите на карту, чтобы изменить характеристики, абилки и 3D-модель. Пользовательские карты помечены ✏️.</div>
          <div class="cards-grid">
            ${list.map((c) => `
              <div class="card-tile rarity-${c.rarity}" data-edit="${c.id}">
                <div class="card-cost">${c.cost}</div>
                ${this.cardIconHtml(c)}
                <div class="card-name">${c.custom ? '✏️ ' : ''}${c.name}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
    this.root.querySelector('#new').onclick = () => this.showCardEditor(null);
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
            </div>

            <div class="row" style="margin:6px 0 30px">
              <button class="btn btn-primary btn-block btn-big" id="save2">💾 Сохранить карту</button>
            </div>
            ${isCustom && source && source.custom ? `<button class="btn btn-chip danger" id="delete">Удалить карту</button>` : ''}
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
            storage.setCustomCards(this.customCards);
            storage.setDeck(this.deck);
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

      const save = () => {
        collect();
        if (!draft.name.trim()) draft.name = 'Новая карта';
        draft.custom = true;
        const idx = this.customCards.findIndex((c) => c.id === draft.id);
        if (idx >= 0) this.customCards[idx] = draft;
        else this.customCards.push(draft);
        storage.setCustomCards(this.customCards);
        this.cards();
        this.toast(`Карта «${draft.name}» сохранена!`);
        this.showCardList();
      };
    };
    render();
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

  startBattle() {
    if (this.deck.length < 4) {
      this.toast('В колоде должно быть минимум 4 карты');
      return;
    }
    const all = this.cards().filter((c) => !c.hidden);
    const enemyPool = all.map((c) => c.id).filter((id) => !this.deck.includes(id));
    const enemyDeck = [];
    while (enemyDeck.length < 8 && enemyPool.length) {
      enemyDeck.push(enemyPool.splice(Math.floor(Math.random() * enemyPool.length), 1)[0]);
    }
    while (enemyDeck.length < 8) enemyDeck.push(this.deck[enemyDeck.length % this.deck.length]);

    const cardsById = new Map(this.cards().map((c) => [c.id, c]));
    this.battle = new Battle({
      playerDeck: this.deck.slice(),
      enemyDeck,
      cardsById
    });
    this.ai = new BattleAI(this.battle, 'ai');

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
          <div class="battle-hint">Выберите карту и перетащите на свою половину арены</div>
        </div>
      </div>
    `);

    const canvasHost = this.root.querySelector('#b-canvas');
    requestAnimationFrame(() => {
      this.battleView = new BattleView(canvasHost, this.battle, {
        team: 'player',
        onDeployRequest: (cardId, x, y) => this._tryDeploy(cardId, x, y)
      });
      this.battleView.resize();
    });

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
      if (!c) return '';
      const afford = elixir >= c.cost;
      return `
        <div class="hand-card ${afford ? '' : 'unaffordable'} ${this.selectedCard === id ? 'active' : ''}" data-hand="${id}">
          <div class="card-cost">${c.cost}</div>
          ${this.cardIconHtml(c)}
          <div class="card-name">${c.name}</div>
        </div>`;
    }).join('');
    handEl.querySelectorAll('[data-hand]').forEach((el) => {
      el.onclick = () => {
        const id = el.dataset.hand;
        const c = this.cards().find((x) => x.id === id);
        if (!c) return;
        if (this.selectedCard === id) {
          this.selectedCard = null;
          this.battleView && this.battleView.setPendingCard(null);
        } else {
          this.selectedCard = id;
          this.battleView && this.battleView.setPendingCard(c);
        }
        this._renderHand();
      };
    });
  }

  _tryDeploy(cardId, x, y) {
    const b = this.battle;
    if (!b || b.finished) return;
    const c = this.cards().find((x2) => x2.id === cardId);
    if (!c) return;
    const isSpell = c.type === 'spell';
    if (!isSpell && !b.canPlaceAt(x, y, 'player')) {
      this.toast('Размещайте войска на своей половине!');
      return;
    }
    if (!b.canDeploy('player', cardId)) {
      this.toast('Не хватает эликсира');
      return;
    }
    b.deploy(cardId, x, y, 'player');
    this.sfx.play(isSpell ? 'spell' : 'deploy');
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
      if (this.battleView) this.battleView.update(dt, events);

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
      if (sig !== handSignature) {
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
    this.sfx.play(res.winner === 'player' ? 'win' : res.winner === 'draw' ? 'ui' : 'lose');

    const title = res.winner === 'player' ? 'Победа!' : res.winner === 'draw' ? 'Ничья' : 'Поражение';
    const icon = res.winner === 'player' ? '🏆' : res.winner === 'draw' ? '🤝' : '💀';
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="modal">
        <div class="result-big">${icon}</div>
        <h2>${title}</h2>
        <p>Короны: ${b.crowns.player} : ${b.crowns.ai}<br>Всего побед: ${stats.wins} из ${stats.battles}</p>
        <button class="btn btn-primary" data-a="menu">В меню</button>
        <button class="btn btn-blue" data-a="again">Ещё бой</button>
      </div>`;
    ov.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-a]');
      if (!btn) return;
      ov.remove();
      this._resultShown = false;
      if (btn.dataset.a === 'again') this.startBattle();
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
