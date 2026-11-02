import test from 'node:test';
import assert from 'node:assert/strict';
import {installQaBridge, qaAllowed} from '../src/engine/qa-bridge.js';

const at = (href) => new URL(href);
function page(href, extra = {}) {
  const listeners = {}, target = {addEventListener: (type, fn) => (listeners[type] = fn)};
  const calls = [], consoleObject = {error: (...a) => calls.push(a)};
  const game = {time: 3, player: {pos: {x: 1.5, z: -2}, hp: 80}};
  const view = {session: () => 's', game: () => game, world: () => ({areaId: 'westminster'}), presence: () => ({remotes: 4, client: {id: 'me', joined: true}}), loaded: () => true, areaId: () => 'westminster', ...extra};
  return {target, listeners, consoleObject, calls, game, install: () => installQaBridge({location: at(href), target, view, consoleObject})};
}

test('the bridge is allowed only on a loopback host WITH ?qa=1: never on a real host', () => {
  for (const ok of ['http://127.0.0.1:8080/?qa=1', 'http://localhost/index.html?qa=1', 'http://[::1]:9/?qa=1', 'http://e2e.localhost/?x=1&qa=1']) assert.equal(qaAllowed(at(ok)), true, ok);
  for (const no of [
    'https://playarmagedom.com/?qa=1', 'https://playarmagedom.com/', 'http://127.0.0.1/', 'http://127.0.0.1/?qa=0',
    'https://127.0.0.1.evil.example/?qa=1', 'https://localhost.evil.example/?qa=1', 'https://evil.example/?qa=1&host=localhost',
    'https://x.localhost.evil.example/?qa=1',
  ]) assert.equal(qaAllowed(at(no)), false, no);
  assert.equal(qaAllowed(null), false);
});

test('on a real host nothing is installed: no __qa, no console wrapper, no listeners', () => {
  const p = page('https://playarmagedom.com/?qa=1');
  const original = p.consoleObject.error;
  assert.equal(p.install(), null);
  assert.equal(p.target.__qa, undefined);
  assert.equal(p.consoleObject.error, original);
  assert.deepEqual(p.listeners, {});
});

test('on a local QA page window.__qa answers read-only: state, game, world, session, errors', () => {
  const p = page('http://127.0.0.1:8080/?qa=1');
  p.install();
  const qa = p.target.__qa;
  assert.deepEqual(qa.state(), {loaded: true, area: 'westminster', pos: {x: 1.5, z: -2}, hp: 80, time: 3, remotes: 4, presence: {id: 'me', joined: true}, errors: 0});
  assert.equal(qa.game, p.game);
  assert.equal(qa.session, 's');
  assert.equal(qa.world.areaId, 'westminster');
  assert(Object.isFrozen(qa));
  assert.equal(Object.keys(p.target).includes('__qa'), false, 'not enumerable');
  assert.equal(p.install(), null, 'a second install does nothing');
});

test('page errors, unhandled rejections and console.error are captured (and console.error still prints), at most 50', () => {
  const p = page('http://localhost:3000/?qa=1');
  p.install();
  p.listeners.error({error: new Error('boom'), message: 'Uncaught'});
  p.listeners.unhandledrejection({reason: new Error('nope')});
  p.consoleObject.error('ARMAGEDOM_LOAD_FAILED', new Error('bad rig'));
  assert.deepEqual(p.target.__qa.errors.map(e => [e.type, e.message]), [['error', 'boom'], ['unhandledrejection', 'nope'], ['console.error', 'ARMAGEDOM_LOAD_FAILED bad rig']]);
  assert.equal(p.calls.length, 1);
  for (let i = 0; i < 80; i++) p.consoleObject.error('e' + i);
  assert.equal(p.target.__qa.errors.length, 50);
  p.target.__qa.errors[0].message = 'tampered';
  assert.equal(p.target.__qa.errors[0].message, 'boom', 'errors come back as copies');
});

test('state tolerates a game that has not loaded yet', () => {
  const p = page('http://127.0.0.1/?qa=1', {game: () => null, presence: () => null, loaded: () => false, areaId: () => undefined});
  p.install();
  assert.deepEqual(p.target.__qa.state(), {loaded: false, area: null, pos: null, hp: null, time: null, remotes: 0, presence: null, errors: 0});
});
