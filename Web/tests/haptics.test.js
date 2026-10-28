import test from 'node:test';
import assert from 'node:assert/strict';
import {createHaptics} from '../src/engine/haptics.js';
import {validateHaptics} from '../src/engine/game-data-haptics.js';
import {GAME_DATA} from '../src/engine/game-data.js';

// Dom/Strategy, 28 Oct 2026: phone vibration on hit, kill, dodge, reload, pickup and death. Presentation only: it reads the events the
// loop hands it (the pickup-flash seam) and writes no game state. Patterns, rate limit and text are data/haptics.json.
const D = GAME_DATA.haptics;
const rule = id => D.rules.find(r => r.id === id);
const player = {hp: 100, maxHP: 100};
const game = () => ({player});
const rig = (opts = {}) => {
  const calls = [], store = new Map(), listeners = new Map();
  const nav = 'vibrate' in opts && !opts.vibrate ? {} : {vibrate: p => { calls.push(p); return true; }};
  const doc = {hidden: false, addEventListener: (t, h) => listeners.set(t, h), removeEventListener: () => {}, getElementById: () => null};
  const win = {
    location: {search: opts.search ?? ''},
    localStorage: opts.noStorage ? {getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }}
      : {getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v)},
    matchMedia: () => ({matches: !!opts.reduced}),
  };
  const h = createHaptics({data: D, nav, doc, win});
  return {h, calls, doc, store, listeners};
};

test('the data is closed and validated, default ON, with every wanted event covered', () => {
  assert.equal(D.enabledDefault, true);
  assert.throws(() => validateHaptics({...D, extra: 1}));
  assert.throws(() => validateHaptics({...D, rules: [{...D.rules[0], pattern: []}]}));
  assert.throws(() => validateHaptics({...D, rules: [D.rules[0], D.rules[0]]}));
  assert.throws(() => validateHaptics({...D, intensityDefault: 'nope'}));
  for (const id of ['player-hurt-light', 'player-hurt-heavy', 'hit-lands', 'kill', 'boss-kill', 'finisher', 'dodge', 'reload-start', 'pickup', 'player-death'])
    assert(rule(id), id);
  assert(rule('kill').pattern.reduce((a, b) => a + b) > rule('hit-lands').pattern.reduce((a, b) => a + b), 'kill is stronger than a hit');
  assert(rule('boss-kill').pattern.reduce((a, b) => a + b) > rule('kill').pattern.reduce((a, b) => a + b), 'boss kill is long');
});

test('events become the right vibrate calls', () => {
  const t = (events, pattern, at = 1000) => {
    const {h, calls} = rig();
    assert.equal(h.observe(events, game(), at), true);
    assert.deepEqual(calls, [pattern]);
  };
  const enemy = {id: 7, kind: 2};
  t([{type: 'hit', actor: player, amount: 5}], rule('player-hurt-light').pattern);
  t([{type: 'hit', actor: player, amount: 12}], rule('player-hurt-medium').pattern);
  t([{type: 'hit', actor: player, amount: 40}], rule('player-hurt-heavy').pattern);
  t([{type: 'hit', actor: player, amount: 40, blocked: true}], rule('player-block').pattern);
  t([{type: 'hit', actor: enemy, amount: 8}], rule('hit-lands').pattern);
  t([{type: 'death', actor: enemy}], rule('kill').pattern);
  t([{type: 'death', actor: {...enemy, finisher: {cost: 1}}}], rule('finisher').pattern);
  t([{type: 'death', actor: enemy}, {type: 'boss-defeated', actor: enemy}], rule('boss-kill').pattern);
  t([{type: 'dodge', actor: player}], rule('dodge').pattern);
  t([{type: 'reload-start'}], rule('reload-start').pattern);
  t([{type: 'supply-pickup'}], rule('pickup').pattern);
  t([{type: 'hit', actor: player, amount: 30}, {type: 'death', actor: player}], rule('player-death').pattern);
});

test('nothing for zero damage, an enemy dodge, or an enemy that blocked; one buzz per batch', () => {
  const {h, calls} = rig();
  const enemy = {id: 7, kind: 2};
  assert.equal(h.observe([{type: 'hit', actor: enemy, amount: 0}, {type: 'dodge', actor: enemy}, {type: 'hit', actor: enemy, amount: 9, blocked: true}], game(), 0), false);
  assert.equal(calls.length, 0);
  assert.equal(h.observe([{type: 'hit', actor: enemy, amount: 9}, {type: 'supply-pickup'}, {type: 'death', actor: enemy}], game(), 1000), true);
  assert.equal(calls.length, 1);
});

test('only events not seen before in an array count (the loop looks twice per step)', () => {
  const {h, calls} = rig();
  const events = [{type: 'supply-pickup'}];
  h.observe(events, game(), 1000);
  h.observe(events, game(), 5000);
  assert.equal(calls.length, 1);
  events.push({type: 'reload-start'});
  h.observe(events, game(), 6000);
  assert.equal(calls.length, 2);
});

test('rate limit: rapid fire does not buzz constantly, the death still gets through', () => {
  const {h, calls} = rig();
  const enemy = {id: 7, kind: 2};
  assert.equal(h.observe([{type: 'hit', actor: enemy, amount: 3}], game(), 1000), true);
  assert.equal(h.observe([{type: 'hit', actor: enemy, amount: 3}], game(), 1000 + D.minGapMs - 1), false);
  assert.equal(h.observe([{type: 'hit', actor: enemy, amount: 3}], game(), 1000 + D.minGapMs + 1), true);
  assert.equal(calls.length, 2);
  assert.equal(h.observe([{type: 'death', actor: player}], game(), 1000 + D.minGapMs + 2), true, 'death bypasses the gap');
  assert.equal(h.observe([{type: 'hit', actor: enemy, amount: 3}], game(), 1000 + D.minGapMs * 2 + 10), false, 'a tick never cuts a long pattern short');
  assert.equal(calls.length, 3);
});

test('strength levels scale the vibrate parts and leave the pauses alone', () => {
  const {h, calls} = rig();
  h.setIntensity('light', 0);
  calls.length = 0;
  h.observe([{type: 'death', actor: {id: 1, kind: 2}, boss: 1}], game(), 5000);
  const scale = D.intensityLevels.find(l => l.id === 'light').scale, p = rule('kill').pattern;
  assert.deepEqual(calls[0], p.map((ms, i) => (i % 2 ? ms : Math.ceil(ms * scale))));
});

test('no support: no calls, no errors, controls hidden', () => {
  const {h} = rig({vibrate: false});
  assert.equal(h.supported, false);
  assert.equal(h.observe([{type: 'death', actor: player}], game(), 0), false);
  assert.doesNotThrow(() => { h.setEnabled(false); h.setEnabled(true); h.dispose(); });
});

test('toggle off silences it and is remembered; toggle back on restores; storage failures are survived', () => {
  const a = rig();
  a.h.setEnabled(false, 0);
  assert.equal(a.h.observe([{type: 'death', actor: player}], game(), 1000), false);
  assert.equal(JSON.parse(a.store.get(D.storageKey)).enabled, false);
  const b = createHaptics({data: D, nav: {vibrate: () => true}, doc: a.doc, win: {location: {search: ''}, localStorage: {getItem: k => a.store.get(k), setItem() {}}, matchMedia: () => ({matches: false})}});
  assert.equal(b.enabled, false, 'remembered');
  const c = rig({noStorage: true});
  assert.equal(c.h.enabled, true, 'default ON when storage is blocked');
  assert.doesNotThrow(() => c.h.setEnabled(true));
});

test('hidden tab, reduced motion and ?haptics=0 never vibrate; hiding the tab cancels what is playing', () => {
  const hidden = rig();
  hidden.doc.hidden = true;
  assert.equal(hidden.h.observe([{type: 'death', actor: player}], game(), 1000), false);
  hidden.h.cancel(); // the loop's tab-hidden listener calls this
  assert.deepEqual(hidden.calls, [0]);
  const reduced = rig({reduced: true});
  assert.equal(reduced.h.observe([{type: 'death', actor: player}], game(), 1000), false);
  const off = rig({search: `?${D.offParam}=0`});
  assert.equal(off.h.observe([{type: 'death', actor: player}], game(), 1000), false);
  assert.equal(off.calls.length, 0);
});

test('low health heartbeat is rate limited and stops at death or healthy', () => {
  const {h, calls} = rig();
  const weak = {player: {hp: 10, maxHP: 100}};
  assert.equal(h.observe([], weak, 1000), true);
  assert.deepEqual(calls[0], D.lowHealth.pattern);
  assert.equal(h.observe([], weak, 1000 + D.lowHealth.intervalMs - 1), false);
  assert.equal(h.observe([], weak, 1000 + D.lowHealth.intervalMs + 1), true);
  assert.equal(h.observe([], {player: {hp: 90, maxHP: 100}}, 99999), false);
  assert.equal(h.observe([], {player: {hp: 0, maxHP: 100}}, 99999), false);
});
