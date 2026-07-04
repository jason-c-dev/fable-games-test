// localStorage persistence: settings, campaign progress, best distances.

const KEY = 'seedrunner-save-v1';

export const DEFAULT_SETTINGS = {
  musicVol: 0.8, sfxVol: 0.9, mute: false,
  shake: 1, reducedMotion: false, keys: null,
};

export function loadGame() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function saveGame(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* private mode */ }
}

export function freshProgress() {
  return { completed: {}, bestTime: {}, bestDew: {}, endlessBest: 0, endlessBestSeed: null, sawIntro: false };
}
