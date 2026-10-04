import test from 'node:test';
import assert from 'node:assert/strict';
import { createHUD } from '../src/hud.js';

class Element extends EventTarget {
  constructor() {
    super();
    this.hidden = false;
    this.open = false;
    this.style = {
      setProperty: (name, value) => {
        this.style[name] = value;
      },
    };
    const classes = new Set();
    this.classList = {
      toggle: (name, enabled) =>
        enabled ? classes.add(name) : classes.delete(name),
      contains: (name) => classes.has(name),
    };
    this.small = { textContent: '' };
  }
  querySelector(selector) {
    assert.equal(selector, 'small');
    return this.small;
  }
  setAttribute() {}
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  }
}
function setup(t) {
  const previous = { document: globalThis.document, window: globalThis.window };
  const elements = new Map();
  const el = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  globalThis.document = {
    getElementById: el,
    hidden: false,
    body: new Element(),
    addEventListener() {},
  };
  globalThis.window = new EventTarget();
  t.after(() => {
    for (const key of ['document', 'window']) {
      if (previous[key] === undefined) delete globalThis[key];
      else globalThis[key] = previous[key];
    }
  });
  const actions = { retries: 0, paused: false };
  const hud = createHUD({
    onRetry: () => actions.retries++,
    onPause: (value) => {
      actions.paused = value;
    },
    onSound() {},
  });
  return { hud, el, actions };
}
function game(donor = false) {
  return {
    ...(donor
      ? {
          pilot: 'donor-knife',
          cooldowns: { heavy: 0, special: 15, dodge: 0.6 },
        }
      : {}),
    time: 10,
    wave: 1,
    enemies: [{ kind: 0 }],
    message: '',
    messageUntil: 0,
    finished: false,
    won: false,
    player: {
      hp: donor ? 75 : 50,
      maxHP: donor ? 150 : 100,
      guard: 100,
      guarding: true,
      guardBrokenUntil: 0,
      guardExposedUntil: 0,
      heavyReady: 10,
      specialReady: 10,
      dodgeReady: 10,
    },
  };
}

test('donor objective identifies one Goblin encounter without three-wave text', (t) => {
  const { hud, el } = setup(t);
  const g = game(true);
  hud.update(g);
  assert.equal(
    el('objective').textContent,
    'WESTMINSTER · GOBLIN ENCOUNTER · 1 HOSTILES',
  );
  g.enemies = [];
  hud.update(g);
  assert.equal(
    el('objective').textContent,
    'WESTMINSTER · GOBLIN ENCOUNTER · 0 HOSTILES',
  );
});
test('donor cooldown arcs use supplied periods and zero-cooldown Heavy stays finite', (t) => {
  const { hud, el } = setup(t);
  const g = game(true);
  g.player.specialReady = 17.5; // Half of its actual 15-second cooldown left.
  g.player.dodgeReady = 10.3; // Half of its actual .6-second roll left.
  hud.update(g);
  assert.equal(Number(el('special').style['--ready']), 0.5);
  assert.ok(Math.abs(Number(el('dodge').style['--ready']) - 0.5) < 1e-12);
  assert.equal(el('special').small.textContent, '7.5s');
  assert.equal(el('dodge').small.textContent, '0.3s');
  assert.equal(el('heavy').style['--ready'], '1');
  assert.equal(el('heavy').small.textContent, '');
  assert.equal(el('heavy').classList.contains('cooldown'), false);
  g.time = 18;
  hud.update(g);
  assert.equal(el('special').classList.contains('cooldown'), false);
  assert.equal(el('special').style['--ready'], '1');
});
test('donor displays actual 150HP maximum and held guard without false break during exposure', (t) => {
  const { hud, el } = setup(t);
  const g = game(true);
  g.player.guardExposedUntil = 11;
  hud.update(g);
  assert.equal(el('health-number').textContent, '75 / 150');
  assert.equal(el('health-fill').style.width, '50%');
  assert.equal(el('guard-number').textContent, 100);
  assert.equal(el('guard-fill').style.width, '100%');
  assert.equal(el('guard').classList.contains('pressed'), true);
  g.player.guard = 25;
  g.player.guarding = false;
  g.player.guardBrokenUntil = 11;
  hud.update(g);
  assert.equal(el('guard-number').textContent, 'BROKEN');
  assert.equal(el('guard-fill').style.width, '25%');
  assert.equal(el('guard').classList.contains('pressed'), false);
});
test('default002 keeps its waves, cooldown periods and Warlord victory', (t) => {
  const { hud, el } = setup(t);
  const g = game();
  g.cooldowns = { heavy: 0, special: 15, dodge: 0.6 }; // Only the explicit pilot selects these.
  g.player.heavyReady = 10.8;
  g.player.specialReady = 13.5;
  g.player.dodgeReady = 10.525;
  hud.update(g);
  assert.equal(
    el('objective').textContent,
    'WESTMINSTER · WAVE 1 / 3 · 1 HOSTILES',
  );
  for (const id of ['heavy', 'special', 'dodge']) {
    assert.ok(Math.abs(Number(el(id).style['--ready']) - 0.5) < 1e-12);
  }
  assert.equal(el('health-number').textContent, '50 / 100');
  g.finished = g.won = true;
  hud.update(g);
  assert.equal(el('result-hint').textContent, 'The warlord has fallen.');
});
test('donor death, retry and victory retain existing controls with accurate opponent text', (t) => {
  const { hud, el, actions } = setup(t);
  const g = game(true);
  g.player.hp = 0;
  g.finished = true;
  hud.update(g);
  assert.equal(el('ending').hidden, false);
  assert.equal(el('result').textContent, 'THE ASH CLAIMS YOU');
  el('again').onclick();
  assert.equal(actions.retries, 1);
  hud.ready();
  hud.toggleMenu();
  assert.equal(actions.paused, true);
  el('retry').onclick();
  assert.equal(actions.retries, 2);
  assert.equal(actions.paused, false);
  g.player.hp = 150;
  g.finished = false;
  hud.update(g);
  assert.equal(el('ending').hidden, true);
  assert.equal(el('health-number').textContent, '150 / 150');
  g.finished = g.won = true;
  hud.update(g);
  assert.equal(el('result').textContent, 'CHECKPOINT CLEARED');
  assert.equal(el('result-hint').textContent, 'The Goblin has fallen.');
});
