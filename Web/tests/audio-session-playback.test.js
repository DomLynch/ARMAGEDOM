import test from "node:test";
import assert from "node:assert/strict";
import { createDonorAudio, requestPlaybackAudioSession } from "../src/donor-audio.js";

test("playback audio session is set when the browser has audioSession", () => {
  const nav = { audioSession: { type: "auto" } };
  requestPlaybackAudioSession(nav);
  assert.equal(nav.audioSession.type, "playback");
});

test("browsers without audioSession are left alone and nothing throws", () => {
  const nav = {};
  assert.doesNotThrow(() => requestPlaybackAudioSession(nav));
  assert.equal("audioSession" in nav, false);
  assert.doesNotThrow(() => requestPlaybackAudioSession(undefined));
  assert.doesNotThrow(() => requestPlaybackAudioSession(null));
});

test("the Enter-gesture unlock sets the playback session before the AudioContext exists", async (t) => {
  const order = [];
  const nav = {
    audioSession: {
      set type(value) {
        order.push(`type:${value}`);
      },
    },
  };
  class FakeContext {
    constructor() {
      order.push("context");
      this.state = "suspended";
    }
    async resume() {
      order.push("resume");
      this.state = "running";
    }
  }
  const saved = {
    navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"),
    AudioContext: Object.getOwnPropertyDescriptor(globalThis, "AudioContext"),
    fetch: Object.getOwnPropertyDescriptor(globalThis, "fetch"),
  };
  Object.defineProperty(globalThis, "navigator", { value: nav, configurable: true, writable: true });
  Object.defineProperty(globalThis, "AudioContext", { value: FakeContext, configurable: true, writable: true });
  // Decode is not under test: fail the manifest fetch so unlock stops after resume.
  Object.defineProperty(globalThis, "fetch", {
    value: async () => {
      throw new Error("offline");
    },
    configurable: true,
    writable: true,
  });
  t.after(() => {
    for (const [name, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  await createDonorAudio({ baseUrl: "http://localhost/" }).unlock();
  assert.deepEqual(order.slice(0, 3), ["type:playback", "context", "resume"]);
});
