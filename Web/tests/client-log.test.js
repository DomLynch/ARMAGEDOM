import test from 'node:test';
import assert from 'node:assert/strict';
import {createClientLog, scrub, releaseOf} from '../src/engine/client-log.js';
import {GAME_DATA} from '../src/engine/game-data.js';

function make(options = {}) {
  const sent = [], timers = [], clock = {ms: 100000};
  const log = createClientLog({
    baseUrl: 'https://x.test',
    release: '/armagedom/preview/three-1/',
    getArea: () => 'westminster',
    fetchImpl: async (url, init) => { sent.push({url, init, body: JSON.parse(init.body)}); return {ok: true}; },
    now: () => clock.ms,
    setTimer: (fn, ms) => timers.push({fn, ms}) && timers.length,
    clearTimer: () => {},
    ...options,
  });
  return {log, sent, timers, clock, fire: () => timers.shift().fn()};
}

test('tuning is data: one batch per 10 s, at most 10 rows', () => {
  assert.deepEqual(GAME_DATA.world.clientLog, {path: '/arma/api/clientlog', kinds: ['error', 'boot', 'presence', 'sync'], minIntervalMs: 10000, maxEvents: 10, maxDistinct: 40, messageChars: 200, maxBodyBytes: 3800});
  assert(GAME_DATA.world.clientLog.maxBodyBytes < 4096, 'under the writer\'s 4096-byte limit');
});

test('the encoded body stays under the byte cap: rows are held back, in bytes, not characters (escapes and non-ASCII count more)', async () => {
  const t = make();
  // 10 rows of 200 non-ASCII characters (3 bytes each in UTF-8) plus 20 control-free escapes: far over 3800 bytes together.
  for (let i = 0; i < 10; i++) t.log.report('error', `c${i}`, 'é中'.repeat(100));
  await t.fire();
  const first = new TextEncoder().encode(t.sent[0].init.body).length;
  assert(first <= 3800, `first batch is ${first} bytes`);
  assert(t.sent[0].body.events.length < 10, 'some rows waited for the next window');
  const queued = 10 - t.sent[0].body.events.length;
  let more = 0;
  while (t.timers.length) {
    t.clock.ms += 10000;
    await t.fire();
    more++;
    assert(new TextEncoder().encode(t.sent.at(-1).init.body).length <= 3800);
  }
  assert.equal(t.sent.flatMap(s => s.body.events).length, 10, 'every row is eventually sent exactly once');
  assert(queued > 0 && more >= 1);
});

test('pause (a closed status read) drops what is pending and ignores reports until resume', async () => {
  const t = make();
  t.log.report('sync', 'a');
  t.log.pause();
  assert.equal(t.log.pending, 0);
  t.log.report('sync', 'b');
  assert.equal(t.log.pending, 0, 'nothing is kept while the world is closed');
  assert.equal(t.sent.length, 0);
  t.log.resume();
  t.log.report('sync', 'c');
  await t.fire();
  assert.deepEqual(t.sent[0].body.events.map(e => e.code), ['c']);
});

test('scrub removes URL queries and hashes, tokens, bearer headers and e-mail addresses, and truncates', () => {
  const dirty = 'fetch https://x.test/arma/api/save?token=abc&link=9#access_token=zzz failed; Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig for dom@example.com code=12345';
  const clean = scrub(dirty);
  assert.equal(clean, 'fetch https://x.test/arma/api/save failed; Bearer <x> for <email> code=<x>');
  assert.equal(scrub('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.sig'), '<jwt>');
  assert.equal(scrub('x'.repeat(500)).length, 200);
  assert.equal(scrub(undefined), '');
  assert.equal(releaseOf('/armagedom/preview/three-20261024-233/?x=1 "<b>'), '/armagedom/preview/three-20261024-233/x1b');
});

test('a row carries kind, code, scrubbed message, count, area and release - and no credentials', async () => {
  const t = make();
  t.log.report('sync', 'pull-failed', new Error('boom at https://x.test/a?token=SECRET'));
  assert.equal(t.sent.length, 0, 'nothing is sent synchronously');
  assert.equal(t.timers[0].ms, 1000, 'the first failure waits a second so related rows travel together');
  await t.fire();
  const {url, init, body} = t.sent[0];
  assert.equal(url, 'https://x.test/arma/api/clientlog');
  assert.equal(init.credentials, 'omit');
  assert.equal(init.headers.Authorization, undefined);
  assert.deepEqual(body, {v: 1, release: '/armagedom/preview/three-1/', area: 'westminster', events: [{kind: 'sync', code: 'pull-failed', message: 'boom at https://x.test/a', n: 1}]});
  assert(!init.body.includes('SECRET'));
});

test('the same failure repeating is one row with a count; unknown kinds are ignored', async () => {
  const t = make();
  for (let i = 0; i < 25; i++) t.log.report('presence', 'close-1006');
  t.log.report('whatever', 'x');
  await t.fire();
  assert.deepEqual(t.sent[0].body.events, [{kind: 'presence', code: 'close-1006', message: '', n: 25}]);
});

test('at most one request per minIntervalMs, however many failures: the rest wait for the next window', async () => {
  const t = make();
  t.log.report('sync', 'a');
  await t.fire();
  t.clock.ms += 3000;
  t.log.report('sync', 'b');
  assert.equal(t.timers[0].ms, 10000 - 3000, 'waits out the rest of the 10 s');
  t.clock.ms += 7000;
  await t.fire();
  assert.equal(t.sent.length, 2);
  assert.equal(t.sent[1].body.events[0].code, 'b');
});

test('a batch holds at most 10 rows; the overflow goes in the next window; past 40 distinct rows the rest is counted, not kept', async () => {
  const t = make();
  for (let i = 0; i < 45; i++) t.log.report('error', `c${i}`);
  await t.fire();
  assert.equal(t.sent[0].body.events.length, 10);
  assert.equal(t.sent[0].body.dropped, 5);
  assert.equal(t.timers.length, 1, 'the remaining 30 rows are scheduled');
});

test('a failing or throwing fetch is dropped quietly: no retry loop, no throw', async () => {
  for (const fetchImpl of [async () => { throw Error('offline'); }, () => { throw Error('sync throw'); }]) {
    const t = make({fetchImpl});
    t.log.report('boot', 'no-token');
    await t.fire();
    await Promise.resolve();
    assert.equal(t.log.pending, 0);
    assert.equal(t.timers.length, 0, 'nothing retries');
  }
});

test('install turns uncaught errors and unhandled rejections into rows, and its cleanup removes them', async () => {
  const handlers = {};
  const target = {addEventListener: (type, fn) => (handlers[type] = fn), removeEventListener: type => delete handlers[type]};
  const t = make();
  const remove = t.log.install(target);
  handlers.error({error: new Error('x is not a function'), message: 'Uncaught'});
  handlers.unhandledrejection({reason: new Error('nope')});
  await t.fire();
  assert.deepEqual(t.sent[0].body.events.map(e => [e.kind, e.code, e.message]), [['error', 'uncaught', 'x is not a function'], ['error', 'unhandled-rejection', 'nope']]);
  remove();
  assert.deepEqual(Object.keys(handlers), []);
});

test('stop drops what is pending and ignores later reports', () => {
  const t = make();
  t.log.report('sync', 'a');
  t.log.stop();
  t.log.report('sync', 'b');
  assert.equal(t.log.pending, 0);
  assert.equal(t.sent.length, 0);
});
