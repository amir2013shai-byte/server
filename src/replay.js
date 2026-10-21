// Реплеи боёв: записываем снапшотов состояния (как в онлайне) и проигрываем их.
// Хранение — в профиле игрока (макс. 3 реплея, без событий — компактно).

export const REPLAY_LIMIT = 3;
const R = 'BR1.';

export class ReplayRecorder {
  constructor(meta = {}) {
    this.data = {
      v: 1,
      meta: {
        mode: meta.mode || 'normal',
        date: Date.now(),
        playerDeck: meta.playerDeck || [],
        enemyDeck: meta.enemyDeck || [],
        rules: meta.rules || null
      },
      snaps: []
    };
    this._lastAt = -1e9;
    this.done = false;
  }

  // снимаем состояние не чаще раза в 250 мс (кроме финала)
  record(snapshot, force = false) {
    if (this.done) return;
    const t = snapshot.time || 0;
    if (!force && t - this._lastAt < 0.25) return;
    this._lastAt = t;
    const snap = {
      time: snapshot.time,
      finished: snapshot.finished,
      result: snapshot.result,
      crowns: snapshot.crowns,
      elixir: snapshot.elixir,
      hands: snapshot.hands,
      units: snapshot.units,
      towers: snapshot.towers
    };
    this.data.snaps.push(snap);
    if (snapshot.finished) this.done = true;
  }

  setResult(result) {
    this.data.meta.result = result || null;
  }

  toJSON() {
    return this.data;
  }
}

export function replaySize(replay) {
  try {
    return JSON.stringify(replay).length;
  } catch {
    return 0;
  }
}

export function saveReplayToList(list, replay) {
  const out = [replay, ...(list || [])];
  return out.slice(0, REPLAY_LIMIT);
}

// компактный код для передачи (мож быть крупным — ограничим)
export function encodeReplay(replay) {
  try {
    const json = JSON.stringify(replay);
    const bytes = new TextEncoder().encode(json);
    let bin = '';
    const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) {
      bin += String.fromCharCode(...bytes.subarray(i, i + CH));
    }
    return R + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return null;
  }
}

export function decodeReplay(code) {
  try {
    const s = String(code || '').trim();
    if (!s.startsWith(R)) return null;
    const b64 = s.slice(R.length).replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (!data || !Array.isArray(data.snaps) || !data.snaps.length) return null;
    return data;
  } catch {
    return null;
  }
}
