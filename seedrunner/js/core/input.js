// Input: keyboard (remappable) + gamepad (standard mapping), edge-detected
// per sim step, with device tracking so on-screen prompts follow the player.

export const VERBS = ['left', 'right', 'jump', 'slide', 'dash', 'parry', 'pause'];

export const DEFAULT_BINDINGS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  jump: ['Space', 'ArrowUp', 'KeyW'],
  slide: ['ArrowDown', 'KeyS'],
  dash: ['ShiftLeft', 'KeyC'],
  parry: ['KeyX', 'KeyK'],
  pause: ['Escape', 'KeyP'],
};

const KEY_LABELS = {
  Space: 'SPACE', ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  ShiftLeft: 'SHIFT', ShiftRight: 'R-SHIFT', Escape: 'ESC', Enter: 'ENTER',
  ControlLeft: 'CTRL', AltLeft: 'ALT', Tab: 'TAB', Backquote: '`',
};
export const keyLabel = (code) => KEY_LABELS[code] || code.replace(/^(Key|Digit)/, '');

const PAD_LABELS = { left: '◁', right: '▷', jump: 'Ⓐ', slide: 'Ⓑ', dash: 'RB', parry: 'Ⓧ', pause: '≡' };
// standard mapping buttons per verb
const PAD_BTNS = { jump: [0], slide: [1], parry: [2], dash: [3, 5, 7], pause: [9], left: [14], right: [15] };

export class Input {
  constructor() {
    this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    this.keysDown = new Set();
    this.prev = {};
    this.device = 'kb';
    this.onDeviceChange = null;
    this.captureNext = null;       // remap mode: (code) => void
    this._axisPrev = 0;
  }

  attach(target) {
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (this.captureNext) {
        e.preventDefault();
        const cb = this.captureNext;
        this.captureNext = null;
        cb(e.code);
        return;
      }
      this.keysDown.add(e.code);
      if (this._isBound(e.code)) e.preventDefault();
      this._setDevice('kb');
    });
    target.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
    window.addEventListener('blur', () => this.keysDown.clear());
  }

  _isBound(code) {
    return Object.values(this.bindings).some((arr) => arr.includes(code));
  }

  _setDevice(dev) {
    if (this.device !== dev) {
      this.device = dev;
      this.onDeviceChange?.(dev);
    }
  }

  setBinding(verb, code) {
    // primary key is slot 0; strip the code from every other verb first
    for (const v of VERBS) this.bindings[v] = this.bindings[v].filter((c) => c !== code);
    this.bindings[verb] = [code, ...(DEFAULT_BINDINGS[verb] || []).filter((c) => c !== code && !this._isBound(c))];
  }

  labelFor(verb) {
    if (this.device === 'pad') return PAD_LABELS[verb] || verb.toUpperCase();
    const code = this.bindings[verb]?.[0];
    return code ? keyLabel(code) : verb.toUpperCase();
  }

  _padState() {
    const held = {};
    const pads = navigator.getGamepads?.() || [];
    const gp = [...pads].find((g) => g && g.connected && g.mapping === 'standard') || [...pads].find((g) => g && g.connected);
    if (!gp) return held;
    let any = false;
    for (const verb in PAD_BTNS) {
      for (const b of PAD_BTNS[verb]) {
        if (gp.buttons[b]?.pressed) { held[verb] = true; any = true; }
      }
    }
    const ax = gp.axes[0] || 0;
    if (ax < -0.45) { held.left = true; any = true; }
    if (ax > 0.45) { held.right = true; any = true; }
    if (any) this._setDevice('pad');
    return held;
  }

  // mark a verb as already-seen so the next poll doesn't fire its edge
  // (e.g. the Escape that resumed from pause must not immediately re-pause)
  swallow(verb) { this.prev[verb] = true; }

  // gamepad-only edges for menu navigation — keyboard menus are driven by
  // keydown events, so polling kb verbs here would double every press
  padPoll() {
    const pad = this._padState();
    const pressed = {};
    this._prevPad ||= {};
    for (const verb of VERBS) {
      pressed[verb] = !!pad[verb] && !this._prevPad[verb];
      this._prevPad[verb] = !!pad[verb];
    }
    return { pressed };
  }

  poll() {
    const held = {}, pressed = {};
    const pad = this._padState();
    for (const verb of VERBS) {
      held[verb] = !!pad[verb] || this.bindings[verb].some((c) => this.keysDown.has(c));
      pressed[verb] = held[verb] && !this.prev[verb];
    }
    this.prev = { ...held };
    return { held, pressed };
  }
}
