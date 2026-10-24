import test from "node:test";
import assert from "node:assert/strict";
import { createDonorAudio } from "../src/donor-audio.js";

// The system can move a running AudioContext to "interrupted" (iOS call/Siri/alarm) or "suspended" without any
// page event. While the player is still in the game the audio asks to come back by itself; its own pause() and a
// hidden page are left alone.
function install(t, { refuse = false } = {}) {
  const made = [];
  class Context extends EventTarget {
    state = "suspended";
    resumes = 0;
    constructor() {
      super();
      made.push(this);
    }
    move(state) {
      this.state = state;
      this.dispatchEvent(new Event("statechange"));
    }
    async resume() {
      this.resumes++;
      if (refuse) throw Object.assign(new Error("not allowed"), { name: "NotAllowedError" });
      this.move("running");
    }
    async suspend() {
      this.move("suspended");
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
    delete globalThis.document;
  });
  return made;
}
const make = () => createDonorAudio({ baseUrl: "https://example.test/" });
const settle = () => new Promise((resolve) => setImmediate(resolve));

for (const state of ["interrupted", "suspended"])
  test(`a system move to ${state} while playing resumes by itself`, async (t) => {
    const made = install(t);
    const audio = make();
    await audio.unlock();
    const before = made[0].resumes;
    made[0].move(state);
    await settle();
    assert.equal(made[0].resumes, before + 1);
    assert.equal(audio.state.context, "running");
    await audio.dispose();
  });

test("our own pause() is not undone, and the next unlock plays again", async (t) => {
  const made = install(t);
  const audio = make();
  await audio.unlock();
  await audio.pause();
  await settle();
  assert.equal(audio.state.context, "suspended");
  const resumes = made[0].resumes;
  made[0].move("interrupted");
  await settle();
  assert.equal(made[0].resumes, resumes, "paused game does not resume itself");
  assert.equal(await audio.unlock(), true);
  made[0].move("interrupted");
  await settle();
  assert.equal(audio.state.context, "running", "after the Resume gesture, an interruption is recovered again");
  await audio.dispose();
});

test("a hidden page or switched-off sound is left alone", async (t) => {
  const made = install(t);
  const audio = make();
  await audio.unlock();
  globalThis.document = { hidden: true };
  made[0].move("interrupted");
  await settle();
  assert.equal(audio.state.context, "interrupted");
  globalThis.document = { hidden: false };
  audio.setEnabled(false);
  made[0].move("interrupted");
  await settle();
  assert.equal(audio.state.context, "interrupted");
  await audio.dispose();
});

test("a resume the system refuses is contained and one listener serves the whole session", async (t) => {
  const made = install(t, { refuse: true });
  const audio = make();
  await audio.unlock();
  await audio.unlock();
  assert.equal(made.length, 1);
  const before = made[0].resumes;
  made[0].move("interrupted");
  await settle();
  assert.equal(made[0].resumes, before + 1, "exactly one retry per state change");
  assert.equal(audio.state.context, "interrupted");
  await audio.dispose();
});
