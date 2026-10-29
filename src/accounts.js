// Аккаунты (локальные профили устройства), друзья, кланы, админ-баланс.
// Всё хранится в localStorage: офлайн-игра без сервера, аккаунты — профили на телефоне.
import { DEFAULT_BALANCE, mergeBalance } from './data/balance.js';
import { emptyProgress, normalizeProgress, currentSeasonId, seasonReward } from './progress.js';

const KEY = 'bc_accounts_v1';
export const ADMIN_NAME = 'admin';
// Пароль админа НЕ хранится в коде — только хеш (см. документацию релиза).
const ADMIN_SALT = 'KS2026BB';
const ADMIN_HASH = 'c745758008d49c34';
export const MAX_ACCOUNTS = 2;

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('Не удалось сохранить аккаунты', e);
  }
}

// простой итерированный хеш (не криптография, но и не открытый текст)
export function hashPassword(pw, salt) {
  let h1 = 0x811c9dc5, h2 = 0x1000193;
  const s = String(salt) + '\u0000' + String(pw);
  for (let round = 0; round < 1200; round++) {
    for (let i = 0; i < s.length; i++) {
      const ch = s.charCodeAt(i) + round;
      h1 = (h1 ^ ch) >>> 0;
      h1 = (h1 * 16777619) >>> 0;
      h2 = (h2 + ((h1 ^ (h2 >>> 13)) * 31) + i) >>> 0;
    }
  }
  return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0');
}

function friendCode(name) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  let h = 0x811c9dc5;
  const src = name + '|' + Date.now() + '|' + Math.random();
  for (let i = 0; i < src.length; i++) h = ((h ^ src.charCodeAt(i)) * 16777619) >>> 0;
  for (let i = 0; i < 8; i++) {
    s += alphabet[h % alphabet.length];
    h = Math.floor(h / alphabet.length) + 0x9e3779b9 * (i + 1);
    h = h >>> 0;
  }
  return s;
}

function normalizeName(name) {
  return String(name || '').trim().slice(0, 24);
}

function normalizeTag(tag) {
  return String(tag || '').trim().toUpperCase().replace(/[^A-ZА-Я0-9]/g, '').slice(0, 8);
}

export const accounts = {
  _state: null,

  _s() {
    if (!this._state) {
      this._state = load();
      this._state.users = this._state.users || {};
      this._state.clans = this._state.clans || {};
      this._state.balance = mergeBalance(this._state.balance);
      this._state.globalCards = Array.isArray(this._state.globalCards) ? this._state.globalCards : [];
      this._ensureAdmin();
    }
    return this._state;
  },

  _flush() {
    save(this._state);
  },

  _ensureAdmin() {
    const s = this._state;
    if (!s.users[ADMIN_NAME]) {
      s.users[ADMIN_NAME] = {
        name: ADMIN_NAME,
        salt: ADMIN_SALT,
        hash: ADMIN_HASH,
        isAdmin: true,
        friendCode: friendCode(ADMIN_NAME),
        trophies: 0, wins: 0, battles: 0,
        friends: [],
        profile: { deck: null, customCards: [] }
      };
    } else {
      s.users[ADMIN_NAME].isAdmin = true;
    }
    if (!s.session) s.session = null; // null = гость
  },

  // ————— сессия —————

  current() {
    const s = this._s();
    return s.session ? s.users[s.session] || null : null;
  },

  isGuest() {
    return !this._s().session;
  },

  register(name, pw) {
    const s = this._s();
    const n = normalizeName(name);
    if (!n || n.length < 2) return { ok: false, error: 'Имя: минимум 2 символа' };
    if (!pw || String(pw).length < 4) return { ok: false, error: 'Пароль: минимум 4 символа' };
    if (s.users[n]) return { ok: false, error: 'Такой аккаунт уже есть' };
    const playerCount = Object.keys(s.users).filter((k) => k !== ADMIN_NAME).length;
    if (playerCount >= MAX_ACCOUNTS) return { ok: false, error: 'На устройстве уже 2 аккаунта — удалите лишний или войдите в существующий' };
    const salt = friendCode(n);
    s.users[n] = {
      name: n,
      salt,
      hash: hashPassword(pw, salt),
      isAdmin: false,
      friendCode: friendCode(n),
      trophies: 0, wins: 0, battles: 0,
      friends: [],
      profile: { deck: null, customCards: [] }
    };
    s.session = n;
    this._flush();
    return { ok: true, user: s.users[n] };
  },

  login(name, pw) {
    const s = this._s();
    const n = normalizeName(name);
    const u = s.users[n];
    if (!u) return { ok: false, error: 'Аккаунт не найден' };
    if (u.hash !== hashPassword(pw, u.salt)) return { ok: false, error: 'Неверный пароль' };
    s.session = n;
    this._flush();
    return { ok: true, user: u };
  },

  logout() {
    const s = this._s();
    s.session = null;
    this._flush();
  },

  changePassword(oldPw, newPw) {
    const u = this.current();
    if (!u) return { ok: false, error: 'Только для аккаунта' };
    if (u.hash !== hashPassword(oldPw, u.salt)) return { ok: false, error: 'Старый пароль неверен' };
    if (!newPw || newPw.length < 4) return { ok: false, error: 'Новый пароль: минимум 4 символа' };
    u.salt = friendCode(u.name);
    u.hash = hashPassword(newPw, u.salt);
    this._flush();
    return { ok: true };
  },

  // профиль (колода, свои карты) хранится в аккаунте или гостевой записи
  sessionName() {
    return this._s().session || 'guest';
  },

  saveActive(deck, customCards, progress) {
    const s = this._s();
    const prof = {
      deck: deck ? deck.slice() : null,
      customCards: customCards || [],
      progress: progress ? normalizeProgress(progress) : emptyProgress()
    };
    if (s.session) {
      const u = s.users[s.session];
      if (u) u.profile = prof;
    } else {
      s.guest = prof;
    }
    this._flush();
  },

  activeProfile() {
    const s = this._s();
    if (s.session) {
      const u = s.users[s.session];
      return u && u.profile ? u.profile : { deck: null, customCards: [], progress: emptyProgress() };
    }
    return s.guest || { deck: null, customCards: [], progress: emptyProgress() };
  },

  // ——— прогресс (золото/уровни/сундуки) ———

  getProgress() {
    const p = this.activeProfile();
    return normalizeProgress(p.progress);
  },

  saveProgress(progress) {
    const s = this._s();
    const p = normalizeProgress(progress);
    if (s.session) {
      const u = s.users[s.session];
      if (u) {
        u.profile = u.profile || { deck: null, customCards: [], progress: emptyProgress() };
        u.profile.progress = p;
      }
    } else {
      s.guest = s.guest || { deck: null, customCards: [], progress: emptyProgress() };
      s.guest.progress = p;
    }
    this._flush();
    return p;
  },

  // миграция: первый запуск — гостевой профиль = то, что уже лежит в storage
  ensureGuest(deck, customCards) {
    const s = this._s();
    if (!s.guest) {
      s.guest = { deck: deck ? deck.slice() : null, customCards: customCards || [], progress: emptyProgress() };
      this._flush();
    }
    // сезон: начислить награду и обнулить часть трофеев при смене месяца
    this._checkSeason();
    return this.getProgress();
  },

  // ——— сезоны ———

  _checkSeason() {
    const s = this._s();
    const sid = currentSeasonId();
    s.season = s.season || { id: sid };
    if (s.season.id === sid) return;
    // награды всем локальным аккаунтам по лиге + мягкий сброс трофеев
    for (const u of Object.values(s.users)) {
      const rew = seasonReward(u.trophies || 0);
      u.profile = u.profile || { deck: null, customCards: [], progress: emptyProgress() };
      u.profile.progress = normalizeProgress(u.profile.progress);
      u.profile.progress.gold += rew.gold;
      u.profile.progress.seasonClaimed = sid;
      u.trophies = Math.floor((u.trophies || 0) * 0.7);
    }
    if (s.guest) {
      s.guest.progress = normalizeProgress(s.guest.progress);
      s.guest.progress.seasonClaimed = sid;
    }
    s.season = { id: sid };
    s.clanWar = null; // новая клановая война
    this._flush();
  },

  seasonInfo() {
    const s = this._s();
    return { id: (s.season && s.season.id) || currentSeasonId() };
  },

  // ——— клановая война и клановый сундук ———

  clanWar() {
    const s = this._s();
    const sid = currentSeasonId();
    if (!s.clanWar || s.clanWar.season !== sid) {
      s.clanWar = {
        season: sid,
        rival: { name: 'Клан «Тени Арены»', score: 40 + Math.floor(Math.random() * 80) },
        score: {}
      };
      this._flush();
    }
    return s.clanWar;
  },

  addClanActivity(win, crowns) {
    const clan = this.myClan();
    if (!clan) return null;
    clan.chestCrowns = (clan.chestCrowns || 0) + Math.max(0, crowns || 0);
    if (win) {
      const war = this.clanWar();
      war.score[clan.tag] = (war.score[clan.tag] || 0) + (2 + (crowns || 0));
      // соперник тоже «играет»
      war.rival.score += Math.random() < 0.55 ? 2 + Math.floor(Math.random() * 3) : 0;
    }
    this._flush();
    return clan;
  },

  claimClanChest() {
    const clan = this.myClan();
    if (!clan) return { ok: false, error: 'Вы не в клане' };
    if ((clan.chestCrowns || 0) < 20) return { ok: false, error: 'Сундук ещё не полон (нужно 20 корон)' };
    clan.chestCrowns -= 20;
    clan.log.push({ t: Date.now(), msg: 'Клановый сундук вскрыт!' });
    this._flush();
    return { ok: true, gold: 150 };
  },

  addBattle(win, ranked = true, draw = false) {
    const u = this.current();
    if (!u) return null;
    u.battles = (u.battles || 0) + 1;
    if (win) u.wins = (u.wins || 0) + 1;
    if (ranked && !draw) {
      u.trophies = Math.max(0, (u.trophies || 0) + (win ? 30 : -15));
    }
    this._flush();
    return u;
  },

  // ————— баланс (меняет админ) —————

  getBalance() {
    return mergeBalance(this._s().balance);
  },

  setBalance(params) {
    this._s().balance = mergeBalance(params);
    this._flush();
    return this._s().balance;
  },

  // ————— глобальные карты (для всех игроков, добавляет админ) —————

  globalCards() {
    return (this._s().globalCards || []).slice();
  },

  addGlobalCard(card) {
    const u = this.current();
    if (!u || !u.isAdmin) return { ok: false, error: 'Только админ может добавлять карты для всех' };
    if (!card || typeof card !== 'object' || !card.id || !card.name) return { ok: false, error: 'Некорректная карта' };
    const s = this._s();
    const clean = JSON.parse(JSON.stringify(card));
    clean.global = true;
    const idx = s.globalCards.findIndex((c) => c.id === clean.id);
    if (idx >= 0) s.globalCards[idx] = clean;
    else s.globalCards.push(clean);
    if (s.globalCards.length > 200) s.globalCards = s.globalCards.slice(-200);
    this._flush();
    return { ok: true, card: clean };
  },

  removeGlobalCard(id) {
    const u = this.current();
    if (!u || !u.isAdmin) return { ok: false, error: 'Только админ может удалять глобальные карты' };
    const s = this._s();
    const before = s.globalCards.length;
    s.globalCards = s.globalCards.filter((c) => c.id !== id);
    this._flush();
    return { ok: s.globalCards.length < before };
  },

  // ————— друзья —————

  friends() {
    const u = this.current();
    return u ? u.friends || [] : [];
  },

  addFriend(input) {
    const u = this.current();
    if (!u) return { ok: false, error: 'Нужен аккаунт' };
    const raw = String(input || '').trim();
    if (!raw) return { ok: false, error: 'Введите код или имя друга' };
    u.friends = u.friends || [];
    // код друга → ищем локальный аккаунт
    const code = raw.toUpperCase();
    const s = this._s();
    const byCode = Object.values(s.users).find((x) => x.friendCode === code);
    const name = byCode ? byCode.name : normalizeName(raw);
    if (!name || name.length < 2) return { ok: false, error: 'Слишком короткое имя' };
    if (u.friends.some((f) => f.name === name || (byCode && f.code === byCode.friendCode))) {
      return { ok: false, error: 'Такой друг уже есть' };
    }
    if (byCode && byCode.name === u.name) return { ok: false, error: 'Нельзя добавить себя' };
    u.friends.push({
      name,
      code: byCode ? byCode.friendCode : friendCode(name),
      deck: byCode && byCode.profile && byCode.profile.deck ? byCode.profile.deck.slice() : null
    });
    this._flush();
    return { ok: true, friend: u.friends[u.friends.length - 1] };
  },

  removeFriend(name) {
    const u = this.current();
    if (!u) return;
    u.friends = (u.friends || []).filter((f) => f.name !== name);
    this._flush();
  },

  // ————— кланы —————

  myClan() {
    const u = this.current();
    if (!u) return null;
    const s = this._s();
    for (const clan of Object.values(s.clans)) {
      if (clan.members.some((m) => m.name === u.name)) return clan;
    }
    return null;
  },

  getClan(tag) {
    return this._s().clans[normalizeTag(tag)] || null;
  },

  allClans() {
    return Object.values(this._s().clans);
  },

  createClan(name, tag) {
    const u = this.current();
    if (!u) return { ok: false, error: 'Нужен аккаунт' };
    const n = normalizeName(name);
    const t = normalizeTag(tag);
    if (!n || n.length < 2) return { ok: false, error: 'Название: минимум 2 символа' };
    if (!t || t.length < 2) return { ok: false, error: 'Тег: минимум 2 символа (буквы/цифры)' };
    const s = this._s();
    if (s.clans[t]) return { ok: false, error: 'Тег уже занят' };
    if (this.myClan()) return { ok: false, error: 'Вы уже в клане' };
    s.clans[t] = {
      tag: t, name: n,
      members: [{ name: u.name, trophies: u.trophies || 0, role: 'leader' }],
      log: [{ t: Date.now(), msg: `${u.name} создал клан` }]
    };
    this._flush();
    return { ok: true, clan: s.clans[t] };
  },

  joinClan(tag) {
    const u = this.current();
    if (!u) return { ok: false, error: 'Нужен аккаунт' };
    const s = this._s();
    const clan = s.clans[normalizeTag(tag)];
    if (!clan) return { ok: false, error: 'Клан не найден' };
    if (this.myClan()) return { ok: false, error: 'Вы уже в клане' };
    clan.members.push({ name: u.name, trophies: u.trophies || 0, role: 'member' });
    clan.log.push({ t: Date.now(), msg: `${u.name} вступил в клан` });
    this._flush();
    return { ok: true, clan };
  },

  leaveClan() {
    const u = this.current();
    if (!u) return { ok: false, error: 'Нужен аккаунт' };
    const clan = this.myClan();
    if (!clan) return { ok: false, error: 'Вы не в клане' };
    clan.members = clan.members.filter((m) => m.name !== u.name);
    clan.log.push({ t: Date.now(), msg: `${u.name} покинул клан` });
    if (!clan.members.length) {
      delete this._s().clans[clan.tag];
    } else if (!clan.members.some((m) => m.role === 'leader')) {
      clan.members[0].role = 'leader';
    }
    this._flush();
    return { ok: true };
  },

  users() {
    return Object.values(this._s().users);
  }
};
