// Input: keyboard (remappable) + gamepad via the Gamepad API.
// The sim calls poll() exactly once per fixed step; pressed/released are
// edges relative to the previous poll. lastDevice drives UI button prompts.

export const ACTIONS = [
  'left', 'right', 'up', 'down',
  'jump', 'attack', 'dash', 'parry', 'beam', 'special',
  'pause', 'confirm', 'back', 'debug',
];

export const DEFAULT_KEYS = {
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  jump: ['Space', 'KeyZ'],
  attack: ['KeyX', 'KeyJ'],
  dash: ['KeyC', 'KeyK', 'ShiftLeft', 'ShiftRight'],
  parry: ['KeyV', 'KeyL'],
  beam: ['KeyF', 'KeyI'],
  special: ['KeyQ', 'KeyU'],
  pause: ['Escape', 'KeyP'],
  confirm: ['Enter', 'Space', 'KeyZ'],
  back: ['Escape', 'Backspace'],
  debug: ['F3'],
};

// standard gamepad mapping: button index per action
export const DEFAULT_PAD = {
  jump: [0],            // A / Cross
  dash: [1],            // B / Circle
  attack: [2],          // X / Square
  special: [3],         // Y / Triangle
  beam: [4, 6],         // LB / LT
  parry: [5, 7],        // RB / RT
  pause: [9],           // Start
  confirm: [0],
  back: [1],
  up: [12], down: [13], left: [14], right: [15],
};

const AXIS_DEAD = 0.35;

// Prompt labels per device, for UI
export const KEY_LABELS = {
  ArrowLeft: '←', ArrowRight: '→', ArrowUp: '↑', ArrowDown: '↓',
  Space: 'SPACE', Escape: 'ESC', Enter: 'ENTER', Backspace: 'BKSP',
  ShiftLeft: 'SHIFT', ShiftRight: 'R-SHIFT',
};
export const keyLabel = (code) =>
  KEY_LABELS[code] || code.replace(/^Key/, '').replace(/^Digit/, '');
export const PAD_LABELS = ['Ⓐ', 'Ⓑ', 'Ⓧ', 'Ⓨ', 'LB', 'RB', 'LT', 'RT', 'SEL', 'ST', 'L3', 'R3', '↑', '↓', '←', '→'];

export class Input {
  constructor() {
    this.keysDown = new Set();
    this.bindings = structuredClone(DEFAULT_KEYS);
    this.padBindings = structuredClone(DEFAULT_PAD);
    this.lastDevice = 'kb';
    this.capture = null;          // {cb} during remap capture
    this.prev = {};
    this.state = { held: {}, pressed: {}, released: {} };
    for (const a of ACTIONS) { this.prev[a] = false; }
    this._padHeld = {};
    this._attached = false;
  }

  attach(target = window) {
    if (this._attached) return;
    this._attached = true;
    target.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (this.capture) {
        e.preventDefault();
        const cb = this.capture.cb; this.capture = null;
        cb({ device: 'kb', code: e.code });
        return;
      }
      this.keysDown.add(e.code);
      this.lastDevice = 'kb';
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F3'].includes(e.code)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => this.keysDown.delete(e.code));
    target.addEventListener('blur', () => this.keysDown.clear());
  }

  startCapture(cb) { this.capture = { cb }; }
  cancelCapture() { this.capture = null; }

  rebindKey(action, code) {
    // replace primary binding, keep alternates that don't collide
    for (const a of ACTIONS) {
      this.bindings[a] = (this.bindings[a] || []).filter(c => c !== code);
    }
    this.bindings[action] = [code, ...(this.bindings[action] || [])].slice(0, 3);
  }

  _pollPad() {
    const held = {};
    const pads = (typeof navigator !== 'undefined' && navigator.getGamepads) ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      let any = false;
      for (const [action, idxs] of Object.entries(this.padBindings)) {
        for (const i of idxs) {
          const b = pad.buttons[i];
          if (b && (b.pressed || b.value > 0.5)) { held[action] = true; any = true; }
        }
      }
      if (pad.axes.length >= 2) {
        if (pad.axes[0] < -AXIS_DEAD) { held.left = true; any = true; }
        if (pad.axes[0] > AXIS_DEAD) { held.right = true; any = true; }
        if (pad.axes[1] < -AXIS_DEAD) { held.up = true; any = true; }
        if (pad.axes[1] > AXIS_DEAD) { held.down = true; any = true; }
      }
      if (this.capture && any) {
        for (let i = 0; i < pad.buttons.length; i++) {
          if (pad.buttons[i].pressed && !this._padHeld['btn' + i]) {
            const cb = this.capture.cb; this.capture = null;
            cb({ device: 'pad', button: i });
            break;
          }
        }
      }
      for (let i = 0; i < pad.buttons.length; i++) this._padHeld['btn' + i] = pad.buttons[i].pressed;
      if (any) this.lastDevice = 'pad';
    }
    return held;
  }

  // one call per fixed sim step
  poll() {
    const padHeld = this._pollPad();
    const held = {}, pressed = {}, released = {};
    for (const a of ACTIONS) {
      let h = !!padHeld[a];
      if (!h) {
        for (const code of (this.bindings[a] || [])) {
          if (this.keysDown.has(code)) { h = true; break; }
        }
      }
      if (this.capture) h = false;   // swallow input during remap capture
      held[a] = h;
      pressed[a] = h && !this.prev[a];
      released[a] = !h && this.prev[a];
      this.prev[a] = h;
    }
    this.state = { held, pressed, released };
    return this.state;
  }

  promptFor(action) {
    if (this.lastDevice === 'pad') {
      const idx = (this.padBindings[action] || [])[0];
      return PAD_LABELS[idx] || '?';
    }
    return keyLabel((this.bindings[action] || [])[0] || '?');
  }
}

// Scriptable input source with the same poll() contract — used by the attract
// demo and headless sim probes. feed() sets the held-set for upcoming steps.
export class ScriptedInput {
  constructor() {
    this.prev = {};
    this.heldNow = {};
    this.lastDevice = 'kb';
    for (const a of ACTIONS) this.prev[a] = false;
  }
  feed(heldMap) { this.heldNow = heldMap || {}; }
  poll() {
    const held = {}, pressed = {}, released = {};
    for (const a of ACTIONS) {
      const h = !!this.heldNow[a];
      held[a] = h;
      pressed[a] = h && !this.prev[a];
      released[a] = !h && this.prev[a];
      this.prev[a] = h;
    }
    return { held, pressed, released };
  }
  promptFor() { return '?'; }
}
