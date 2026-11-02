import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import crypto from "node:crypto";
import { audioProbe } from "./helpers/audio-probe.mjs";
import { GAME_DATA, validateAudio } from "../src/engine/game-data.js";
import { donorCues } from "../src/donor-audio.js";

// Data batch 11 (World): the synthesized cue numbers, voice cap, master gain, fades and loop levels of donor-audio.js moved into
// data/audio.json. tests/fixtures/audio-pre-data.json is what tests/helpers/audio-probe.mjs printed on origin/main (64aae21) before the
// move: every node, parameter and timing call for a fixed event list in high, low and off modes, including the 16-voice cap.
const old = JSON.parse(fs.readFileSync(new URL("./fixtures/audio-pre-data.json", import.meta.url)));
const rawText = fs.readFileSync(new URL("../src/data/audio.json", import.meta.url), "utf8");

test("the data file is pinned", () => {
  assert.equal(
    crypto.createHash("sha256").update(rawText).digest("hex"),
    "37459862f186563b497df3ac26511d4d1a7b8a44e2204c988b1c7e9f2b892bb0",
  );
});

test("the audio engine makes exactly the calls it made before the move, in every mode", async () => {
  const now = await audioProbe(new URL("../src/donor-audio.js", import.meta.url).href);
  assert.deepEqual(Object.keys(now), ["high", "low", "off"]);
  for (const mode of Object.keys(old))
    for (const scenario of Object.keys(old[mode]))
      assert.deepEqual(now[mode][scenario], old[mode][scenario], `${mode} ${scenario}`);
  assert.equal(old.high.crowd.state.activeVoices, 16, "the probe reaches the voice cap");
});

test("the cue gains are the old ones", () => {
  const gains = (events) => donorCues(events).map((c) => [c.name, c.gain]);
  assert.deepEqual(gains([{ type: "sever-presented" }]), [["hit_heavy", 0.5]]);
  assert.deepEqual(gains([{ type: "hit", amount: 1 }]), [["hit_flesh", 0.3]]);
  assert.deepEqual(gains([{ type: "hit", amount: 1, audioWeight: "heavy" }]), [["hit_heavy", 0.3]]);
  assert.deepEqual(gains([{ type: "attack", action: "heavy" }]), [["whoosh_heavy", 0.18]]);
  assert.deepEqual(gains([{ type: "attack" }]), [["whoosh_light", 0.12]]);
  assert.deepEqual(gains([{ type: "dodge" }]), [["roll", 0.12]]);
});

test("the rows are frozen data", () => {
  assert(
    Object.isFrozen(GAME_DATA.audio) &&
      Object.isFrozen(GAME_DATA.audio.engine) &&
      Object.isFrozen(GAME_DATA.audio.hit.lethal.tone),
  );
});

test("the loader rejects a broken audio file", () => {
  const broken = (mutate) => () => {
    const d = JSON.parse(rawText);
    mutate(d);
    validateAudio(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(
    broken((d) => {
      d.extra = 1;
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.engine;
    }),
  );
  assert.throws(
    broken((d) => {
      d.engine.voiceCapacity = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      d.engine.voiceCapacity = 1.5;
    }),
  );
  assert.throws(
    broken((d) => {
      d.engine.outputGain = 2;
    }),
  );
  assert.throws(
    broken((d) => {
      d.engine.extra = 1;
    }),
  );
  assert.throws(
    broken((d) => {
      d.saw.frequency = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      d.cueGains.hit = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.cueGains.roll;
    }),
  );
  assert.throws(
    broken((d) => {
      d.hit.lethal.tone.gain = 1.5;
    }),
  );
  assert.throws(
    broken((d) => {
      d.hit.lethal.tone.type = "square";
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.hit.lethal.ring;
    }),
  );
  assert.throws(
    broken((d) => {
      d.hit.normal.noise.cutoff = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      d.hit.normal.noise.extra = 1;
    }),
  );
  assert.throws(
    broken((d) => {
      d.railgunShot.crack.seconds = -1;
    }),
  );
  assert.throws(
    broken((d) => {
      d.shot.fallback.noiseGain = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      delete d.shot.fallback.cutoff;
    }),
  );
  assert.throws(
    broken((d) => {
      d.rocketLaunch.tone.from = "low";
    }),
  );
  assert.throws(
    broken((d) => {
      d.grenadeOff.gain = 0;
    }),
  );
  assert.throws(
    broken((d) => {
      d.pickup.type = "noise";
    }),
  );
});
