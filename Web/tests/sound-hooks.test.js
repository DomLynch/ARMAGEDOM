import test from 'node:test';
import assert from 'node:assert/strict';
import {createDonorAudio} from '../src/donor-audio.js';
import {GAME_DATA} from '../src/engine/game-data.js';
import {validateSoundHooks} from '../src/engine/sound-hooks-data.js';
import {burnLevel, createSoundHooks, rowMatches, soundHooksEnabled} from '../src/engine/sound-hooks.js';

const D = GAME_DATA.soundHooks;
const clone = () => structuredClone(D);
const player = {id: 'p', pos: {x: 0, z: 0}, hp: 10};
const enemy = (extra = {}) => ({id: 'e1', pos: {x: 2, z: 0}, hp: 5, ...extra});
const hit = (actor, weapon, extra = {}) => ({type: 'hit', actor, amount: 3, weapon, ...extra});
const ids = plans => plans.map(p => p.id);
const make = (data = D) => createSoundHooks({data, random: () => 0.5});

test('the data validates and bad rows are refused', () => {
  validateSoundHooks(clone());
  const bad = patch => assert.throws(() => validateSoundHooks(patch(clone())), TypeError);
  bad(d => { d.rows[0].priority = 10; return d; });
  bad(d => { d.rows[0].voices = 0; return d; });
  bad(d => { d.rows[0].tone.type = 'laser'; return d; });
  bad(d => { d.rows.push({...d.rows[0]}); return d; });
  bad(d => { delete d.rows[0].tone; delete d.rows[0].noise; return d; });
  bad(d => { const r = d.rows.find(x => !x.enabled); delete r.note; return d; });
  bad(d => { d.mix.maxVoices = 99; return d; });
  assert.throws(() => validateSoundHooks({...clone(), extra: 1}));
});

test('events find their rows by weapon, target and lethal', () => {
  const h = make();
  assert.deepEqual(ids(h.plan([hit(enemy(), 'knife')], {player, time: 0})), ['hit-enemy-knife']);
  assert.deepEqual(ids(h.plan([hit(enemy(), 'flamethrower')], {player, time: 1})), ['hit-enemy-flame']);
  assert.deepEqual(ids(h.plan([hit(player, 'teeth')], {player, time: 2})), ['hurt-player-melee']);
  assert.deepEqual(ids(h.plan([hit(player, 'rifle')], {player, time: 3})), ['hurt-player-bullet']);
  assert.deepEqual(ids(h.plan([hit(enemy({bossProfile: {}}), 'pistol')], {player, time: 4})), ['hit-boss-armour']);
  assert.deepEqual(ids(h.plan([{type: 'death', actor: enemy({hp: 0})}], {player, time: 5})), ['kill-enemy']);
  assert.deepEqual(ids(h.plan([{type: 'boss-defeated', actor: enemy()}], {player, time: 6})), ['kill-boss']);
  assert.deepEqual(ids(h.plan([{type: 'sever-presented', victimId: 'e1'}], {player, time: 7})), ['finisher-cut']);
  assert.deepEqual(ids(h.plan([{type: 'reload-start'}], {player, time: 8})), ['reload-start']);
  assert.deepEqual(h.plan([{type: 'shot'}, {type: 'strike'}], {player, time: 9}), []);
  const lethal = {...D.rows[0], match: {lethal: true}};
  assert.ok(rowMatches(lethal, {type: 'hit', actor: enemy({hp: 0}), amount: 1}, player));
  assert.ok(!rowMatches(lethal, {type: 'hit', actor: enemy(), amount: 1}, player));
});

test('blocked and zero-damage hits make no hook, inert rows never match', () => {
  const h = make();
  assert.deepEqual(h.plan([hit(enemy(), 'knife', {blocked: true}), hit(enemy(), 'knife', {amount: 0})], {player, time: 0}), []);
  for (const type of ['ragdoll-land', 'ui-select', 'dodge']) {
    const row = D.rows.find(r => r.event === type);
    assert.equal(row.enabled, false, `${type} is flagged inert`);
    assert.ok(row.note);
    assert.deepEqual(h.plan([{type, actor: enemy()}], {player, time: 0}), []);
  }
});

test('a row obeys its gap and its own voice count', () => {
  const h = make();
  const e = [hit(enemy(), 'knife')];
  assert.equal(h.plan(e, {player, time: 10}).length, 1);
  assert.equal(h.plan(e, {player, time: 10.01}).length, 0, 'inside minGapSeconds');
  assert.equal(h.plan(e, {player, time: 10.5}).length, 1, 'after the gap and after the first cue ended');
  const data = clone();
  data.rows.find(r => r.id === 'hit-enemy-knife').minGapSeconds = 0;
  const one = make(data);
  one.plan(e, {player, time: 0}); one.plan(e, {player, time: 0}); // two voices (row.voices 2)
  assert.equal(one.plan(e, {player, time: 0.01}).length, 0, 'third knife cue while two still sound is dropped');
});

test('the mix caps cues per batch and voices at once, and priority decides who stays', () => {
  const data = clone();
  data.mix.maxPerBatch = 2;
  const h = make(data);
  const batch = [hit(enemy(), 'knife'), hit(enemy(), 'shotgun'), hit(player, 'teeth'), {type: 'reload-start'}];
  assert.deepEqual(ids(h.plan(batch, {player, time: 0})), ['hurt-player-melee', 'hit-enemy-shotgun'], 'two highest priorities');
  const tight = clone();
  tight.mix.maxVoices = 1;
  const t = make(tight);
  assert.equal(t.plan([hit(player, 'teeth')], {player, time: 0}).length, 1);
  assert.equal(t.plan([hit(enemy(), 'shotgun')], {player, time: 0.01}).length, 0, 'full while the first cue still sounds');
  assert.equal(t.plan([hit(enemy(), 'shotgun')], {player, time: 1}).length, 1, 'free again once it ended');
});

test('distance fades a cue and silences it past hearing range; pitch varies within the row', () => {
  const h = make();
  const near = h.plan([hit(enemy({pos: {x: 1, z: 0}}), 'knife')], {player, time: 0})[0];
  const far = h.plan([hit(enemy({pos: {x: D.mix.hearingRange * 0.9, z: 0}}), 'knife')], {player, time: 1})[0];
  assert.ok(far.gain < near.gain && far.gain > 0);
  assert.deepEqual(h.plan([hit(enemy({pos: {x: D.mix.hearingRange + 1, z: 0}}), 'knife')], {player, time: 2}), []);
  assert.ok(h.plan([hit(player, 'teeth')], {player, time: 3})[0].gain === D.rows.find(r => r.id === 'hurt-player-melee').gain, 'no fade on distance:false rows');
  const draws = (...v) => () => v.shift();
  const low = createSoundHooks({random: draws(0, 1)}).plan([hit(enemy(), 'knife')], {player, time: 0})[0];
  const high = createSoundHooks({random: draws(1, 0)}).plan([hit(enemy(), 'knife')], {player, time: 0})[0];
  const v = D.rows.find(r => r.id === 'hit-enemy-knife').pitchVariance;
  assert.ok(Math.abs(low.pitch - (1 - v)) < 1e-9 && Math.abs(high.pitch - (1 + v)) < 1e-9);
});

test('?sound=0 is the off switch and the default is on', () => {
  assert.equal(soundHooksEnabled(D, ''), true);
  assert.equal(soundHooksEnabled(D, '?sound=0'), false);
  assert.equal(soundHooksEnabled(D, '?sound=1'), true);
});

test('burn level counts flamed actors in earshot, capped by the burn presentation', () => {
  const g = {time: 10, player, enemies: [], corpses: []};
  assert.equal(burnLevel(g), 0);
  g.enemies = [enemy({flameBurnUntil: 12}), enemy({flameBurnUntil: 9}), enemy({flameBurnUntil: 12, pos: {x: 500, z: 0}})];
  assert.equal(burnLevel(g), 1, 'only the burning one in earshot');
  g.corpses = Array.from({length: 6}, () => enemy({flameBurnUntil: 11}));
  assert.equal(burnLevel(g), GAME_DATA.burnPresentation.maxActors);
  assert.equal(burnLevel(g, {...D.burn, enabled: false}), 0);
});

async function fixture(t) {
  const nodes = [];
  class Param {value = 0; setValueAtTime(v) {this.value = v;} exponentialRampToValueAtTime() {}}
  class Node {constructor(kind) {this.kind = kind; this.frequency = new Param(); this.gain = new Param(); nodes.push(this);}
    connect() {} disconnect() {} start() {this.started = true;} stop() {this.stopped = true;}}
  class Context {constructor() {this.state = 'suspended'; this.currentTime = 1; this.sampleRate = 48000; this.destination = {};}
    async resume() {this.state = 'running';} async suspend() {} async close() {} async decodeAudioData() {return {};}
    createGain() {return new Node('gain');} createOscillator() {return new Node('tone');} createBufferSource() {return new Node('sample');}
    createBiquadFilter() {return new Node('filter');} createBuffer() {return {getChannelData: () => new Float32Array(7680)};}}
  const saved = new Map(['AudioContext', 'webkitAudioContext', 'matchMedia', 'fetch'].map(k => [k, globalThis[k]]));
  globalThis.AudioContext = Context; globalThis.webkitAudioContext = undefined; globalThis.matchMedia = () => ({matches: false});
  globalThis.fetch = async () => ({ok: true, json: async () => ({url: 'combat.wav', cues: {}}), arrayBuffer: async () => new ArrayBuffer(0)});
  const audio = createDonorAudio({baseUrl: 'https://example.test/'});
  t.after(async () => {await audio.dispose(); for (const [k, v] of saved) if (v === undefined) delete globalThis[k]; else globalThis[k] = v;});
  await audio.unlock();
  return {audio, started: () => nodes.filter(n => n.started).length, nodes};
}
const cues = () => make().plan([hit(enemy(), 'knife')], {player, time: 0});

test('hook cues sound through the donor audio, and not when muted, paused or locked', async t => {
  const f = await fixture(t);
  f.audio.playHooks(cues());
  assert.equal(f.started(), 2, 'a tone and a noise burst');
  f.audio.setEnabled(false);
  const before = f.started();
  f.audio.playHooks(cues());
  f.audio.setBurning(2, D.burn);
  assert.equal(f.started(), before, 'muted: nothing starts');
  assert.equal(f.audio.state.activeVoices, 0);
});

test('the burn crackle loops while something burns, counts one voice, and stops with the fire, the mute and the mode', async t => {
  const f = await fixture(t);
  f.audio.setBurning(1, D.burn);
  assert.equal(f.audio.state.activeVoices, 1);
  f.audio.setBurning(3, D.burn);
  assert.equal(f.audio.state.activeVoices, 1, 'still one loop');
  f.audio.setBurning(0, D.burn);
  assert.equal(f.audio.state.activeVoices, 0);
  f.audio.setBurning(1, D.burn);
  f.audio.setEnabled(false);
  assert.equal(f.audio.state.activeVoices, 0, 'mute stops it');
  f.audio.setEnabled(true);
  f.audio.setMode('off');
  f.audio.setBurning(2, D.burn);
  f.audio.playHooks(cues());
  assert.equal(f.audio.state.activeVoices, 0, 'off mode makes no hook sound');
});
