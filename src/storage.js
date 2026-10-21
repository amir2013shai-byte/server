// Простое хранилище (localStorage) для колоды, пользовательских карт и настроек.

const KEY = 'battle_cards_royale_v1';

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}') || {};
  } catch {
    return {};
  }
}

function saveAll(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Не удалось сохранить данные', e);
  }
}

export const storage = {
  getDeck() {
    return loadAll().deck || null;
  },
  setDeck(deck) {
    const d = loadAll();
    d.deck = deck;
    saveAll(d);
  },
  getCustomCards() {
    return loadAll().customCards || [];
  },
  setCustomCards(cards) {
    const d = loadAll();
    d.customCards = cards;
    saveAll(d);
  },
  getSettings() {
    return loadAll().settings || { sound: true, quality: 'high' };
  },
  setSettings(s) {
    const d = loadAll();
    d.settings = s;
    saveAll(d);
  },
  getStats() {
    return loadAll().stats || { wins: 0, battles: 0 };
  },
  addBattleResult(win) {
    const d = loadAll();
    d.stats = d.stats || { wins: 0, battles: 0 };
    d.stats.battles += 1;
    if (win) d.stats.wins += 1;
    saveAll(d);
    return d.stats;
  },
  reset() {
    saveAll({});
  }
};
