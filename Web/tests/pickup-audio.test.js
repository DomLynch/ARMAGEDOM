import test from 'node:test';
import assert from 'node:assert/strict';
import {createDonorAudio} from '../src/donor-audio.js';
import {createPickupFlash} from '../src/engine/pickup-flash.js';
import {GAME_DATA} from '../src/engine/game-data.js';

// The pickup tone plays for every event in visual.json pickupFlash.events (auto-equip, supply pickups, the vest...), once per batch, and
// the loop hands it the pickups that landed between steps (stepGame wipes g.events at the start of each step).
async function fixture(t) {
  const nodes = [];
  class Param {value = 0; setValueAtTime(v) {this.value = v;} exponentialRampToValueAtTime() {}}
  class Node {constructor(kind) {this.kind = kind; this.frequency = new Param(); this.gain = new Param(); nodes.push(this);}
    connect() {} disconnect() {} start() {this.started = true;} stop() {}}
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
  return {audio, tones: () => nodes.filter(n => n.kind === 'tone' && n.started).length};
}

test('the pickup tone plays once for auto-equip and for a pickup batch, and not for other events', async t => {
  const f = await fixture(t);
  f.audio.play([{type: 'auto-equip', itemId: 'x'}]);
  assert.equal(f.tones(), 1, 'auto-equip makes the tone');
  f.audio.play([{type: 'pickup'}, {type: 'equip'}, {type: 'supply-pickup'}]);
  assert.equal(f.tones(), 2, 'one tone for a batch of pickup events');
  f.audio.play([{type: 'dodge'}, {type: 'equip', itemId: 'x'}]);
  assert.equal(f.tones(), 2, 'no pickup, no tone');
});

test('a pickup pushed between steps reaches the tone through the loop seam exactly once', () => {
  const flash = createPickupFlash(null, GAME_DATA.visual.pickupFlash);
  const events = [{type: 'hit'}];
  flash.observe(events, 0); // after the step
  assert.deepEqual(flash.latest, []);
  events.push({type: 'auto-equip', itemId: 'x'}); // lands after the await, before the next step
  flash.observe(events, 10); // the loop's pre-step look
  assert.deepEqual(flash.latest, [{type: 'auto-equip', itemId: 'x'}]);
  flash.observe(events, 20);
  assert.deepEqual(flash.latest, [], 'not handed out twice');
});
