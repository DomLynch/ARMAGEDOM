import test from 'node:test';
import assert from 'node:assert/strict';
import { createDonorAudio } from '../src/donor-audio.js';

const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

test('resume starts a fresh audio load while an aborted decode is still settling', async (t) => {
  const decodes = [], firstDecode = deferred();
  class Context {
    state = 'suspended';
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    async close() { this.state = 'closed'; }
    decodeAudioData() {
      const pending = deferred(); decodes.push(pending); firstDecode.resolve(); return pending.promise;
    }
  }
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = Context;
  t.after(() => { if (previous === undefined) delete globalThis.AudioContext; else globalThis.AudioContext = previous; });
  const requests = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    requests.push({ url: String(url), signal: options.signal });
    return { ok: true, json: async () => ({ url: 'combat.wav', cues: {} }), arrayBuffer: async () => new ArrayBuffer(0) };
  });
  const audio = createDonorAudio({ baseUrl: 'https://example.test/' });
  const stale = audio.unlock(); await firstDecode.promise;
  await audio.pause();
  const current = audio.unlock();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 4, 'resume must not reuse the cancelled attempt');
  assert.equal(requests[0].signal.aborted, true);
  decodes[0].resolve({ stale: true });
  assert.equal(await stale, false);
  const joined = audio.unlock();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 4, 'stale completion must not clear the newer load');
  decodes[1].resolve({ current: true });
  assert.equal(await current, true); assert.equal(await joined, true);
  assert.equal(audio.state.ready, true); assert.equal(audio.state.context, 'running');
  await audio.dispose();
});
