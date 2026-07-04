// localStorage persistence: campaign progress + settings + key bindings.

import { SAVE_KEY } from '../config.js';

export const DEFAULT_SETTINGS = {
  musicVol: 0.8,
  sfxVol: 0.9,
  mute: false,
  shake: 1,            // 0 / 0.5 / 1
  reducedFlash: false,
  keys: null,          // custom bindings or null for defaults
};

export function saveGame(run, settings) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      run: run.serialize(),
      settings,
      mapPos: run.mapPos || null,
      savedAt: Date.now(),
    }));
    return true;
  } catch { return false; }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}
