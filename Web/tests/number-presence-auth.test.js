import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateGuestAuth, validatePresenceClient, validateRemoteSurvivors } from "../src/engine/game-data.js";
import { CLOSE_REPLACED, LOC_INTERVAL_MS } from "../src/engine/presence-client.js";
import { INTERP_DELAY_MS } from "../src/engine/remote-players.js";
import { countNumberLiterals } from "../../scripts/number-literal-gate.mjs";

// remote-survivors.js 3 to 0, remote-players.js 4 to 0, presence-client.js 3 to 0, guest-auth.js 9 to 0 (value-identical). The ring radii
// moved to data/remoteSurvivors.json, the presence pacing to data/presenceClient.json, the sign-in timings and random-byte lengths to
// data/guestAuth.json. Wire facts stay in code with a reason: the replaced-session close code, HTTP status codes, two hex digits per byte,
// the quarter turn that lays the ring flat.
const text = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const raw = (name) => structuredClone(JSON.parse(text(`../src/data/${name}.json`)));
const src = (name) => text(`../src/engine/${name}.js`);

test("the data holds exactly the numbers the code used to hold", () => {
  assert.equal(GAME_DATA.remoteSurvivors.ringInner, 0.62);
  assert.equal(GAME_DATA.remoteSurvivors.ringOuter, 0.74);
  assert.deepEqual(GAME_DATA.presenceClient, {
    schema_version: 1, locIntervalMs: 80, jumpCmPerS: 700, interpDelayMs: 150, facingMinMetres: 0.02, maxNameLength: 24,
    movingMetresPerSecond: 0.3,
  });
  assert.deepEqual(GAME_DATA.guestAuth, {
    schema_version: 1, linkTtlSeconds: 600, fallbackExpiresInSeconds: 3600, nonceBytes: 16, verifierBytes: 32,
  });
  assert.equal(LOC_INTERVAL_MS, 80);
  assert.equal(INTERP_DELAY_MS, 150);
  assert.equal(CLOSE_REPLACED, 4010);
});

test("the modules read every number from the data rows", () => {
  const reads = {
    "remote-survivors": ["RingGeometry(look.ringInner, look.ringOuter, look.ringSegments)"],
    "remote-players": [
      "GAME_DATA.presenceClient.interpDelayMs",
      "GAME_DATA.presenceClient.facingMinMetres",
      "GAME_DATA.presenceClient.maxNameLength",
      "GAME_DATA.presenceClient.movingMetresPerSecond",
    ],
    "presence-client": ["GAME_DATA.presenceClient.locIntervalMs", "GAME_DATA.presenceClient.jumpCmPerS"],
    "guest-auth": [
      "GAME_DATA.guestAuth.fallbackExpiresInSeconds",
      "GAME_DATA.guestAuth.linkTtlSeconds",
      "Uint8Array(GAME_DATA.guestAuth.nonceBytes)",
      "Uint8Array(GAME_DATA.guestAuth.verifierBytes)",
    ],
  };
  for (const [file, uses] of Object.entries(reads))
    for (const use of uses) assert(src(file).includes(use), `${file}: ${use}`);
});

test("the loader refuses missing, extra and out-of-range numbers", () => {
  const broken = (validate, name, mutate) => () => {
    const d = raw(name);
    mutate(d);
    validate(d);
  };
  assert.doesNotThrow(broken(validatePresenceClient, "presenceClient", () => {}));
  assert.doesNotThrow(broken(validateGuestAuth, "guestAuth", () => {}));
  assert.doesNotThrow(broken(validateRemoteSurvivors, "remoteSurvivors", () => {}));
  assert.throws(broken(validatePresenceClient, "presenceClient", (d) => { delete d.jumpCmPerS; }));
  assert.throws(broken(validatePresenceClient, "presenceClient", (d) => { d.extra = 1; }));
  assert.throws(broken(validatePresenceClient, "presenceClient", (d) => { d.jumpCmPerS = 600; }), "jump speed must stay above the server's 650");
  assert.throws(broken(validatePresenceClient, "presenceClient", (d) => { d.locIntervalMs = 10; }));
  assert.throws(broken(validatePresenceClient, "presenceClient", (d) => { d.maxNameLength = 24.5; }));
  assert.throws(broken(validatePresenceClient, "presenceClient", (d) => { d.facingMinMetres = 0; }));
  assert.throws(broken(validateGuestAuth, "guestAuth", (d) => { delete d.linkTtlSeconds; }));
  assert.throws(broken(validateGuestAuth, "guestAuth", (d) => { d.nonceBytes = 8; }), "a nonce under 16 bytes is guessable");
  assert.throws(broken(validateGuestAuth, "guestAuth", (d) => { d.verifierBytes = 16; }), "a PKCE verifier under 32 bytes is too short");
  assert.throws(broken(validateGuestAuth, "guestAuth", (d) => { d.verifierBytes = 97; }), "RFC 7636 caps a verifier at 96 bytes");
  assert.throws(broken(validateRemoteSurvivors, "remoteSurvivors", (d) => { d.ringInner = 0.8; }), "inner radius must be below outer");
  assert.throws(broken(validateRemoteSurvivors, "remoteSurvivors", (d) => { delete d.ringOuter; }));
});

test("the gate counts 0 in the four files and their baseline entries are gone", () => {
  const baseline = JSON.parse(text("../../scripts/as-data-baseline.json")).numberLiterals;
  for (const file of ["remote-survivors", "remote-players", "presence-client", "guest-auth"]) {
    assert.equal(countNumberLiterals(src(file)).count, 0, file);
    assert(!(`engine/${file}.js` in baseline), file);
  }
});
