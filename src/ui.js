// UI приложения: меню, коллекция, конструктор колоды, редактор карт, бой, настройки.
import { storage } from './storage.js';
import { ALL_CARDS, COLLECTION_IDS, RARITY, getCard, withCustom, autoTags, TAG_LABELS } from './data/cards.js';
import { cardBalance, DEFAULT_BALANCE } from './data/balance.js';
import { accounts } from './accounts.js';
import { encodeCard, decodeCard, copyText, sanitizeArt } from './share.js';
import {
  LEVEL_MAX, levelMultiplier, upgradeCost, LEAGUES, leagueFor, nextLeague,
  currentSeasonId, seasonDaysLeft, seasonReward,
  normalizeProgress, cardLevel, scaleCard, rollChest, openChest,
  copiesNeeded, cardCopiesOf, addCardCopies, unlockCard, applyUnlocksByTrophies,
  HERO_FRAGMENTS_FOR_UNLOCK, addHeroFragments, unlockHero, isHeroUnlocked, unlockStarterCards,
  canUpgrade, applyUpgrade
} from './progress.js';
import { ReplayRecorder, replaySize, saveReplayToList, encodeReplay, decodeReplay, REPLAY_LIMIT } from './replay.js';
import { ARENAS, arenaFor, nextArena } from './data/arenas.js';
import { MISSIONS, CHAPTERS, BOSSES, missionById, chapterMissions, isUnlocked } from './data/campaign.js';
import { BossController } from './game/bosses.js';
import { CommanderAI } from './game/commanders.js';
import { PASS_TIERS, PASS_XP_PER_TIER, PASS_REWARDS, PREMIUM_COST, tierForXp, passReward } from './data/pass.js';
import { ACHIEVEMENTS, statsFrom } from './data/achievements.js';
import { EVO_MAX, evoCost, evoMultiplier, applyEvo, isMythic, evoLabel } from './game/forge.js';
import { levelFromXp, xpForLevel, chestByType } from './progress.js';
import { Battle, MATCH_TIME } from './game/engine.js';
import { BattleAI } from './game/ai.js';
import { BattleView } from './render/battleView.js';
import { ArtEditor } from './render/artEditor.js';
import { baseSprite, clearSpriteCache, emptyArt } from './render/art2d.js';
import { NetClient, RemoteBattle, buildHostSnapshot, applyIntentToBattle } from './net.js';

const DEFAULT_NET_URL = 'https://8787-i2oxdp3la5edr88fbz8my.e2b.app';

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
  rageOnDeploy: { label: 'Ярость при высадке', params: [['duration', 'Сек', 6], ['radius', 'Радиус', 3], ['speedMul', 'Скорость ×', 1.3], ['attackMul', 'Атака ×', 1.3]] },
  crit: { label: 'Критический удар', params: [['chance', 'Шанс (0..1)', 0.25], ['multiplier', 'Множитель урона', 2]] },
  dodge: { label: 'Уклонение', params: [['chance', 'Шанс (0..1)', 0.3]] },
  revive: { label: 'Возрождение (1 раз)', params: [['hpPercent', 'Доля HP', 0.5]] },
  thorns: { label: 'Шипы (возврат урона)', params: [['percent', 'Доля урона', 0.3]] },
  taunt: { label: 'Провокация', params: [['radius', 'Радиус', 3]] },
  buffAura: { label: 'Аура усиления союзников', params: [['radius', 'Радиус', 3], ['damageMul', 'Урон ×', 1.15], ['speedMul', 'Скорость ×', 1.1]] }
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

// Процедурная фоновая музыка (WebAudio): спокойная в меню, бодрая в бою.
class Music {
  constructor(sfx) {
    this.sfx = sfx;
    this.mode = 'menu';
    this.timer = 0;
    this.step = 0;
    this.nextAt = 0;
  }

  setMode(mode) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.step = 0;
    const ac = this.sfx._ac();
    if (ac) this.nextAt = ac.currentTime + 0.1;
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this._tick(), 110);
    const ac = this.sfx._ac();
    if (ac) this.nextAt = ac.currentTime + 0.1;
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = 0;
  }

  _note(freq, at, dur, type, vol) {
    const ac = this.sfx._ac();
    if (!ac) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.connect(g); g.connect(ac.destination);
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.start(at);
    o.stop(at + dur + 0.03);
  }

  _tick() {
    const ac = this.sfx._ac();
    if (!ac || !this.sfx.enabled) return;
    const now = ac.currentTime;
    if (this.nextAt < now) this.nextAt = now + 0.05;
    const battle = this.mode === 'battle';
    const bpm = battle ? 126 : 76;
    const stepDur = 60 / bpm / 2; // восьмые
    const scale = battle ? [0, 3, 5, 7, 10] : [0, 3, 5, 7, 10]; // минорная пентатоника
    const root = battle ? 65.41 : 110; // C2 / A2
    while (this.nextAt < now + 0.4) {
      const s = this.step;
      const at = this.nextAt;
      // бас: корень и квинта
      if (s % 4 === 0) this._note(root, at, stepDur * 3.2, 'triangle', 0.05);
      if (s % 8 === 6) this._note(root * 1.5, at, stepDur * 1.6, 'triangle', 0.035);
      // мелодия-арпеджио
      const deg = scale[(s * (battle ? 3 : 2)) % scale.length];
      const oct = (s % 8 < 4) ? 4 : 2;
      this._note(root * oct * Math.pow(2, deg / 12), at, stepDur * 1.1, battle ? 'square' : 'sine', battle ? 0.018 : 0.022);
      // «хэт» в бою
      if (battle && s % 2 === 1) this._note(3200 + (s % 4) * 180, at, 0.035, 'square', 0.008);
      this.step++;
      this.nextAt += stepDur;
    }
  }
}

export class App {
  constructor(root) {
    this.root = root;
    this.sfx = new Sfx();
    this.music = new Music(this.sfx);
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
    this.allCards = withCustom([...accounts.globalCards(), ...this.customCards]);
    this.balanceParams = accounts.getBalance();
    this.progress = accounts.ensureGuest(this.deck, this.customCards);
    unlockStarterCards(this.progress);
    this.replays = this._loadReplays();
    this.showMenu();
    // импорт карты по ссылке #card=BC1...
    this._checkHashImport();
  }

  _loadReplays() {
    try {
      const p = this.progress || {};
      return Array.isArray(p.replays) ? p.replays : [];
    } catch {
      return [];
    }
  }

  _saveReplays() {
    // реплеи храним в прогрессе (он сериализуется в профиль)
    this.progress.replays = this.replays;
    this._persist();
  }

  _starterDeck() {
    return ['knight', 'archers', 'goblins', 'fireball', 'musketeer', 'giant', 'arrows', 'cannon']
      .filter((id) => getCard(id));
  }

  cards() {
    // база + глобальные карты (для всех, добавляет админ) + личные
    this.allCards = withCustom([...accounts.globalCards(), ...this.customCards]);
    return this.allCards;
  }

  // ————— профиль/баланс —————

  _persist() {
    storage.setDeck(this.deck);
    storage.setCustomCards(this.customCards);
    const saved = accounts.saveProgress(this.progress);
    // сохраняем ИДЕНТИЧНОСТЬ объекта прогресса: экраны держат на него ссылки
    if (saved && this.progress && saved !== this.progress && typeof saved === 'object') {
      for (const k of Object.keys(saved)) this.progress[k] = saved[k];
    } else {
      this.progress = saved;
    }
    accounts.saveActive(this.deck, this.customCards, this.progress);
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
    try {
      this.music.setMode(String(html || '').includes('battle-screen') ? 'battle' : 'menu');
      this.music.start();
    } catch { /* аудио недоступно */ }
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
    // уровень карты — бейдж на каждой карте (рука, коллекция, колода, лут)
    const lvl = `<div class="card-level">ур.${cardLevel(this.progress, card.id) || 1}</div>`;
    // рисунок карты (или спрайт из модели) → превью; иначе буква
    try {
      const c = document.createElement('canvas');
      c.width = c.height = 72;
      const ctx = c.getContext && c.getContext('2d');
      if (ctx) {
        const spr = baseSprite(card, 72);
        ctx.drawImage(spr, 0, 0);
        const url = c.toDataURL('image/png');
        return `<div class="card-icon card-icon-art"><img src="${url}" alt="${escapeHtml(card.name || '')}">${lvl}</div>`;
      }
    } catch { /* без canvas — буква */ }
    const letter = (card.name || '?').trim().charAt(0).toUpperCase();
    return `<div class="card-icon">${letter}<span style="position:absolute;margin:26px 0 0 26px;font-size:12px">${TYPE_ICONS[card.type] || ''}</span>${lvl}</div>`;
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
            <div class="menu-sub">Битвы • Свои карты • Рисунок и анимация карт</div>
          </div>
          <button class="account-bar" id="m-account">
            ${user
              ? `👤 <b>${escapeHtml(user.name)}</b> ${user.isAdmin ? '• <span style="color:#f0d890">админ</span>' : ''} • 🏆 ${user.trophies || 0}`
              : '👤 Гость — <b>войти в аккаунт</b>'}
            • 💰 ${this.progress.gold}
            ${clan ? ` • 🛡 [${escapeHtml(clan.tag)}]` : ''}
          </button>
          <div class="menu-buttons">
            <button class="btn btn-primary btn-big" id="m-battle">⚔️ В бой!</button>
            <button class="btn btn-blue" id="m-deck">🃏 Моя колода (${this.deck.length}/8)</button>
            <button class="btn btn-ghost" id="m-progress">💰 Прокачка и сундуки</button>
            <button class="btn btn-ghost" id="m-rating">🏆 Рейтинг и сезоны</button>
            <button class="btn btn-ghost" id="m-campaign">📖 Кампания с боссами</button>
            <button class="btn btn-ghost" id="m-cup">🏆 Турнирная лига</button>
            <button class="btn btn-ghost" id="m-forge">🔥 Кузница и эволюция</button>
            <button class="btn btn-ghost" id="m-coop">🤝 Командный бой 2×2</button>
            <button class="btn btn-ghost" id="m-war">⚔️ Клановые войны</button>
            <button class="btn btn-ghost" id="m-pass">🎖 Бой-пропуск</button>
            <button class="btn btn-ghost" id="m-profile">⭐ Профиль и достижения</button>
            <button class="btn btn-ghost" id="m-replays">🎬 Реплеи (${this.replays.length})</button>
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
    this.root.querySelector('#m-progress').onclick = () => { this.sfx.play('ui'); this.showProgress(); };
    this.root.querySelector('#m-rating').onclick = () => { this.sfx.play('ui'); this.showRating(); };
    this.root.querySelector('#m-campaign').onclick = () => { this.sfx.play('ui'); this.showCampaign(); };
    this.root.querySelector('#m-cup').onclick = () => { this.sfx.play('ui'); this.showTournament(); };
    this.root.querySelector('#m-forge').onclick = () => { this.sfx.play('ui'); this.showForge(); };
    this.root.querySelector('#m-coop').onclick = () => { this.sfx.play('ui'); this.showCoop(); };
    this.root.querySelector('#m-war').onclick = () => { this.sfx.play('ui'); this.showClanWar(); };
    this.root.querySelector('#m-pass').onclick = () => { this.sfx.play('ui'); this.showPass(); };
    this.root.querySelector('#m-profile').onclick = () => { this.sfx.play('ui'); this.showProfile(); };
    this.root.querySelector('#m-replays').onclick = () => { this.sfx.play('ui'); this.showReplays(); };
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

  // ————— прогресс: золото, сундуки, уровни карт —————

  showProgress() {
    const p = this.progress;
    const render = () => {
      const list = this.cards().filter((c) => !c.hidden);
      this.setScreen(`
        <div class="screen">
          <div class="top-bar">
            <button class="btn btn-ghost" id="back">←</button>
            <div>
              <div class="top-title">💰 Прокачка</div>
              <div class="top-sub">Золото: <b style="color:#f0b13c">${p.gold}</b></div>
            </div>
          </div>
          <div class="screen-scroll">
            <div class="form-section">
              <h3>Сундуки (до 4)</h3>
              ${p.chests.length ? `<div class="row wrap">${p.chests.map((c, i) => `
                  <button class="btn btn-chip chest-btn" data-chest="${i}" style="padding:10px 14px">
                    ${c.icon || '📦'} Открыть
                  </button>`).join('')}</div>`
                : '<div class="muted">Сундуков нет. Выигрывайте бои — сундуки падают за победы!</div>'}
            </div>
            <div class="form-section">
              <h3>Уровни карт</h3>
              <div class="muted mb12">Для апгрейда нужны <b>золото</b> и <b>копии именно этой карты</b> (копии падают из сундуков). Уровень повышает HP и урон (×${levelMultiplier(2).toFixed(2)} за уровень).</div>
              ${list.map((c) => {
                const chk = canUpgrade(p, c.id);
                return `
                <div class="friend-row">
                  <div style="flex:1">
                    <b>${escapeHtml(c.name)}</b>
                    <div class="muted" style="font-size:11px">ур. <b>${chk.level}</b>/${LEVEL_MAX} • копии: <b style="color:${chk.haveCopies >= chk.needCopies ? '#7dff9e' : '#ff9c9c'}">${chk.haveCopies}</b>/${chk.needCopies} • ${chk.needGold} 💰</div>
                  </div>
                  ${!chk.max
                    ? `<button class="btn btn-chip" data-up="${c.id}" ${chk.ok ? '' : 'style="opacity:0.55"'}>⬆ Улучшить</button>`
                    : '<span style="color:#f0d890">МАКС</span>'}
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>
      `);
      this.root.querySelector('#back').onclick = () => this.showMenu();
      this.root.querySelectorAll('[data-chest]').forEach((el) => {
        el.onclick = () => {
          const i = parseInt(el.dataset.chest, 10);
          const chest = p.chests[i];
          if (!chest) return;
          p.chests.splice(i, 1);
          this._persist();
          this.showChestOpening(chest, () => render());
        };
      });
      this.root.querySelectorAll('[data-up]').forEach((el) => {
        el.onclick = () => {
          const id = el.dataset.up;
          const r = applyUpgrade(p, id);
          if (!r.ok) {
            this.toast(r.error);
            return;
          }
          this._persist();
          this.sfx.play('win');
          const c = this.cards().find((x) => x.id === id);
          this.toast(`${c ? c.name : id}: уровень ${r.level}!`);
          render();
        };
      });
    };
    render();
  }

  // красивое поэтапное вскрытие сундука: лут выпадает карточками с сиянием редкости
  showChestOpening(chest, onClose) {
    const p = this.progress;
    const cardPool = this.cards().filter((c) => !c.hidden).map((c) => ({ id: c.id, rarity: c.rarity }));
    const rew = openChest(chest, cardPool);
    const RARITY_GLOW = {
      common: '#b8c0cc', rare: '#f0a13c', epic: '#c26bf2', legendary: '#49d9ff'
    };

    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="modal chest-modal">
        <div class="chest-stage" id="chest-stage">
          <div class="chest-big" id="chest-big">${chest.icon || '📦'}</div>
          <div class="chest-hint" id="chest-hint">Нажмите, чтобы открыть!</div>
        </div>
        <div class="chest-loot" id="chest-loot"></div>
        <button class="btn btn-primary" id="chest-done" style="display:none">Отлично!</button>
      </div>`;

    const stage = ov.querySelector('#chest-stage');
    const big = ov.querySelector('#chest-big');
    const loot = ov.querySelector('#chest-loot');
    const doneBtn = ov.querySelector('#chest-done');
    let opened = false;
    let idx = 0;
    const newlyUnlocked = [];

    const revealNext = () => {
      if (idx >= rew.items.length) {
        doneBtn.style.display = '';
        return;
      }
      const item = rew.items[idx++];
      const div = document.createElement('div');
      if (item.kind === 'gold') {
        div.className = 'loot-item loot-gold';
        div.innerHTML = `<span class="loot-icon">💰</span><div><b>+${item.amount} золота</b><div class="muted" style="font-size:11px">на прокачку карт</div></div>`;
      } else {
        const c = this.cards().find((x) => x.id === item.cardId);
        const glow = RARITY_GLOW[item.rarity] || RARITY_GLOW.common;
        div.className = 'loot-item loot-card';
        div.style.borderColor = glow;
        div.style.boxShadow = `0 0 18px ${glow}55`;
        div.innerHTML = `
          <div class="card-tile rarity-${item.rarity} ${item.hero ? 'hero' : ''}" style="width:58px">
            <div class="card-cost">${c ? c.cost : '?'}</div>
            ${c ? this.cardIconHtml(c) : ''}
          </div>
          <div>
            <b>${escapeHtml(c ? c.name : item.cardId)}</b>
            <div style="font-size:12px;color:${glow}">+${item.count} копий</div>
            <div class="muted" style="font-size:10px">${RARITY[item.rarity]?.label || item.rarity}</div>
          </div>`;
      }
      loot.appendChild(div);
      div.scrollIntoView && div.scrollIntoView({ block: 'nearest' });
      this.sfx.play(item.kind === 'gold' ? 'win' : 'ui');
      setTimeout(revealNext, item.kind === 'gold' ? 550 : 750);
    };

    const open = () => {
      if (opened) return;
      opened = true;
      big.classList.add('chest-open');
      this.sfx.play('boom');
      ov.querySelector('#chest-hint').style.display = 'none';
      // начисляем лут
      p.gold += rew.gold;
      for (const item of rew.items) {
        if (item.kind === 'cards') {
          const c = this.cards().find((x) => x.id === item.cardId);
          if (c && c.hero) {
            const got = addHeroFragments(p, item.cardId, item.count);
            const need = c.fragmentCost || HERO_FRAGMENTS_FOR_UNLOCK;
            if (got >= need && unlockHero(p, item.cardId)) newlyUnlocked.push(item.cardId + '|hero');
          } else {
            addCardCopies(p, item.cardId, item.count);
            if (unlockCard(p, item.cardId)) newlyUnlocked.push(item.cardId);
          }
        }
      }
      this._persist();
      setTimeout(revealNext, 450);
    };

    stage.onclick = open;
    doneBtn.onclick = () => {
      ov.remove();
      if (newlyUnlocked.length) {
        const names = newlyUnlocked.map((id) => {
          const isHero = id.endsWith('|hero');
          const realId = isHero ? id.slice(0, -5) : id;
          const c = this.cards().find((x) => x.id === realId);
          return (isHero ? '🦸 ' : '') + (c ? c.name : realId) + (isHero ? ' (герой)' : '');
        }).join(', ');
        this.toast('🆕 Карты открыты: ' + names);
      }
      if (onClose) onClose();
    };
    document.body.appendChild(ov);
  }

  // ————— рейтинг, лиги, сезоны —————

  showRating() {
    const user = accounts.current();
    const trophies = (user && user.trophies) || 0;
    const league = leagueFor(trophies);
    const next = nextLeague(trophies);
    const arena = arenaFor(trophies);
    const nArena = nextArena(trophies);
    const stars = (d) => '★'.repeat(d + 1) + '☆'.repeat(5 - d);
    const users = accounts.users()
      .filter((u) => u.name !== 'admin')
      .sort((a, b) => (b.trophies || 0) - (a.trophies || 0))
      .slice(0, 12);
    const season = accounts.seasonInfo();
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">🏆 Рейтинг</div>
            <div class="top-sub">Сезон ${escapeHtml(season.id)} • ${seasonDaysLeft()} дн. до конца</div>
          </div>
        </div>
        <div class="screen-scroll">
          <div class="form-section" style="text-align:center">
            <div style="font-size:52px">${league.icon}</div>
            <h3 style="margin:6px 0;color:${league.color}">Лига «${league.name}»</h3>
            <div class="muted">🏆 ${trophies} трофеев${next ? ` • до лиги «${next.name}» ещё ${next.min - trophies}` : ' • максимальная лига!'}</div>
            <div class="muted" style="margin-top:8px">${arena.icon} Арена «${arena.name}» • сложность ИИ ${stars(arena.difficulty)}${nArena ? ` • до «${nArena.name}» ещё ${nArena.min - trophies} 🏆` : ''}</div>
          </div>
          <div class="form-section">
            <h3>Арены</h3>
            <div class="muted" style="font-size:11px;margin-bottom:8px">Арена растёт с кубками: своя тема поля и всё более умный бот.</div>
            ${ARENAS.map((A, i) => `
              <div class="friend-row" style="${A.id === arena.id ? 'border-color:#4d8df0' : ''}">
                <span style="font-size:20px">${A.icon}</span>
                <div style="flex:1"><b>${A.name}</b>
                  <div class="muted" style="font-size:11px">арена ${i + 1}/${ARENAS.length} • от ${A.min} 🏆 • ИИ ${stars(A.difficulty)}</div>
                </div>
                ${A.id === arena.id ? '<span>вы здесь</span>' : ''}
              </div>`).join('')}
          </div>
          <div class="form-section">
            <h3>Лиги</h3>
            ${LEAGUES.map((L) => `
              <div class="friend-row" style="${L.name === league.name ? 'border-color:' + L.color : ''}">
                <span style="font-size:20px">${L.icon}</span>
                <div style="flex:1"><b style="color:${L.color}">${L.name}</b>
                  <div class="muted" style="font-size:11px">от ${L.min} 🏆</div>
                </div>
                ${L.name === league.name ? '<span>вы здесь</span>' : ''}
              </div>`).join('')}
          </div>
          <div class="form-section">
            <h3>Локальная таблица лидеров</h3>
            ${users.length ? users.map((u, i) => `
              <div class="friend-row">
                <span style="width:26px;text-align:center">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : (i + 1)}</span>
                <div style="flex:1"><b>${escapeHtml(u.name)}</b>${user && u.name === user.name ? ' <span class="muted">(вы)</span>' : ''}</div>
                <span>🏆 ${u.trophies || 0}</span>
              </div>`).join('') : '<div class="muted">Пока никто не сразился</div>'}
            <div class="muted mt8" style="font-size:11px">Таблица — по аккаунтам этого устройства.</div>
          </div>
          <div class="form-section">
            <h3>Награда сезона</h3>
            <div class="info-list">В конце сезона по лиге выдаётся золото (сейчас: <b>${seasonReward(trophies).gold} 💰</b>), затем трофеи снижаются на 30%.</div>
          </div>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
  }

  // ————— реплеи —————

  showReplays() {
    const list = this.replays;
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">🎬 Реплеи</div>
            <div class="top-sub">Хранятся последние ${REPLAY_LIMIT} боя</div>
          </div>
        </div>
        <div class="screen-scroll">
          ${list.length ? list.map((r, i) => `
            <div class="form-section">
              <h3>${r.meta.result === 'win' ? '🏆 Победа' : r.meta.result === 'draw' ? '🤝 Ничья' : '💀 Поражение'} • ${new Date(r.meta.date).toLocaleString('ru')}</h3>
              <div class="muted mb12">${escapeHtml(String(r.meta.mode || 'normal'))} • ${r.snaps.length} кадров</div>
              <div class="row wrap">
                <button class="btn btn-primary" data-play="${i}">▶ Смотреть</button>
                <button class="btn btn-ghost" data-share="${i}">🔗 Код</button>
                <button class="btn btn-chip danger" data-del="${i}">✕</button>
              </div>
            </div>`).join('') : `
            <div class="form-section" style="text-align:center">
              <div style="font-size:42px">🎬</div>
              <h3>Реплеев пока нет</h3>
              <div class="muted">Сыграйте бой — он запишется автоматически.</div>
            </div>`}
          <div class="form-section">
            <h3>Импорт по коду</h3>
            <div class="row">
              <input class="input" id="rp-code" placeholder="BR1.…" style="flex:1;min-width:150px">
              <button class="btn btn-blue" id="rp-import">📥</button>
            </div>
          </div>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
    this.root.querySelectorAll('[data-play]').forEach((el) => {
      el.onclick = () => this.showReplayPlayer(this.replays[parseInt(el.dataset.play, 10)]);
    });
    this.root.querySelectorAll('[data-share]').forEach((el) => {
      el.onclick = async () => {
        const code = encodeReplay(this.replays[parseInt(el.dataset.share, 10)]);
        if (!code) return this.toast('Не удалось закодировать');
        const ok = await copyText(code);
        this.toast(ok ? 'Код реплея скопирован (' + Math.round(code.length / 1024) + ' КБ)' : 'Скопируйте код вручную');
      };
    });
    this.root.querySelectorAll('[data-del]').forEach((el) => {
      el.onclick = () => {
        this.replays.splice(parseInt(el.dataset.del, 10), 1);
        this._saveReplays();
        this.showReplays();
      };
    });
    this.root.querySelector('#rp-import').onclick = () => {
      const r = decodeReplay(this.root.querySelector('#rp-code').value);
      if (!r) return this.toast('Код не распознан');
      this.replays = saveReplayToList(this.replays, r);
      this._saveReplays();
      this.toast('Реплей импортирован');
      this.showReplays();
    };
  }

  showReplayPlayer(replay) {
    if (!replay || !replay.snaps || !replay.snaps.length) {
      this.toast('Пустой реплей');
      return;
    }
    const cardsById = new Map(this.cards().map((c) => [c.id, c]));
    const battle = new RemoteBattle({ cardsById, sendIntent: () => {} });
    this.battle = battle;
    this.battleMode = 'replay';
    this.ai = { update() {} };
    this._replayData = replay;
    this._replayIdx = 0;
    this._replayTimer = 0;
    this.setScreen(`
      <div class="battle-screen">
        <div class="battle-top">
          <button class="btn btn-ghost" id="b-pause">←</button>
          <div class="battle-timer" id="b-timer">0:00</div>
          <div class="crowns">
            <span class="crown-p">👑<span id="b-cp">0</span></span>
            <span class="muted">:</span>
            <span class="crown-a"><span id="b-ca">0</span>👑</span>
          </div>
          <span class="spacer"></span>
          <button class="btn btn-ghost" id="rp-restart">↻</button>
        </div>
        <div class="battle-canvas-wrap" id="b-canvas"></div>
        <div class="battle-bottom">
          <div class="battle-hint">🎬 Реплей • ${replay.meta.result === 'win' ? 'Победа' : replay.meta.result === 'draw' ? 'Ничья' : 'Поражение'}</div>
        </div>
      </div>
    `);
    const canvasHost = this.root.querySelector('#b-canvas');
    requestAnimationFrame(() => {
      try {
        this.battleView = new BattleView(canvasHost, battle, { team: 'player', onDeployRequest: () => {} });
        this.battleView.resize();
      } catch (e) {
        console.error('Арена недоступна:', e);
        canvasHost.innerHTML = '<div style="padding:30px;text-align:center">Арена недоступна — реплей не воспроизвести</div>';
      }
    });
    this.root.querySelector('#b-pause').onclick = () => this.showReplays();
    this.root.querySelector('#rp-restart').onclick = () => this.showReplayPlayer(replay);
    this._battleLoop();
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
            <h3>🌐 Онлайн-бой 1×1</h3>
            <div class="muted mb12">Играйте с другом по сети: создайте комнату и сообщите ему код.</div>
            <button class="btn btn-primary btn-block" id="b-online-create" style="margin-bottom:10px">🌐 Создать комнату</button>
            <div class="row">
              <input class="input" id="net-code" maxlength="6" placeholder="Код комнаты" style="flex:1;min-width:120px;text-transform:uppercase">
              <button class="btn btn-blue" id="b-online-join">Войти</button>
            </div>
            <div class="muted mt8" style="font-size:11px">Сервер: <span id="net-url-label">${escapeHtml(this.settings.netServer || DEFAULT_NET_URL)}</span>
              <button class="btn btn-chip" id="net-url-edit" style="margin-left:6px">⚙</button>
            </div>
          </div>
          <div class="form-section">
            <h3>🎲 Особые режимы</h3>
            <div class="row wrap">
              <button class="btn btn-chip" id="m-sudden">💀 Внезапная смерть</button>
              <button class="btn btn-chip" id="m-x2">⚡ Двойной эликсир</button>
              <button class="btn btn-chip" id="m-draft">🎲 Драфт</button>
              <button class="btn btn-chip" id="m-tournament">🏆 Турнир</button>
            </div>
            <div class="muted mt8" style="font-size:11px">
              💀 первая снесённая башня = победа • ⚡ эликсир ×2 с начала •
              🃏 случайные колоды обоим • 🏆 3 боя подряд, награда за 2 победы
            </div>
          </div>
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
    this.root.querySelector('#b-online-create').onclick = () => { this.sfx.play('ui'); this._netCreate(); };
    this.root.querySelector('#b-online-join').onclick = () => {
      this.sfx.play('ui');
      const code = (this.root.querySelector('#net-code').value || '').trim();
      if (!code) {
        this.toast('Введите код комнаты');
        return;
      }
      this._netJoin(code);
    };
    this.root.querySelector('#m-sudden').onclick = () => {
      this.sfx.play('ui');
      this.startBattle('sudden');
    };
    this.root.querySelector('#m-x2').onclick = () => {
      this.sfx.play('ui');
      this.startBattle('x2');
    };
    this.root.querySelector('#m-draft').onclick = () => {
      this.sfx.play('ui');
      this.showDraft();
    };
    this.root.querySelector('#m-tournament').onclick = () => {
      this.sfx.play('ui');
      this.progress.tournament = { wins: 0, games: 0 };
      this._persist();
      this.startBattle('tournament');
    };
    this.root.querySelector('#net-url-edit').onclick = async () => {
      const ov = document.createElement('div');
      ov.className = 'overlay';
      ov.innerHTML = `
        <div class="modal" style="text-align:left">
          <h2>Сетевой сервер</h2>
          <p class="muted">Адрес релея для онлайн-боёв. По умолчанию — сервер этой сборки.
          Свой: разверните tools/net/relay.mjs и укажите http://ip:8787</p>
          <input class="input" id="net-url-input" style="width:100%" value="${escapeHtml(this.settings.netServer || DEFAULT_NET_URL)}">
          <div class="row mt12">
            <button class="btn btn-primary" data-a="save">Сохранить</button>
            <button class="btn btn-ghost" data-a="close">Отмена</button>
          </div>
        </div>`;
      ov.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-a]');
        if (!b) return;
        if (b.dataset.a === 'save') {
          this.settings.netServer = ov.querySelector('#net-url-input').value.trim() || DEFAULT_NET_URL;
          storage.setSettings(this.settings);
          this.toast('Сервер сохранён');
        }
        ov.remove();
      });
      document.body.appendChild(ov);
    };
  }

  // ————— онлайн-бой —————

  _netUrl() {
    return (this.settings.netServer || DEFAULT_NET_URL).trim().replace(/\/+$/, '');
  }

  _netMakeClient() {
    if (this.net) {
      try { this.net.close(); } catch { /* ignore */ }
    }
    const net = new NetClient(this._netUrl());
    this.net = net;
    this._onlineWaiting = true;
    net.onPeer = (joined) => {
      if (!joined) this._netHandleLost();
    };
    net.onStatus = (st) => {
      if (st === 'lost') this._netHandleLost();
    };
    return net;
  }

  _netHandleLost() {
    if (this._onlineWaiting) {
      this.toast('Соперник отключился');
      this._netCancelWait();
      return;
    }
    if (this.battleMode && this.battleMode.startsWith('online') && this.battle && !this.battle.finished) {
      this.toast('Соединение потеряно');
      this._netCloseAndFinish();
    }
  }

  _netCloseAndFinish() {
    try { this.net && this.net.close(); } catch { /* ignore */ }
    this.net = null;
    this._onlineWaiting = false;
    if (this.battle && !this.battle.finished) {
      this.battle.finished = true;
      this.battle.result = { winner: 'draw', reason: 'disconnect' };
      this._showResult();
    }
  }

  async _netCreate() {
    if (this.deck.length < 4) {
      this.toast('В колоде должно быть минимум 4 карты');
      return;
    }
    const net = this._netMakeClient();
    this.showOnlineWait('host', '……');
    try {
      await net.connect();
    } catch {
      this.toast('Сервер недоступен: ' + this._netUrl());
      this._netCancelWait();
      return;
    }
    let code;
    try {
      code = await net.createRoom();
    } catch (e) {
      this.toast(e.message || 'Не удалось создать комнату');
      this._netCancelWait();
      return;
    }
    this._onlineRoom = code;
    this.showOnlineWait('host', code);
    net.onMessage = (msg) => this._netOnMessage(msg);
  }

  async _netJoin(code) {
    const net = this._netMakeClient();
    this.showOnlineWait('guest', code);
    try {
      await net.connect();
      await net.joinRoom(code);
    } catch (e) {
      this.toast(e.message || 'Не удалось войти в комнату');
      this._netCancelWait();
      return;
    }
    this._onlineRoom = code;
    this.showOnlineWait('guest', code);
    net.onMessage = (msg) => this._netOnMessage(msg);
    // представляемся хосту: колода + свои карты
    net.send({ t: 'hello', deck: this.deck.slice(0, 8), cards: this.customCards });
  }

  showOnlineWait(role, code) {
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">🌐 Онлайн-бой</div>
            <div class="top-sub">${role === 'host' ? 'Ожидание соперника' : 'Подключение к комнате'}</div>
          </div>
        </div>
        <div class="screen-scroll" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;gap:14px">
          <div style="font-size:40px">📡</div>
          <div class="muted">${role === 'host'
            ? 'Сообщите код другу — бой начнётся, когда он подключится'
            : 'Ждём, пока хост начнёт бой…'}</div>
          <div class="friend-code" style="font-size:26px">${escapeHtml(code)}</div>
          ${role === 'host' ? '<button class="btn btn-blue" id="copy-room">📋 Копировать код</button>' : ''}
          <button class="btn btn-ghost" id="cancel-wait">Отмена</button>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this._netCancelWait();
    this.root.querySelector('#cancel-wait').onclick = () => this._netCancelWait();
    const cp = this.root.querySelector('#copy-room');
    if (cp) cp.onclick = async () => {
      const ok = await copyText(code);
      this.toast(ok ? 'Код скопирован' : 'Скопируйте код вручную');
    };
  }

  _netCancelWait() {
    try { this.net && this.net.close(); } catch { /* ignore */ }
    this.net = null;
    this._onlineRoom = null;
    this._onlineWaiting = false;
    this.showBattleMenu();
  }

  _netOnMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.t === 'hello') {
      // гость представился → стартуем бой как хост
      const deck = sanitizeDeck(msg.deck).slice(0, 8);
      const guestCards = sanitizeCards(msg.cards || []);
      if (deck.length < 4) {
        this.toast('У соперника некорректная колода');
        this._netCancelWait();
        return;
      }
      this.customCards = [...this.customCards.filter((c) => !guestCards.some((g) => g.id === c.id)), ...guestCards];
      this.cards();
      this._onlineGuestDeck = deck;
      this.net.send({ t: 'start', hostDeck: this.deck.slice(0, 8), cards: this.customCards });
      this.startBattle('online-host');
      return;
    }
    if (msg.t === 'start') {
      // хост начал бой → мы гость
      const hostCards = sanitizeCards(msg.cards || []);
      this.customCards = [...this.customCards.filter((c) => !hostCards.some((g) => g.id === c.id)), ...hostCards];
      this.cards();
      const cardsById = new Map(this.cards().map((c) => [c.id, c]));
      this.remoteBattle = new RemoteBattle({
        cardsById,
        sendIntent: (m) => this.net && this.net.send(m)
      });
      this._onlineHostDeck = sanitizeDeck(msg.hostDeck).slice(0, 8);
      this.startBattle('online-guest');
      return;
    }
    if (msg.t === 'snap') {
      if (this.remoteBattle) this.remoteBattle.applySnapshot(msg);
      return;
    }
    if (msg.t === 'intent') {
      this._remoteIntents = this._remoteIntents || [];
      this._remoteIntents.push(msg);
      return;
    }
    if (msg.t === 'bye') {
      this.toast('Соперник вышел из боя');
    }
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
              <div class="card-tile rarity-${c.rarity} ${c.hero ? 'hero' : ''} ${this.deck.includes(c.id) ? 'in-deck' : ''}" data-id="${c.id}">
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
    const cLvl = cardLevel(this.progress, c.id) || 1;
    const stats = c.type === 'spell'
      ? `Радиус: <b>${c.spell?.radius}</b> • Эффект: <b>${SPELL_EFFECTS[c.spell?.effect] || c.spell?.effect}</b>` +
        (c.spell?.damage ? ` • Урон: <b>${c.spell.damage}</b>` : '') +
        (c.spell?.heal ? ` • Лечение: <b>${c.spell.heal}</b>` : '')
      : `HP: <b>${c.hp}</b> <span style="color:#f0d890">ур.${cLvl}</span> • Урон: <b>${c.damage}</b> • Скор. атаки: <b>${c.hitSpeed}с</b><br>
         Дальность: <b>${c.range}</b> • Скорость: <b>${c.speed || 0}</b> • Цели: <b>${c.targets === 'both' ? 'земля+воздух' : 'земля'}</b>${c.flying ? ' • <b>летает</b>' : ''}${c.buildingOnly ? ' • <b>только здания</b>' : ''}${c.splash ? ` • Урон по площади: <b>${c.splash}</b>` : ''}${c.tags?.length ? ` • <b>Теги:</b> ${c.tags.map(t => '<span class="ability-tag">' + (TAG_LABELS[t] || t) + '</span>').join(' ')}` : ''}`;

    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="modal" style="text-align:left">
        <h2 style="margin:0 0 8px 0">${c.name}</h2>
        <div class="row">
          <div class="card-tile rarity-${c.rarity} ${c.hero ? 'hero' : ''}" style="width:86px">
            <div class="card-cost">${c.cost}</div>
            ${this.cardIconHtml(c)}
          </div>
          <div style="flex:1">
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
        ${(() => {
          const chk = canUpgrade(this.progress, c.id);
          return `<div class="mt12" style="font-size:12px">
            <b style="color:#f0d890">Уровень:</b> <b>${chk.level}</b>/${LEVEL_MAX} • HP/урон ×${levelMultiplier(chk.level).toFixed(2)}
            ${chk.max ? ' • <b style="color:#f0d890">МАКС</b>'
              : `<br>Апгрейд: <b>${chk.needGold} 💰</b> + копии карты: <b style="color:${chk.haveCopies >= chk.needCopies ? '#7dff9e' : '#ff9c9c'}">${chk.haveCopies}/${chk.needCopies}</b>`}
          </div>`;
        })()}
        ${abilities.length ? `<div class="mt12"><b style="color:#f0d890">Абилки:</b> ${abilities.join(', ')}</div>` : ''}
        <div class="row mt16" style="flex-wrap:wrap">
          <button class="btn btn-primary" data-a="deck">${this.deck.includes(c.id) ? 'Убрать из колоды' : 'В колоду'}</button>
          ${canUpgrade(this.progress, c.id).max ? '' : '<button class="btn btn-chip" data-a="upgrade">⬆ Прокачать</button>'}
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
      if (b.dataset.a === 'upgrade') {
        const r = applyUpgrade(this.progress, c.id);
        if (!r.ok) {
          this.toast(r.error);
          return;
        }
        this._persist();
        this.sfx.play('win');
        this.toast(`${c.name}: уровень ${r.level}!`);
        ov.remove();
        this.showCardDetail(c.id);
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
                  ? `<div class="deck-slot filled rarity-${c.rarity} ${c.hero ? 'hero' : ''}" data-drop="${c.id}">
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
          <div class="muted mb12">Нажмите на карту, чтобы изменить характеристики, абилки и рисунок карты. Пользовательские карты помечены ✏️.</div>
          <div class="cards-grid">
            ${list.map((c) => `
              <div class="card-tile rarity-${c.rarity} ${c.hero ? 'hero' : ''}" data-edit="${c.id}">
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

  showCardEditor(cardId, draftOverride = null, opts = {}) {
    const globalTarget = !!opts.global; // админ: сохранить карту ДЛЯ ВСЕХ
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
          art: null,
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
                <div class="form-field"><label>Теги (через запятую)</label>
                  <input class="input" id="f-tags" value="${(draft.tags || []).join(', ')}" placeholder="наземное, полётное, танк, дамагер, вин-кондишон, здание, заклинание, герой, рой, по площади, призывает">
                  <div class="muted" style="font-size:11px">Автоподбор: наземное/полётное, танк, дамагер, вин-кондишон, рой, по площади, призывает, здание, заклинание, герой</div>
                </div>
                ${draft.type === 'building' ? `<div class="form-field"><label>Время жизни (сек)</label><input class="input" type="number" id="f-life" value="${draft.building?.lifetime ?? 30}"></div>` : ''}
                <div class="form-field"><label>Герой (открывается фрагментами)</label>
                  <select class="input" id="f-hero"><option value="0" ${!draft.hero ? 'selected' : ''}>Нет</option><option value="1" ${draft.hero ? 'selected' : ''}>Да</option></select>
                </div>
                ${draft.hero ? `<div class="form-field"><label>Стоимость фрагментов</label><input class="input" type="number" id="f-fragcost" value="${draft.fragmentCost || HERO_FRAGMENTS_FOR_UNLOCK}"></div>
                <div class="form-field"><label>Открывается при кубках</label><input class="input" type="number" id="f-unlocktroph" value="${draft.unlockTrophies || 0}"></div>` : ''}
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
              <h3>Рисунок карты</h3>
              <div class="muted mb12">Нарисуйте карту сами — кисть, цвета, штампы — и оживите её анимацией (кадры, покачивание, пульс…).</div>
              <button class="btn btn-blue btn-block" id="open-model">🎨 Открыть редактор рисунка</button>
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
        this.showArtEditorScreen(draft, (art) => {
          draft.art = art;
          clearSpriteCache();
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
      // при смене типа карты форма должна перерисоваться под новый тип
      const typeSel = this.root.querySelector('#f-type');
      if (typeSel) {
        typeSel.onchange = () => { collect(); render(); };
      }
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
        // теги: ручной ввод или автогенерация по свойствам карты
        const manualTags = q('#f-tags')?.value?.split(',').map((s) => s.trim()).filter(Boolean) || [];
        draft.tags = manualTags.length > 0 ? manualTags : autoTags(draft);
        if (q('#f-life')) draft.building = { lifetime: clampNum(q('#f-life').value, 5, 120, 30) };
        if (q('#f-hero')) {
          draft.hero = q('#f-hero').value === '1';
          draft.fragmentCost = clampNum(q('#f-fragcost')?.value || HERO_FRAGMENTS_FOR_UNLOCK, 1, 500, HERO_FRAGMENTS_FOR_UNLOCK);
          draft.unlockTrophies = clampNum(q('#f-unlocktroph')?.value || 0, 0, 9999, 0);
        }
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
        // чистим поля, не относящиеся к типу карты, иначе при смене типа
        // остаются старые настройки юнита/здания/заклинания и ломают карту
        if (draft.type === 'spell') {
          draft.building = null;
          draft.spell = draft.spell || { radius: 2.5, effect: 'damage', damage: 200, heal: 0, duration: 0, targetsAir: true, targetsGround: true };
        } else {
          draft.spell = null;
          if (draft.type !== 'building') draft.building = null;
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
        if (globalTarget) {
          // админ публикует карту для ВСЕХ игроков устройства
          const r = accounts.addGlobalCard(draft);
          if (!r.ok) {
            this.toast(r.error || 'Не удалось сохранить глобальную карту');
            return;
          }
          clearSpriteCache();
          this.cards();
          this.toast(`Карта «${draft.name}» теперь доступна ВСЕМ игрокам!`);
          this.showAdmin();
          return;
        }
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
      const war = accounts.clanWar();
      const myScore = war.score[clan.tag] || 0;
      const rivalScore = war.rival.score;
      const chestNeed = 20;
      const chestHave = Math.min(chestNeed, clan.chestCrowns || 0);
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
              <h3>🎁 Клановый сундук</h3>
              <div class="muted mb8">Короны победивших членов клана наполняют общий сундук (нужно ${chestNeed}).</div>
              <div class="bal-bar"><div class="bal-fill" style="width:${Math.round(100 * chestHave / chestNeed)}%"></div></div>
              <div class="muted mt8">${chestHave}/${chestNeed} корон</div>
              <button class="btn btn-primary btn-block" id="clan-chest" style="margin-top:10px" ${chestHave < chestNeed ? 'disabled' : ''}>🎁 Забрать награду (150 💰)</button>
            </div>
            <div class="form-section">
              <h3>⚔️ Клановая война недели</h3>
              <div class="friend-row">
                <div style="flex:1"><b>[${escapeHtml(clan.tag)}] ${escapeHtml(clan.name)}</b></div>
                <span>${myScore} очков</span>
              </div>
              <div class="friend-row">
                <div style="flex:1"><b>🛡 ${escapeHtml(war.rival.name)}</b></div>
                <span>${rivalScore} очков</span>
              </div>
              <div class="bal-bar"><div class="bal-fill ${myScore < rivalScore ? 'over' : ''}" style="width:${Math.round(100 * myScore / Math.max(1, myScore + rivalScore))}%"></div></div>
              <div class="muted mt8" style="font-size:11px">Победы в обычных боях приносят клану очки войны. В конце сезона победителю — золото.</div>
            </div>
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
      const chestBtn = this.root.querySelector('#clan-chest');
      if (chestBtn && chestHave >= chestNeed) {
        chestBtn.onclick = () => {
          const r = accounts.claimClanChest();
          if (!r.ok) return this.toast(r.error);
          this.progress.gold += r.gold;
          this._persist();
          this.toast(`Клановый сундук: +${r.gold} 💰`);
          this.showClan();
        };
      }
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
          <div class="form-section">
            <h3>🌍 Карты для всех игроков</h3>
            <div class="muted mb12">Эти карты видят и могут использовать ВСЕ аккаунты и гости на этом устройстве.</div>
            ${(() => {
              const g = accounts.globalCards();
              return g.length
                ? g.map((c) => `
                  <div class="friend-row">
                    <div style="flex:1">
                      <b>${escapeHtml(c.name)}</b>
                      <div class="muted" style="font-size:11px">${RARITY[c.rarity]?.label || c.rarity} • ${TYPE_LABELS[c.type] || c.type} • ${c.cost} эликсира</div>
                    </div>
                    <button class="btn btn-chip danger" data-gdel="${c.id}">🗑</button>
                  </div>`).join('')
                : '<div class="muted">Глобальных карт пока нет.</div>';
            })()}
            <div class="row wrap" style="margin-top:10px">
              <button class="btn btn-primary" id="g-create">➕ Создать для всех</button>
              <button class="btn btn-blue" id="g-import">📥 Импорт по коду</button>
              <button class="btn btn-ghost" id="g-publish">📢 Опубликовать мою</button>
            </div>
          </div>
          <button class="btn btn-primary btn-block btn-big" id="p-save" style="margin:10px 0 10px">💾 Сохранить баланс</button>
          <div class="form-section">
            <h3>🎁 Выдать себе ресурсы (только админ)</h3>
            <div class="muted mb12">Для тестирования и быстрой прокачки своего аккаунта.</div>
            <div class="row wrap">
              <button class="btn btn-primary" id="a-gold">💰 +5000 золота</button>
              <button class="btn btn-primary" id="a-cards">🃏 Открыть все карты</button>
              <button class="btn btn-primary" id="a-heroes">🦸 Все герои</button>
              <button class="btn btn-primary" id="a-pass">🎖 max уровень пропуска</button>
              <button class="btn btn-primary" id="a-chests">📦 Все сундуки</button>
            </div>
          </div>
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

    // ——— глобальные карты ———
    this.root.querySelectorAll('[data-gdel]').forEach((el) => {
      el.onclick = async () => {
        const ok = await this.confirmModal('Удалить глобальную карту?', 'Карта пропадёт у всех игроков.', [
          { label: 'Удалить', value: true, primary: true },
          { label: 'Отмена', value: false }
        ]);
        if (!ok) return;
        const r = accounts.removeGlobalCard(el.dataset.gdel);
        if (r.ok) {
          clearSpriteCache();
          this.toast('Глобальная карта удалена');
          this.showAdmin();
        }
      };
    });
    const gCreate = this.root.querySelector('#g-create');
    if (gCreate) gCreate.onclick = () => this.showCardEditor(null, null, { global: true });
    const gImport = this.root.querySelector('#g-import');
    if (gImport) gImport.onclick = async () => {
      let code = '';
      try {
        code = (window.prompt || prompt)('Вставьте код карты BC1.…', '');
      } catch { return; }
      if (!code) return;
      const card = decodeCard(code);
      if (!card) {
        this.toast('Код карты не распознан');
        return;
      }
      const r = accounts.addGlobalCard(card);
      this.toast(r.ok ? `Карта «${card.name}» добавлена для всех!` : (r.error || 'Ошибка'));
      if (r.ok) {
        clearSpriteCache();
        this.showAdmin();
      }
    };
    const gPublish = this.root.querySelector('#g-publish');
    if (gPublish) gPublish.onclick = () => {
      const mine = this.customCards;
      if (!mine.length) {
        this.toast('У вас нет своих карт — создайте в редакторе');
        return;
      }
      const list = mine.map((c, i) => `${i + 1}. ${c.name}`).join('\n');
      let ans = '';
      try {
        ans = (window.prompt || prompt)(`Опубликовать карту для всех:\n${list}\n\nВведите номер:`, '1');
      } catch { return; }
      const idx = parseInt(ans, 10) - 1;
      const src = mine[idx];
      if (!src) return;
      const clone = JSON.parse(JSON.stringify(src));
      clone.id = 'global_' + Date.now();
      const r = accounts.addGlobalCard(clone);
      this.toast(r.ok ? `«${clone.name}» доступна всем игрокам!` : (r.error || 'Ошибка'));
      if (r.ok) {
        clearSpriteCache();
        this.showAdmin();
      }
    };

    // ——— выдача ресурсов админу (для тестирования) ———
    const give = (id, fn) => { const el = this.root.querySelector('#' + id); if (el) el.onclick = () => { this.sfx.play('ui'); fn(); this.toast('Готово'); this.showAdmin(); }; };
    give('a-gold', () => { this.progress.gold += 5000; });
    give('a-cards', () => { let n = 0; for (const c of this.allCards) { if (!c.hidden && unlockCard(this.progress, c.id)) n++; } this.toast('🃏 Карт открыто: ' + n); });
    give('a-heroes', () => { let n = 0; for (const c of this.allCards) { if (c.hero && unlockHero(this.progress, c.id)) n++; } this.toast('🦸 Героев: ' + n); });
    give('a-pass', () => { this.progress.pass.xp = PASS_TIERS * PASS_XP_PER_TIER; this.toast('🎖 Пропуск: макс. уровень'); });
    give('a-chests', () => { while (this.progress.chests.length < 4) this.progress.chests.push(chestByType('royal')); this.toast('📦 Сундуки заполнены'); });
  }

  // ————— редактор рисунка карты —————

  showArtEditorScreen(cardDraft, onDone) {
    this.setScreen(`
      <div class="screen" style="padding:0">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">🎨 Рисунок карты</div>
            <div class="top-sub">${escapeHtml(cardDraft.name)} — нарисуйте и анимируйте</div>
          </div>
        </div>
        <div id="me-host" style="flex:1;min-height:0"></div>
      </div>
    `);
    const host = this.root.querySelector('#me-host');
    const editor = new ArtEditor(host, cardDraft.art || emptyArt(), {
      onSave: (art) => {
        editor.dispose();
        onDone(art);
      },
      toast: (m) => this.toast(m)
    });
    this.root.querySelector('#back').onclick = () => {
      editor.dispose();
      onDone(cardDraft.art || emptyArt());
    };
    this._activeArtEditor = editor;
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
              <b>Королевские Схватки</b> — карточные бои в реальном времени.
              <br><br>• Полный ростер карт-архетипов<br>
              • Конструктор собственных карт<br>
              • Настройка абилок<br>
              • Рисование карт от руки + анимация<br>
              • Сетевой бой 1×1 по коду комнаты<br>
              • Упаковка в APK (см. APK_BUILD.md)
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
    if (this.deck.length < 4 && mode !== 'online-guest') {
      this.toast('В колоде должно быть минимум 4 карты');
      return;
    }
    this.battleMode = mode;
    const online = mode === 'online-host' || mode === 'online-guest';
    this._netKeepForBattle = online; // setScreen ниже не должен закрыть соединение
    this._onlineWaiting = false;
    if (mode === 'normal') {
      const bad = this.deckIssues();
      if (bad.length) {
        this.toast('Дисбалансные карты — только в дружеском бою');
        this.showBattleMenu();
        return;
      }
    }
    const all = this.cards().filter((c) => !c.hidden);
    // правила режима
    const rules = {
      matchTime: MATCH_TIME,
      doubleElixirAt: 120,
      suddenDeath: false,
      draft: false
    };
    if (mode === 'sudden') {
      rules.suddenDeath = true;
      rules.matchTime = 120;
    }
    if (mode === 'x2') rules.doubleElixirAt = 0;
    if (mode === 'draft') rules.draft = true;

    let enemyDeck;
    let playerDeck = this.deck.slice();
    if (mode === 'draft' && this._draftDeck && this._draftDeck.length === 8) {
      playerDeck = this._draftDeck.slice();
      this._draftDeck = null;
    }
    if (mode === 'online-host') {
      enemyDeck = this._onlineGuestDeck || [];
    } else if (mode === 'online-guest') {
      enemyDeck = this._onlineHostDeck || [];
    } else if (mode === 'draft') {
      // черновик: случайные колоды обоим из общего пула
      const pool = all.map((c) => c.id);
      const pick = () => {
        const copy = pool.slice();
        const out = [];
        while (out.length < 8 && copy.length) out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
        return out;
      };
      playerDeck = pick();
      enemyDeck = pick();
    } else if (friend && Array.isArray(friend.deck) && friend.deck.length >= 4) {
      enemyDeck = friend.deck.slice(0, 8);
    } else {
      const enemyPool = all.map((c) => c.id).filter((id) => !this.deck.includes(id));
      enemyDeck = [];
      while (enemyDeck.length < 8 && enemyPool.length) {
        enemyDeck.push(enemyPool.splice(Math.floor(Math.random() * enemyPool.length), 1)[0]);
      }
      while (enemyDeck.length < 8) enemyDeck.push(this.deck[enemyDeck.length % this.deck.length]);
    }

    // ——— контекстные режимы: кампания, 2×2, турнирная лига, клановая война ———
    let bossDef = null;
    if (mode === 'campaign' && this._campaignCtx && this._campaignCtx.mission) {
      const m = this._campaignCtx.mission;
      enemyDeck = m.deck.slice();
      rules.doubleElixirAt = m.rules.doubleElixirAt ?? 120;
      if (m.boss) bossDef = BOSSES[m.boss];
    }
    if (mode === 'coop') rules.doubleElixirAt = 90;
    if (mode === 'cup') rules.doubleElixirAt = 100;
    if (mode === 'clanwar') rules.doubleElixirAt = 100;

    // колоды в бой — с учётом уровней прокачки и эволюции
    const cardsById = new Map(this.cards().map((c) => [c.id, applyEvo(scaleCard(c, cardLevel(this.progress, c.id)), (this.progress.evo || {})[c.id] || 0)]));

    // арена по кубкам: своя тема поля и своя сложность ИИ
    const _cu = accounts.current();
    const arena = arenaFor((_cu && _cu.trophies) || 0);
    this.currentArena = arena;
    // погода и время суток на арене
    const wPool = {
      meadow: ['clear', 'rain', 'sunset', 'clear'],
      desert: ['clear', 'sunset', 'rain', 'sunset'],
      ice: ['snow', 'clear', 'snow', 'night'],
      lava: ['night', 'sunset', 'night', 'clear'],
      darkwood: ['night', 'rain', 'night', 'snow'],
      royal: ['clear', 'sunset', 'night', 'rain']
    }[arena.id] || ['clear'];
    this._battleWeather = wPool[Math.floor(Math.random() * wPool.length)];

    this.setScreen(`
      <div class="battle-screen">
        <div class="battle-top">
          <button class="btn btn-ghost" id="b-pause" style="padding:8px 12px">☰</button>
          <div class="battle-timer" id="b-timer">3:00</div>
          <div class="battle-arena" title="Арена — тема поля и сила ИИ">${arena.icon} ${arena.name} • арена ${ARENAS.indexOf(arena) + 1}/${ARENAS.length}</div>
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
            ${this._heroCardId ? `<button class="btn code-fab" id="b-hero" title="Активная абилка героя (1 раз за бой)">🦸</button>` : ''}
          </div>
          <div class="hand-row" id="b-hand"></div>
          <div class="battle-hint">${this.battleMode === 'friendly' ? '🤝 Дружеский бой — можно любые карты. ' : ''}Перетащите карту на арену: войска — на свою половину, заклинания — куда угодно</div>
        </div>
      </div>
    `);

    // бой создаётся ПОСЛЕ setScreen: иначе _stopBattle внутри setScreen его обнулит
    if (mode === 'online-guest') {
      this.battle = this.remoteBattle;
      this.ai = { update() {} };
      this._remoteIntents = [];
    } else {
      this.battle = new Battle({
        playerDeck,
        enemyDeck,
        cardsById,
        matchTime: rules.matchTime,
        doubleElixirAt: rules.doubleElixirAt,
        suddenDeath: rules.suddenDeath
      });
      // онлайн: командой соперника управляет живой игрок, а не ИИ;
      // сложность ИИ растёт с ареной (кубками)
      this.ai = online ? { update() {} } : new BattleAI(this.battle, 'ai', arena.difficulty);
      this._bossCtl = null;
      this._commanders = null;
      this._heroAbilityUsed = false;
      this._heroCardId = null;
      if (!online && mode !== 'replay') {
        const hc = playerDeck.find((id) => {
          const c = cardsById.get(id);
          return c && c.hero && isHeroUnlocked(this.progress, id);
        }) || null;
        this._heroCardId = hc;
      }
      if (bossDef) {
        this._bossCtl = new BossController(this.battle, 'ai', bossDef);
        const king = this.battle.towers.find((t) => t.team === 'ai' && t.kind === 'king');
        if (king && bossDef.hpBonus) {
          king.hpMax = (king.hpMax || king.hp) + bossDef.hpBonus;
          king.hp += bossDef.hpBonus;
        }
      }
      if (mode === 'coop') {
        const pool = all.map((c) => c.id).filter((id) => !this.deck.includes(id));
        const pick8 = (arr) => {
          const a = arr.slice();
          const out = [];
          while (out.length < 8 && a.length) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]);
          while (out.length < 8) out.push(this.deck[out.length % this.deck.length]);
          return out;
        };
        this._commanders = [
          new CommanderAI(this.battle, 'player', pick8(pool), 1),
          new CommanderAI(this.battle, 'ai', pick8(pool.slice().reverse()), 1)
        ];
      }
      if (mode === 'online-host') {
        this._remoteIntents = [];
        this._lastSnapAt = 0;
      }
    }
    this.battleRules = rules;
    // запись реплея (кроме просмотра реплеев)
    this._recorder = mode === 'replay' ? null : new ReplayRecorder({
      mode,
      playerDeck,
      enemyDeck,
      rules
    });

    const canvasHost = this.root.querySelector('#b-canvas');
    requestAnimationFrame(() => {
      try {
        this.battleView = new BattleView(canvasHost, this.battle, {
          team: 'player',
          theme: arena.colors,
          weather: this._battleWeather || 'clear',
          onDeployRequest: (cardId, x, y) => this._tryDeploy(cardId, x, y)
        });
        this.battleView.resize();
      } catch (e) {
        console.error('Арена недоступна:', e);
        canvasHost.innerHTML = `
          <div class="fallback-wrap">
            <div style="font-size:34px">🎮</div>
            <div style="font-size:14px;font-weight:700">Арена недоступна — упрощённый режим</div>
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
              const card = this.cards().find((x2) => x2.id === this.selectedCard);
              if (!own && !(card && card.type === 'spell')) {
                this.toast('Войска ставьте на свою половину! (заклинания — куда угодно)');
                return;
              }
              const r = halfEl.getBoundingClientRect();
              const fx = Math.min(1, Math.max(0, (ev.clientX - r.left) / (r.width || 1)));
              const fy = Math.min(1, Math.max(0, (ev.clientY - r.top) / (r.height || 1)));
              const x = -8.5 + fx * 17;
              // обе половины кликабельны (для заклинаний); своя: y∈[-15.5,-1.5], вражеская: y∈[1.5,15.5]
              const y = own ? (-15.5 + fy * 14) : (1.5 + fy * 14);
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
    const hb = this.root.querySelector('#b-hero');
    if (hb) hb.onclick = () => { this.sfx.play('ui'); this._activateHeroAbility(); };

    this.selectedCard = null;
    this._renderHand();
    this._battleLoop();
  }

  // ————— крупное обновление: кампания, турнир, кузница, 2×2, война, профиль, пропуск —————

  _grantXp(n) {
    const p = this.progress;
    const before = levelFromXp(p.xp || 0);
    p.xp = (p.xp || 0) + Math.max(0, n | 0);
    const after = levelFromXp(p.xp);
    p.level = after.level;
    let line = `<br>⭐ Опыт: +${n}`;
    if (after.level > before.level) {
      const reward = 50 * (after.level - before.level);
      p.gold += reward;
      line += `<br>🎉 Новый уровень игрока: ${after.level}! +${reward} 💰`;
    }
    return line;
  }

  _addPassXp(n) {
    const p = this.progress;
    const season = currentSeasonId();
    if (p.pass.season !== season) {
      p.pass = { season, xp: 0, premium: p.pass.premium, claimed: [], claimedPremium: [] };
    }
    const before = tierForXp(p.pass.xp);
    p.pass.xp += Math.max(0, n | 0);
    const after = tierForXp(p.pass.xp);
    let line = `<br>🎖 Бой-пропуск: +${n} XP`;
    if (after > before) line += `<br>🎖 Уровень пропуска: ${after}!`;
    return line;
  }

  _checkAchievements() {
    const p = this.progress;
    const trophies = (accounts.current() && accounts.current().trophies) || 0;
    const stats = statsFrom(p, { arenaIdx: ARENAS.indexOf(arenaFor(trophies)), passTier: tierForXp(p.pass.xp) });
    let line = '';
    for (const a of ACHIEVEMENTS) {
      if (p.ach[a.id]) continue;
      if (a.check(stats)) {
        p.ach[a.id] = true;
        p.gold += a.gold;
        line += `<br>${a.icon} Достижение «${a.title}»! +${a.gold} 💰`;
      }
    }
    return line;
  }

  // ——— Драфт: выбор колоды из трёх карт ———

  showDraft(state) {
    const st = state || { picks: [], offer: null };
    const pool = this.cards().filter((c) => !c.hidden && !c.custom && !st.picks.includes(c.id));
    if (!st.offer && pool.length) {
      const shuffled = pool.slice().sort(() => Math.random() - 0.5);
      st.offer = shuffled.slice(0, 3);
    }
    const done = st.picks.length >= 8;
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">🎲 Драфт</div>
            <div class="top-sub">Собери колоду: ${st.picks.length}/8 карт</div>
          </div>
        </div>
        <div class="screen-scroll">
          <div class="form-section" style="text-align:center">
            <h3>${done ? 'Колода готова!' : `Выбери карту ${st.picks.length + 1} из 8`}</h3>
            <div class="muted">${done ? 'Проверь колоду и вступай в бой.' : 'Из трёх карт берёшь одну. Всё честно — у соперника тоже случайная колода.'}</div>
          </div>
          ${!done ? `
            <div class="draft-offer">
              ${(st.offer || []).map((c) => `
                <button class="draft-card rarity-${c.rarity}" data-pick="${c.id}">
                  <div class="card-cost">${c.cost}</div>
                  ${this.cardIconHtml(c)}
                  <div class="card-name">${escapeHtml(c.name)}</div>
                  <div class="muted" style="font-size:10px">${c.type === 'spell' ? 'Заклинание' : c.type === 'building' ? 'Здание' : 'Войско'}</div>
                </button>`).join('')}
            </div>` : `
            <div class="draft-offer">
              ${st.picks.map((id) => {
                const c = this.cards().find((x) => x.id === id);
                return c ? `<div class="draft-card rarity-${c.rarity}"><div class="card-cost">${c.cost}</div>${this.cardIconHtml(c)}<div class="card-name">${escapeHtml(c.name)}</div></div>` : '';
              }).join('')}
            </div>
            <button class="btn btn-primary btn-big btn-block" id="draft-go" style="margin-top:14px">⚔️ В бой драфта!</button>
            <button class="btn btn-ghost btn-block mt12" id="draft-retry">↻ Собрать заново</button>`}
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
    this.root.querySelectorAll('[data-pick]').forEach((el) => {
      el.onclick = () => {
        this.sfx.play('ui');
        st.picks.push(el.dataset.pick);
        st.offer = null;
        this.showDraft(st);
      };
    });
    const goBtn = this.root.querySelector('#draft-go');
    if (goBtn) goBtn.onclick = () => {
      this._draftDeck = st.picks.slice(0, 8);
      this.startBattle('draft');
    };
    const retryBtn = this.root.querySelector('#draft-retry');
    if (retryBtn) retryBtn.onclick = () => this.showDraft();
  }

  // ——— Кампания ———

  showCampaign() {
    const done = this.progress.campaignDone || {};
    const totalStars = Object.values(done).reduce((s, n) => s + n, 0);
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">📖 Кампания</div>
            <div class="top-sub">4 главы • 20 миссий • 6 боссов • звёзды: ${totalStars}/60</div>
          </div>
        </div>
        <div class="screen-scroll">
          ${CHAPTERS.map((ch) => `
            <div class="form-section">
              <h3>${ch.icon} Глава ${ch.id}. ${escapeHtml(ch.name)}</h3>
              <div class="muted" style="font-size:12px;margin-bottom:8px">${escapeHtml(ch.desc)}</div>
              ${chapterMissions(ch.id).map((m) => {
                const stars = done[m.id] || 0;
                const un = isUnlocked(m.id, done);
                return `
                  <button class="mission-row ${un ? '' : 'locked'}" data-m="${m.id}">
                    <span class="mission-icon">${m.boss ? '👹' : un ? '⚔️' : '🔒'}</span>
                    <div style="flex:1">
                      <b>${escapeHtml(m.name)}</b>
                      <div class="muted" style="font-size:11px">${escapeHtml(m.enemyName)}</div>
                    </div>
                    <span class="mission-stars">${stars ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : un ? '—' : ''}</span>
                  </button>`;
              }).join('')}
            </div>`).join('')}
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
    this.root.querySelectorAll('[data-m]').forEach((el) => {
      el.onclick = () => {
        const m = missionById(el.dataset.m);
        if (!m || !isUnlocked(m.id, this.progress.campaignDone || {})) {
          this.toast('Сначала пройди предыдущую миссию');
          return;
        }
        this.showMissionDetail(m.id);
      };
    });
  }

  showMissionDetail(id) {
    const m = missionById(id);
    if (!m) return;
    const boss = m.boss ? BOSSES[m.boss] : null;
    const names = m.deck.map((cid) => {
      const c = this.cards().find((x) => x.id === cid);
      return escapeHtml(c ? c.name : cid);
    });
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">${boss ? boss.icon : '⚔️'} ${escapeHtml(m.name)}</div>
            <div class="top-sub">${escapeHtml(m.enemyName)}</div>
          </div>
        </div>
        <div class="screen-scroll">
          <div class="form-section">
            <p style="color:#b8c0d8">${escapeHtml(m.story)}</p>
            ${boss ? `
              <div class="boss-card">
                <div style="font-size:38px">${boss.icon}</div>
                <div style="flex:1">
                  <b>БОСС: ${escapeHtml(boss.name)}</b>
                  <div class="muted" style="font-size:11px;margin:4px 0">${escapeHtml(boss.story)}</div>
                  <div class="muted" style="font-size:11px">Способности: ${boss.abilities.map((a) => escapeHtml(a.label)).join(' • ')}</div>
                </div>
              </div>` : ''}
            <div class="info-list">
              Колода врага: ${names.join(', ')}<br>
              Правила: двойной эликсир с ${m.rules.doubleElixirAt}с • главная вышка врага ×${m.rules.enemyKingHp} HP
            </div>
            <div class="info-list" style="margin-top:8px">
              Награды: +${m.rewards.gold} 💰${m.rewards.copies.map((c) => ` • копии ×${c.count}`).join('')}${m.rewards.chest ? ' • сундук' : ''}
            </div>
            <button class="btn btn-primary btn-big btn-block" id="m-start" style="margin-top:14px">⚔️ В бой!</button>
          </div>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showCampaign();
    this.root.querySelector('#m-start').onclick = () => {
      this._campaignCtx = { mission: m };
      this.startBattle('campaign');
    };
  }

  // ——— Турнирная лига ———

  showTournament() {
    const p = this.progress;
    const cup = p.cup && p.cup.active ? p.cup : null;
    const rounds = [
      { name: 'Четвертьфинал', foe: '🤖 «Сокол»', icon: '🥇' },
      { name: 'Полуфинал', foe: '🤖 «Молот»', icon: '🥈' },
      { name: 'Финал', foe: '🤖 «Буря»', icon: '🏆' }
    ];
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">🏆 Турнирная лига</div>
            <div class="top-sub">Побед в турнирах: ${p.cupWins || 0}</div>
          </div>
        </div>
        <div class="screen-scroll">
          <div class="form-section" style="text-align:center">
            <div style="font-size:46px">${cup ? '⚔️' : '🏆'}</div>
            <h3 style="margin:6px 0">${cup ? `Раунд ${cup.wins + 1} из 3` : 'Турнир ждёт чемпиона!'}</h3>
            <div class="muted">${cup ? 'Победи трёх соперников подряд и забери главный приз: +400 💰 и титул чемпиона.' : 'Сетка из 3 раундов: боты играют всё умнее. Поражение — вылет, но можно начать заново.'}</div>
          </div>
          ${rounds.map((r, i) => {
            const state = !cup ? 'wait' : (i < cup.round ? 'done' : i === cup.round ? 'now' : 'lock');
            return `
              <div class="cup-row ${state}">
                <span style="font-size:22px">${state === 'done' ? '✅' : r.icon}</span>
                <div style="flex:1">
                  <b>${r.name}</b>
                  <div class="muted" style="font-size:11px">Соперник: ${r.foe} • сложность ${'★'.repeat(i + 2)}${'☆'.repeat(3 - i)}</div>
                </div>
                ${state === 'now' ? '<button class="btn btn-primary" id="cup-fight">⚔️ В бой</button>' : ''}
              </div>`;
          }).join('')}
          ${!cup ? '<button class="btn btn-primary btn-big btn-block" id="cup-start" style="margin-top:12px">🏁 Начать турнир</button>' : ''}
          <div class="muted mt12" style="font-size:11px;text-align:center">За участие: опыт, пропуск и достижения. Чемпион получает +400 💰!</div>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
    const startBtn = this.root.querySelector('#cup-start');
    if (startBtn) startBtn.onclick = () => {
      p.cup = { round: 0, wins: 0, active: true };
      accounts.saveProgress(p);
      this.showTournament();
    };
    const fightBtn = this.root.querySelector('#cup-fight');
    if (fightBtn) fightBtn.onclick = () => {
      this._cupCtx = { round: (p.cup && p.cup.round) || 0 };
      this.startBattle('cup');
    };
  }

  // ——— Кузница и эволюция ———

  showForge() {
    const evo = this.progress.evo || {};
    const list = this.cards().filter((c) => !c.hidden && !c.custom);
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">🔥 Кузница</div>
            <div class="top-sub">Эволюция карт: до 3 звёзд • +5% к HP и урону за звезду</div>
          </div>
        </div>
        <div class="screen-scroll">
          <div class="cards-grid">
            ${list.map((c) => {
              const s = evo[c.id] || 0;
              return `
                <div class="card-tile rarity-${c.rarity} ${c.hero ? 'hero' : ''} ${isMythic(s) ? 'mythic' : ''}" data-id="${c.id}">
                  <div class="card-cost">${c.cost}</div>
                  ${this.cardIconHtml(c)}
                  <div class="card-name">${escapeHtml(c.name)}</div>
                  <div class="evo-stars">${'⭐'.repeat(s)}${'☆'.repeat(EVO_MAX - s)}</div>
                </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
    this.root.querySelectorAll('[data-id]').forEach((el) => {
      el.onclick = () => this.showForgeCard(el.dataset.id);
    });
  }

  showForgeCard(id) {
    const c = this.cards().find((x) => x.id === id);
    if (!c) return;
    const evo = this.progress.evo || {};
    const stars = evo[id] || 0;
    const cost = stars < EVO_MAX ? evoCost(stars) : null;
    const copies = cardCopiesOf(this.progress, id);
    const can = cost && this.progress.gold >= cost.gold && copies >= cost.copies;
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">🔥 ${escapeHtml(c.name)}</div>
            <div class="top-sub">${evoLabel(stars)}</div>
          </div>
        </div>
        <div class="screen-scroll">
          <div class="form-section" style="text-align:center">
            <div class="card-tile rarity-${c.rarity} ${c.hero ? 'hero' : ''} ${isMythic(stars) ? 'mythic' : ''}" style="width:110px;margin:0 auto">
              <div class="card-cost">${c.cost}</div>
              ${this.cardIconHtml(c)}
              <div class="card-name">${escapeHtml(c.name)}</div>
              <div class="evo-stars">${'⭐'.repeat(stars)}${'☆'.repeat(EVO_MAX - stars)}</div>
            </div>
            <div class="info-list" style="margin-top:12px;text-align:left">
              Множитель силы: ×${evoMultiplier(stars).toFixed(2)}<br>
              Копий карты: <b>${copies}</b> • Золото: <b>${this.progress.gold} 💰</b>
              ${cost ? `<br>Следующая звезда: <b>${cost.copies} копий</b> + <b>${cost.gold} 💰</b>` : '<br>Максимальная эволюция достигнута!'}
            </div>
            ${cost ? `<button class="btn ${can ? 'btn-primary' : 'btn-ghost'} btn-big btn-block" id="f-evolve" ${can ? '' : 'disabled'} style="margin-top:12px">
              ${isMythic(stars + 1) ? '✨ Стать мифическим!' : '🔥 Эволюционировать'}
            </button>` : ''}
            <div class="muted" style="font-size:11px;margin-top:10px">Копии добываются в сундуках, кампании и бой-пропуске. 3 звезды = мифическая карта!</div>
          </div>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showForge();
    const btn = this.root.querySelector('#f-evolve');
    if (btn) btn.onclick = () => {
      const cc = evoCost(stars);
      if (this.progress.gold < cc.gold || cardCopiesOf(this.progress, id) < cc.copies) { this.toast('Не хватает ресурсов'); return; }
      this.progress.gold -= cc.gold;
      this.progress.cardCopies[id] = cardCopiesOf(this.progress, id) - cc.copies;
      this.progress.evo[id] = stars + 1;
      this.progress.forges = (this.progress.forges || 0) + 1;
      if (isMythic(stars + 1)) this.progress.mythics = (this.progress.mythics || 0) + 1;
      accounts.saveProgress(this.progress);
      this.toast(`🔥 Эволюция: ${evoLabel(stars + 1)}!`);
      this.showForgeCard(id);
    };
  }

  // ——— Командный бой 2×2 ———

  showCoop() {
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">🤝 Командный бой 2×2</div>
            <div class="top-sub">Побед: ${this.progress.coopWins || 0}</div>
          </div>
        </div>
        <div class="screen-scroll">
          <div class="form-section" style="text-align:center">
            <div style="font-size:52px">🤝⚔️</div>
            <h3>Ты и союзник против двоих!</h3>
            <div class="muted">
              У тебя — твоя колода. У союзника и врагов — свои колоды и свой эликсир.<br>
              Победа в 5 боях — достижение «Надёжный союзник».
            </div>
            <button class="btn btn-primary btn-big btn-block" id="coop-go" style="margin-top:16px">⚔️ В бой 2×2!</button>
          </div>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
    this.root.querySelector('#coop-go').onclick = () => this.startBattle('coop');
  }

  // ——— Клановые войны ———

  showClanWar() {
    const p = this.progress;
    const war = p.clanWar || { points: 0, fights: 0 };
    const canChest = war.points >= 100;
    const rivals = [
      { name: 'Клан «Стальные волки»', pts: 120 + ((war.fights * 7) % 60) },
      { name: 'Клан «Огненный щит»', pts: 90 + ((war.fights * 11) % 50) },
      { name: 'Клан «Тени леса»', pts: 70 + ((war.fights * 13) % 40) }
    ];
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">⚔️ Клановые войны</div>
            <div class="top-sub">Побед в войнах: ${p.clanWarWins || 0}</div>
          </div>
        </div>
        <div class="screen-scroll">
          <div class="form-section">
            <h3>🎖 Клановый сундук</h3>
            <div class="war-bar"><div class="war-fill" style="width:${Math.min(100, war.points)}%"></div></div>
            <div class="muted" style="font-size:12px;margin:6px 0">Очки клана: <b>${war.points}/100</b> • боёв: ${war.fights}. Победа — +20 очков, поражение — +5.</div>
            ${canChest
              ? '<button class="btn btn-primary btn-block" id="war-chest">🎁 Забрать клановый сундук!</button>'
              : '<button class="btn btn-ghost btn-block" id="war-fight">⚔️ Клановый бой (+20 очков)</button>'}
          </div>
          <div class="form-section">
            <h3>Таблица кланов</h3>
            <div class="friend-row" style="border-color:#4d8df0">
              <span style="font-size:20px">🏠</span>
              <div style="flex:1"><b>Ваш клан</b><div class="muted" style="font-size:11px">${war.points} очков</div></div>
            </div>
            ${rivals.map((r) => `
              <div class="friend-row">
                <span style="font-size:20px">⚔️</span>
                <div style="flex:1"><b>${escapeHtml(r.name)}</b><div class="muted" style="font-size:11px">${r.pts} очков</div></div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
    const fightBtn = this.root.querySelector('#war-fight');
    if (fightBtn) fightBtn.onclick = () => this.startBattle('clanwar');
    const chestBtn = this.root.querySelector('#war-chest');
    if (chestBtn) chestBtn.onclick = () => {
      if (p.chests.length >= 4) { this.toast('Очередь сундуков полна (макс. 4)'); return; }
      p.chests.push(chestByType('gold'));
      p.clanWar.points = Math.max(0, p.clanWar.points - 100);
      accounts.saveProgress(p);
      this.toast('🎁 Клановый сундук получен!');
      this.showClanWar();
    };
  }

  // ——— Профиль, уровень и достижения ———

  showProfile() {
    const p = this.progress;
    const lv = levelFromXp(p.xp || 0);
    const stats = statsFrom(p, { arenaIdx: ARENAS.indexOf(arenaFor((accounts.current() && accounts.current().trophies) || 0)), passTier: tierForXp((p.pass && p.pass.xp) || 0) });
    this.setScreen(`
      <div class="screen">
        <div class="top-bar">
          <button class="btn btn-ghost" id="back">←</button>
          <div>
            <div class="top-title">⭐ Профиль</div>
            <div class="top-sub">Уровень игрока и достижения</div>
          </div>
        </div>
        <div class="screen-scroll">
          <div class="form-section" style="text-align:center">
            <div style="font-size:52px">⭐</div>
            <h3 style="margin:6px 0">Уровень ${lv.level}</h3>
            <div class="war-bar"><div class="war-fill" style="width:${Math.min(100, Math.round((lv.into / lv.need) * 100))}%"></div></div>
            <div class="muted" style="font-size:12px;margin-top:6px">Опыт: ${lv.into}/${lv.need} до следующего уровня • всего побед: ${p.wins || 0}</div>
          </div>
          <div class="form-section">
            <h3>Достижения (${Object.keys(p.ach || {}).length}/${ACHIEVEMENTS.length})</h3>
            ${ACHIEVEMENTS.map((a) => {
              const got = !!(p.ach && p.ach[a.id]);
              return `
                <div class="ach-row ${got ? 'got' : ''}">
                  <span style="font-size:22px;${got ? '' : 'filter:grayscale(1);opacity:0.5'}">${a.icon}</span>
                  <div style="flex:1">
                    <b>${escapeHtml(a.title)}</b>
                    <div class="muted" style="font-size:11px">${escapeHtml(a.desc)} • +${a.gold} 💰</div>
                  </div>
                  <span>${got ? '✅' : '🔒'}</span>
                </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
  }

  // ——— Сезонный бой-пропуск (красивый!) ———

  showPass() {
    const p = this.progress;
    const season = currentSeasonId();
    if (!p.pass || p.pass.season !== season) {
      p.pass = { season, xp: 0, premium: !!(p.pass && p.pass.premium), claimed: [], claimedPremium: [] };
    }
    const tier = tierForXp(p.pass.xp);
    const into = p.pass.xp - tier * PASS_XP_PER_TIER;
    const pct = Math.round((into / PASS_XP_PER_TIER) * 100);
    const days = seasonDaysLeft();
    this.setScreen(`
      <div class="screen">
        <div class="pass-hero">
          <div class="pass-hero-glow"></div>
          <button class="btn btn-ghost" id="back" style="position:relative;z-index:2">←</button>
          <div class="pass-title">🎖 БОЙ-ПРОПУСК</div>
          <div class="pass-season">Сезон «${escapeHtml(season)}» • ${days} дн. до конца</div>
          <div class="pass-tier-badge">УРОВЕНЬ ${tier}</div>
          <div class="pass-xp">
            <div class="pass-xp-fill" style="width:${pct}%"><div class="pass-xp-shimmer"></div></div>
          </div>
          <div class="pass-xp-label">${into}/${PASS_XP_PER_TIER} XP до уровня ${Math.min(PASS_TIERS, tier + 1)}</div>
          ${p.pass.premium
            ? '<div class="pass-premium-on">👑 ПРЕМИУМ АКТИВЕН</div>'
            : `<button class="btn pass-buy" id="pass-buy">👑 Купить премиум — ${PREMIUM_COST} 💰</button>`}
        </div>
        <div class="screen-scroll">
          <div class="pass-track">
            ${PASS_REWARDS.map((r) => {
              const freeClaimed = p.pass.claimed.includes(r.tier);
              const premClaimed = p.pass.claimedPremium.includes(r.tier);
              const unlocked = r.tier <= tier;
              return `
                <div class="pass-cell ${unlocked ? 'unlocked' : ''}">
                  <div class="pass-cell-num">${r.tier}</div>
                  <div class="pass-reward ${freeClaimed ? 'claimed' : ''}" data-claim="${freeClaimed || !unlocked ? '' : `free:${r.tier}`}" title="${escapeHtml(r.free.label)}">
                    <span class="pass-reward-icon">${r.free.icon}</span>
                    <span class="pass-reward-label">${escapeHtml(r.free.label)}</span>
                    ${freeClaimed ? '<span class="pass-check">✓</span>' : (unlocked ? '<span class="pass-glow">ЗАБРАТЬ</span>' : '')}
                  </div>
                  <div class="pass-reward prem ${premClaimed ? 'claimed' : ''} ${p.pass.premium ? '' : 'locked'}" data-claim="${premClaimed || !unlocked || !p.pass.premium ? '' : `premium:${r.tier}`}" title="${escapeHtml(r.premium.label)}">
                    <span class="pass-reward-icon">${r.premium.icon}</span>
                    <span class="pass-reward-label">${escapeHtml(r.premium.label)}</span>
                    ${premClaimed ? '<span class="pass-check">✓</span>' : (unlocked && p.pass.premium ? '<span class="pass-glow">ЗАБРАТЬ</span>' : (!p.pass.premium ? '<span class="pass-lock">👑</span>' : ''))}
                  </div>
                </div>`;
            }).join('')}
          </div>
          <div class="muted mt12" style="font-size:11px;text-align:center">
            Опыт капает за бои, турниры, кампанию и «Экзамен». Награды двух треков: бесплатный и премиум 👑.
          </div>
        </div>
      </div>
    `);
    this.root.querySelector('#back').onclick = () => this.showMenu();
    const buyBtn = this.root.querySelector('#pass-buy');
    if (buyBtn) buyBtn.onclick = () => {
      if (p.gold < PREMIUM_COST) { this.toast(`Нужно ${PREMIUM_COST} 💰`); return; }
      p.gold -= PREMIUM_COST;
      p.pass.premium = true;
      accounts.saveProgress(p);
      this.toast('👑 Премиум-трек открыт!');
      this.showPass();
    };
    this.root.querySelectorAll('[data-claim]').forEach((el) => {
      if (!el.dataset.claim) return;
      el.onclick = () => this._claimPass(el.dataset.claim);
    });
  }

  _claimPass(spec) {
    const [track, tierStr] = spec.split(':');
    const tierNum = parseInt(tierStr, 10);
    const p = this.progress;
    const claimedKey = track === 'premium' ? 'claimedPremium' : 'claimed';
    if (p.pass[claimedKey].includes(tierNum)) return;
    const r = passReward(tierNum, track);
    if (!r) return;
    let msg = '';
    if (r.gold) { p.gold += r.gold; msg = `+${r.gold} 💰`; }
    if (r.copies) {
      for (const c of r.copies) {
        addCardCopies(p, c.id, c.count);
        const card = this.cards().find((x) => x.id === c.id);
        msg += `${msg ? ', ' : ''}${escapeHtml(card ? card.name : c.id)} ×${c.count}`;
      }
    }
    if (r.chest) {
      const n = r.count || 1;
      for (let i = 0; i < n; i++) if (p.chests.length < 4) p.chests.push(chestByType(r.chest));
      msg += `${msg ? ', ' : ''}сундук ×${n}`;
    }
    p.pass[claimedKey].push(tierNum);
    accounts.saveProgress(p);
    this.toast(`🎉 Награда уровня ${tierNum}: ${msg}`);
    this.showPass();
  }

  // ——— активная абилка героя (1 раз за бой) ———

  _activateHeroAbility() {
    const b = this.battle;
    if (!b || b.finished || this._heroAbilityUsed || !this._heroCardId) return;
    const heroCard = getCard(this._heroCardId);
    if (!heroCard) return;
    const myUnits = b.units.filter((u) => u.team === 'player' && u.alive);
    const hero = myUnits.find((u) => (u.card && u.card.id) === this._heroCardId);
    if (!hero) { this.toast('Сначала высадите героя на арену!'); return; }
    this._heroAbilityUsed = true;
    const btn = this.root.querySelector('#b-hero');
    if (btn) { btn.textContent = '🦸 использовано'; btn.disabled = true; btn.style.opacity = '0.5'; }
    const dmg = Math.round((heroCard.damage || 0));
    if (this._heroCardId === 'hero_paladin') {
      for (const u of myUnits) {
        const add = Math.round((u.card.hp || 0) * 0.6);
        u.shieldHp = (u.shieldHp || 0) + add;
        u.shieldMax = Math.max(u.shieldMax || 0, u.shieldHp);
      }
      b.emit({ type: 'hero', id: hero.id, kind: 'shield' });
      this.toast('🛡 Паладин: щит всем войскам (+60% HP)!');
    } else if (this._heroCardId === 'hero_assassin') {
      const foes = b.units.filter((u) => u.team === 'ai' && u.alive);
      if (foes.length) {
        const target = foes.reduce((s, u) => (u.hp > s.hp ? u : s), foes[0]);
        b._damage(target, dmg * 3, { source: hero.id, team: 'player' });
        hero.x = target.x; hero.y = target.y + 1;
      }
      this.toast('⚔ Тень: рывок и удар в спину (×3 урона)!');
    } else if (this._heroCardId === 'hero_mage') {
      const foes = b.units.filter((u) => u.team === 'ai' && u.alive);
      let hit = 0;
      for (const f of foes) {
        if (Math.hypot(f.x - hero.x, f.y - hero.y) <= 4.5) {
          b._damage(f, Math.round(dmg * 1.3), { source: hero.id, team: 'player' });
          hit++;
        }
      }
      this.toast('🔥 Архимаг: взрыв по ' + hit + ' цели(ям)!');
    }
    this.sfx.play('spell');
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
        <div class="hand-card ${afford ? '' : 'unaffordable'} ${this.selectedCard === id ? 'active' : ''} ${c.hero ? 'hero' : ''}" data-hand="${id}">
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
        // без вида арены: оставляем карту выбранной — клик по арене высадит её
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
    // войска и здания — только на свою половину; заклинания — на любую точку арены
    if (!b.canPlaceAt(x, y, 'player', c)) {
      this.toast(c.type === 'spell'
        ? 'Заклинание можно бросить только на арену!'
        : 'Ставьте войска на свою половину арены!');
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

      if (this.battleMode === 'replay') {
        // просмотр реплея: подаём снапшоты по времени записи
        this._replayTimer = (this._replayTimer || 0) + dt;
        const snaps = this._replayData ? this._replayData.snaps : [];
        while (this._replayIdx < snaps.length && snaps[this._replayIdx].time <= this._replayTimer) {
          this.battle.applySnapshot({ ...snaps[this._replayIdx], t: 'snap' });
          this._replayIdx++;
        }
        this.battle.update(dt);
        if (this._replayIdx >= snaps.length && !this._replayEnded) {
          this._replayEnded = true;
          this.toast('Реплей завершён');
        }
      } else if (!this.battle.finished) {
        this.battle.update(dt);
        this.ai.update(dt);
        if (this._bossCtl) this._bossCtl.update(dt);
        if (this._commanders) for (const cm of this._commanders) cm.update(dt);
      }
      const events = this.battle.drainEvents();
      // звуки боя по событиям (с лимитом, чтобы не ревело)
      if (events && events.length && this.sfx.enabled) {
        this._sfxBudget = Math.min(3, (this._sfxBudget || 0) + dt * 6);
        for (const ev of events) {
          if (this._sfxBudget < 1) break;
          if (ev.type === 'deploy') { this.sfx.play('deploy'); this._sfxBudget--; }
          else if (ev.type === 'spell' || ev.type === 'spellFx') { this.sfx.play('spell'); this._sfxBudget--; }
          else if (ev.type === 'towerDown') { this.sfx.play('tower'); this._sfxBudget--; }
          else if (ev.type === 'death' && !ev.card) { this.sfx.play('boom'); this._sfxBudget--; }
        }
      }
      if (this.battleMode === 'online-host') {
        this._hostApplyIntents();
        this._hostMaybeSnapshot(events, now);
      }
      if (this._recorder && !this._recorder.done && this.battleMode !== 'online-guest') {
        try { this._recorder.record(buildHostSnapshot(this.battle, [])); } catch { /* ignore */ }
      }
      if (this.battleView) {
        try {
          this.battleView.update(dt, events);
        } catch (e) {
          console.error('Ошибка арены, отключаю вид:', e);
          try { this.battleView.dispose(); } catch { /* ignore */ }
          this.battleView = null;
        }
      }

      // HUD
      const b = this.battle;
      const maxTime = (this.battle.rules && this.battle.rules.matchTime) || (this.battleRules && this.battleRules.matchTime) || MATCH_TIME;
      const remain = Math.max(0, maxTime - b.time);
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
        else if (e.type === 'finish') {
          this._showResult();
          // останавливаем цикл боя после показа результата, чтобы не было лишних кадров
          if (this.battleRaf) { cancelAnimationFrame(this.battleRaf); this.battleRaf = 0; }
        }
      }

      this.battleRaf = requestAnimationFrame(step);
    };
    this.battleRaf = requestAnimationFrame(step);
  }

  // онлайн-хост: применяем высадки соперника (он играет за 'ai')
  _hostApplyIntents() {
    const q = this._remoteIntents || [];
    this._remoteIntents = [];
    const cardsById = new Map(this.cards().map((c) => [c.id, c]));
    for (const m of q) applyIntentToBattle(this.battle, m, cardsById);
  }

  // онлайн-хост: компактное состояние для гостя (раз в ~120 мс)
  _hostMaybeSnapshot(events, now) {
    if (!this.net) return;
    if (now - (this._lastSnapAt || 0) < 120) return;
    this._lastSnapAt = now;
    try {
      this.net.send(buildHostSnapshot(this.battle, events));
    } catch { /* соединение мигнуло */ }
  }

  _showResult() {
    if (this._resultShown) return;
    this._resultShown = true;
    const b = this.battle;
    const res = b.result || { winner: 'draw' };
    const stats = storage.addBattleResult(res.winner === 'player');
    const ranked = this.battleMode === 'normal';
    const u = accounts.addBattle(res.winner === 'player', ranked, res.winner === 'draw');
    // открыть карты, доступные по текущему количеству кубков
    const meta = this.allCards.filter((c) => !c.hero).map((c) => ({ id: c.id, unlockTrophies: c.unlockTrophies || 0 }));
    const freshly = applyUnlocksByTrophies(this.progress, meta, u.trophies || 0);
    if (freshly.length) {
      const names = freshly.map((id) => { const c = this.cards().find((x) => x.id === id); return c ? c.name : id; }).join(', ');
      this.toast('🆕 Карты открыты: ' + names);
    }
    this.sfx.play(res.winner === 'player' ? 'win' : res.winner === 'draw' ? 'ui' : 'lose');

    // ——— награды: золото, сундуки, клан, реплей ———
    const p = this.progress;
    let rewardLine = '';
    if (this.battleMode !== 'replay') {
      const gold = res.winner === 'player' ? 25 : res.winner === 'draw' ? 15 : 10;
      p.gold += gold;
      rewardLine += `<br>Золото: +${gold} 💰`;
      // сундуки НЕ падают в дружеском бою и в реплеях
      const chestOk = this.battleMode !== 'friendly' && this.battleMode !== 'replay';
      if (chestOk && (res.winner === 'player' || Math.random() < 0.4) && p.chests.length < 4) {
        const chest = rollChest(res.winner === 'player');
        p.chests.push(chest);
        rewardLine += `<br>${chest.icon} ${chest.name} — в «Прокачке»!`;
      } else if (this.battleMode === 'friendly') {
        rewardLine += '<br><span class="muted">В дружеском бою сундуки не выпадают</span>';
      }
      accounts.addClanActivity(res.winner === 'player', b.crowns ? b.crowns.player : 0);
    }

    // реплей
    if (this._recorder) {
      try {
        this._recorder.record(buildHostSnapshot(b, []), true);
        this._recorder.setResult(res.winner === 'player' ? 'win' : res.winner === 'draw' ? 'draw' : 'loss');
        this.replays = saveReplayToList(this.replays, this._recorder.toJSON());
      } catch { /* ignore */ }
      this._recorder = null;
    }

    // турнир: серия боёв
    let tournamentLine = '';
    const tour = p.tournament;
    if (this.battleMode === 'tournament' && tour) {
      tour.games += 1;
      if (res.winner === 'player') tour.wins += 1;
      tournamentLine = `<br>🏆 Турнир: ${tour.wins} побед из ${tour.games}`;
      if (tour.games >= 3) {
        const prize = tour.wins >= 2 ? tour.wins * 100 : 0;
        p.gold += prize;
        if (prize) tournamentLine += `<br>Награда турнира: +${prize} 💰`;
        p.tournament = null;
      }
    }

    // ——— кампания, 2×2, турнирная лига, клановая война ———
    let modeLine = '';
    const won = res.winner === 'player';
    if (this.battleMode === 'campaign' && this._campaignCtx && this._campaignCtx.mission) {
      const m = this._campaignCtx.mission;
      if (won) {
        const crowns = (b.crowns && b.crowns.player) || 1;
        const stars = Math.max(1, Math.min(3, crowns));
        p.campaignDone[m.id] = Math.max(p.campaignDone[m.id] || 0, stars);
        p.gold += m.rewards.gold;
        modeLine += `<br>\u{1F4D6} «${escapeHtml(m.name)}» — победа! ${'★'.repeat(stars)}`;
        modeLine += `<br>Золото: +${m.rewards.gold} \u{1F4B0}`;
        for (const c of (m.rewards.copies || [])) {
          addCardCopies(p, c.id, c.count);
          const card = this.cards().find((x) => x.id === c.id);
          modeLine += `<br>Копии: ${escapeHtml(card ? card.name : c.id)} \u00d7${c.count}`;
        }
        if (m.rewards.chest && p.chests.length < 4) {
          p.chests.push(chestByType(m.rewards.chest));
          modeLine += '<br>Сундук \u2014 \u0432 «\u041f\u0440\u043e\u043a\u0430\u0447\u043a\u0435»!';
        }
        if (m.boss) p.bossKills++;
      } else {
        modeLine += '<br>\u{1F4D6} \u041a\u0430\u043c\u043f\u0430\u043d\u0438\u044f: \u043f\u043e\u0440\u0430\u0436\u0435\u043d\u0438\u0435 \u2014 \u043f\u043e\u043f\u0440\u043e\u0431\u0443\u0439 \u0435\u0449\u0451!';
      }
      this._campaignCtx = null;
    }
    if (this.battleMode === 'coop') {
      if (won) { p.coopWins++; modeLine += '<br>\u{1F91D} 2\u00d72: \u043a\u043e\u043c\u0430\u043d\u0434\u043d\u0430\u044f \u043f\u043e\u0431\u0435\u0434\u0430!'; }
    }
    if (this.battleMode === 'clanwar') {
      p.clanWar.fights++;
      const pts = won ? 20 : 5;
      p.clanWar.points += pts;
      if (won) p.clanWarWins++;
      modeLine += `<br>\u2694\uFE0F \u041a\u043b\u0430\u043d\u043e\u0432\u0430\u044f \u0432\u043e\u0439\u043d\u0430: +${pts} \u043e\u0447\u043a\u043e\u0432 \u043a\u043b\u0430\u043d\u0443`;
    }
    if (this.battleMode === 'cup') {
      const cup = p.cup || (p.cup = { round: 0, wins: 0, active: true });
      if (won) {
        cup.wins++;
        cup.round++;
        if (cup.round >= 3) {
          cup.active = false;
          p.cupWins++;
          p.gold += 400;
          modeLine += '<br>\u{1F3C6} \u0422\u0423\u0420\u041d\u0418\u0420 \u0412\u042b\u0418\u0413\u0420\u0410\u041d! +400 \u{1F4B0}';
        } else {
          modeLine += `<br>\u{1F3C6} \u0422\u0443\u0440\u043d\u0438\u0440: \u0440\u0430\u0443\u043d\u0434 ${cup.wins}/3 \u043f\u0440\u043e\u0439\u0434\u0435\u043d!`;
        }
      } else {
        cup.active = false;
        modeLine += '<br>\u{1F3C6} \u0422\u0443\u0440\u043d\u0438\u0440: \u0432\u044b\u043b\u0435\u0442 \u2026 \u043d\u043e \u0441\u043b\u0435\u0434\u0443\u044e\u0449\u0438\u0439 \u0437\u0430 \u0442\u043e\u0431\u043e\u0439!';
      }
    }
    // опыт, уровень игрока, бой-пропуск, достижения
    if (this.battleMode !== 'replay') {
      if (won) p.wins = (p.wins || 0) + 1;
      const modeXp = this.battleMode === 'campaign' ? 35 : this.battleMode === 'cup' ? 30 : this.battleMode === 'coop' ? 25 : 20;
      modeLine += this._grantXp(won ? modeXp : Math.round(modeXp / 2));
      modeLine += this._addPassXp(won ? 25 : 10);
      modeLine += this._checkAchievements();
      accounts.saveProgress(p);
    }

    this._saveReplays();

    const title = res.winner === 'player' ? 'Победа!' : res.winner === 'draw' ? 'Ничья' : 'Поражение';
    const icon = res.winner === 'player' ? '🏆' : res.winner === 'draw' ? '🤝' : '💀';
    const trophyLine = u && ranked && res.winner !== 'draw'
      ? `<br>Трофеи: <b>🏆 ${u.trophies}</b> (${res.winner === 'player' ? '+30' : '−15'})`
      : (ranked ? '' : '<br><span class="muted">Трофеи не меняются</span>');
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML = `
      <div class="modal">
        <div class="result-big">${icon}</div>
        <h2>${title}</h2>
        <p>Короны: ${b.crowns.player} : ${b.crowns.ai}<br>Всего побед: ${stats.wins} из ${stats.battles}${trophyLine}${rewardLine}${tournamentLine}${modeLine}</p>
        <button class="btn btn-primary" data-a="menu">В меню</button>
        ${this.battleMode === 'tournament' && tour
          ? '<button class="btn btn-blue" data-a="again">Следующий бой турнира</button>'
          : '<button class="btn btn-blue" data-a="again">Ещё бой</button>'}
      </div>`;
    ov.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-a]');
      if (!btn) return;
      ov.remove();
      this._resultShown = false;
      if (btn.dataset.a === 'again' && !(this.battleMode || '').startsWith('online')) {
        this.startBattle(this.battleMode || 'normal');
      } else if (btn.dataset.a === 'again') {
        this.showBattleMenu(); // онлайн: комната одноразовая
      } else {
        this.showMenu();
      }
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
    this._bossCtl = null;
    this._commanders = null;
    if (this.battleRaf) cancelAnimationFrame(this.battleRaf);
    this.battleRaf = 0;
    this._unbindHandDrag();
    // сетевое соединение закрываем, кроме онлайн-ожидания и перехода в онлайн-бой
    if (this.net && !(this._onlineWaiting || this._netKeepForBattle)) {
      try { this.net.send({ t: 'bye' }); } catch { /* ignore */ }
      try { this.net.close(); } catch { /* ignore */ }
      this.net = null;
    }
    this._netKeepForBattle = false;
    if (this.battleView) {
      this.battleView.dispose();
      this.battleView = null;
    }
    if (this._activeArtEditor) {
      this._activeArtEditor = null;
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
      art: c.art ? sanitizeArt(c.art) : null,
      model: c.model && Array.isArray(c.model.parts) && c.model.parts.length
        ? c.model
        : { parts: [{ shape: 'box', pos: [0, 0.85, 0], rot: [0, 0, 0], scale: [0.62, 0.62, 0.36], color: '#3b6fd4', emissive: '#000000' }] }
    };
    out.push(card);
  }
  return out;
}

function sanitizeDeck(deck) {
  const valid = new Set([
    ...ALL_CARDS.map((c) => c.id),
    ...storage.getCustomCards().map((c) => c && c.id),
    ...accounts.globalCards().map((c) => c && c.id)
  ]);
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
