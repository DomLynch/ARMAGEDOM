import test from "node:test";
import assert from "node:assert/strict";
import { createDonorAudio } from "../src/donor-audio.js";

// iOS Safari reports an AudioContext as "interrupted" (call, Siri, alarm, another app's audio) and only leaves that
// state through resume() inside a user gesture. The game calls audio.unlock() from every pointerup/touchend/click
// and from the Resume button, so these probes pin that each such path brings a silenced context back.
function install(t, { onResume } = {}) {
  const made = [];
  class Context {
    state = "suspended";
    constructor() {
      made.push(this);
    }
    async resume() {
      if (onResume) return onResume(this);
      this.state = "running";
    }
    async suspend() {
      this.state = "suspended";
    }
    async close() {
      this.state = "closed";
    }
    async decodeAudioData() {
      return {};
    }
  }
  const previous = globalThis.AudioContext;
  globalThis.AudioContext = Context;
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ url: "combat.wav", cues: {} }),
    arrayBuffer: async () => new ArrayBuffer(0),
  }));
  t.after(() => {
    if (previous === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previous;
  });
  return made;
}
const make = () => createDonorAudio({ baseUrl: "https://example.test/" });

test("first gesture creates the context, resumes it and loads the cues", async (t) => {
  const made = install(t);
  const audio = make();
  assert.equal(audio.state.context, "locked");
  assert.equal(await audio.unlock(), true);
  assert.equal(made.length, 1);
  assert.equal(audio.state.context, "running");
  assert.equal(audio.state.ready, true);
  await audio.dispose();
});

test("an interrupted context is silent, then the next gesture brings it back without reloading", async (t) => {
  const made = install(t);
  const audio = make();
  await audio.unlock();
  made[0].state = "interrupted";
  assert.equal(audio.state.context, "interrupted");
  assert.doesNotThrow(() => audio.play([{ type: "hit", amount: 1 }]), "play is a no-op while interrupted");
  assert.equal(await audio.unlock(), true);
  assert.equal(audio.state.context, "running");
  assert.equal(made.length, 1, "the same context is resumed, not replaced");
  await audio.dispose();
});

test("a resume that stays pending through the interruption does not block a later gesture", async (t) => {
  let calls = 0;
  const made = install(t, {
    onResume: (context) => {
      if (++calls === 2) return new Promise(() => {});
      context.state = "running";
    },
  });
  const audio = make();
  await audio.unlock();
  made[0].state = "interrupted";
  audio.unlock().catch(() => {});
  made[0].state = "interrupted";
  assert.equal(await audio.unlock(), true, "the third gesture resumes and reports running");
  await audio.dispose();
});

test("a resume refused during the interruption is contained and the next gesture succeeds", async (t) => {
  let refuse = false;
  const made = install(t, {
    onResume: (context) => {
      if (refuse) throw Object.assign(new Error("not allowed"), { name: "NotAllowedError" });
      context.state = "running";
    },
  });
  const audio = make();
  await audio.unlock();
  made[0].state = "interrupted";
  refuse = true;
  assert.equal(await audio.unlock(), false);
  assert.match(audio.state.error, /not allowed/);
  refuse = false;
  assert.equal(await audio.unlock(), true);
  assert.equal(audio.state.error, null);
  await audio.dispose();
});

test("screen lock or app switch: pause suspends, the Resume gesture runs it again", async (t) => {
  const made = install(t);
  const audio = make();
  await audio.unlock();
  await audio.pause();
  assert.equal(audio.state.context, "suspended");
  assert.equal(await audio.unlock(), true);
  assert.equal(audio.state.context, "running");
  assert.equal(made.length, 1);
  await audio.dispose();
});
