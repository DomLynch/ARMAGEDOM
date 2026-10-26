import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createClientLog, newSessionId } from "../src/engine/client-log.js";
import { GAME_DATA } from "../src/engine/game-data.js";

const make = (options = {}) => {
  const sent = [],
    timers = [];
  const log = createClientLog({
    baseUrl: "https://x.test",
    release: "/armagedom/preview/three-1/",
    fetchImpl: async (url, init) => {
      sent.push({ url, body: JSON.parse(init.body), init });
      return { ok: true };
    },
    setTimer: (fn) => timers.push(fn) && timers.length,
    clearTimer: () => {},
    ...options,
  });
  return { log, sent, fire: () => timers.shift()() };
};

test("a boot failure sends one beacon that carries the page-load session id", () => {
  const { log, sent, fire } = make();
  log.report("boot", "load-failed", new Error("A game file could not be loaded"));
  fire();
  assert.equal(sent.length, 1);
  assert.match(sent[0].body.session, /^[0-9a-f]{12}$/);
  assert.equal(sent[0].body.events.length, 1);
  assert.deepEqual([sent[0].body.events[0].kind, sent[0].body.events[0].code], ["boot", "load-failed"]);
  assert.equal(sent[0].init.credentials, "omit", "still no credentials");
});

test("every report of one page load carries the same id, a new page load a different one, and it is not derived from anything the user has", () => {
  const a = make(),
    b = make();
  a.log.report("boot", "one");
  a.fire();
  a.log.report("sync", "two");
  a.fire();
  b.log.report("boot", "one");
  b.fire();
  assert.equal(a.sent[0].body.session, a.sent[1].body.session);
  assert.notEqual(a.sent[0].body.session, b.sent[0].body.session);
  const fixed = make({ sessionId: "abc123abc123" });
  fixed.log.report("boot", "x");
  fixed.fire();
  assert.equal(fixed.sent[0].body.session, "abc123abc123");
});

test("newSessionId is random hex of the data length and falls back to digits without crypto", () => {
  const chars = GAME_DATA.world.clientLog.sessionIdChars;
  assert.match(newSessionId(), new RegExp(`^[0-9a-f]{${chars}}$`));
  assert.match(newSessionId(null), new RegExp(`^[0-9]{${chars}}$`));
  assert.notEqual(newSessionId(), newSessionId());
  assert.equal(newSessionId(undefined, 8).length, 8);
});

test("the beacon is created at boot, before the world gate runs any network step, not inside startWorld", () => {
  const source = fs.readFileSync(new URL("../src/engine/browser-session.js", import.meta.url), "utf8");
  const created = source.indexOf("beacon = createClientLog(");
  const startWorld = source.indexOf("function startWorld()");
  const recheck = source.indexOf("async function recheckWorld()");
  assert.ok(created > 0 && startWorld > 0 && recheck > 0);
  assert.equal(source.split("createClientLog(").length - 1, 1, "created once");
  assert.ok(created < startWorld, "created before startWorld, not inside it");
  assert.ok(created < recheck, "created before the first status read can run");
});
