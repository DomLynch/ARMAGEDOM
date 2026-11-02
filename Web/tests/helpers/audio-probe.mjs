// Replays a fixed event list through createDonorAudio on a recording fake AudioContext and returns every node, parameter and timing call
// as plain JSON. tests/data-audio.test.js compares it with tests/fixtures/audio-pre-data.json, which this same file wrote on origin/main
// (64aae21) before the synthesized cue numbers moved into data/audio.json. Run it as `node audio-probe.mjs <donor-audio module URL>`.
import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync(new URL("../../public/audio/manifest.json", import.meta.url), "utf8"));

export async function audioProbe(moduleUrl) {
  const { createDonorAudio } = await import(moduleUrl);
  const log = [];
  let nodes = 0;
  const param = (id, name, initial = 0) => {
    const p = { _v: initial };
    Object.defineProperty(p, "value", {
      get: () => p._v,
      set: (v) => {
        p._v = v;
        log.push([id, `${name}=`, v]);
      },
    });
    for (const method of ["setValueAtTime", "linearRampToValueAtTime", "exponentialRampToValueAtTime"])
      p[method] = (...a) => log.push([id, `${name}.${method}`, ...a]);
    return p;
  };
  const node = (kind, extra = {}) => {
    const id = `${kind}${nodes++}`;
    const n = { id, ...extra };
    for (const method of ["connect", "disconnect", "start", "stop"])
      n[method] = (...a) => log.push([id, method, ...a.map((x) => (x && x.id) || x)]);
    log.push([id, "create"]);
    return n;
  };
  class Context {
    state = "suspended";
    currentTime = 1;
    sampleRate = 48000;
    destination = { id: "destination" };
    async resume() {
      this.state = "running";
    }
    async suspend() {
      this.state = "suspended";
    }
    async close() {
      this.state = "closed";
    }
    async decodeAudioData() {
      return { decoded: true };
    }
    createOscillator() {
      const n = node("osc");
      n.frequency = param(n.id, "frequency");
      Object.defineProperty(n, "type", { set: (v) => log.push([n.id, "type=", v]) });
      return n;
    }
    createGain() {
      const n = node("gain");
      n.gain = param(n.id, "gain", 1);
      return n;
    }
    createBiquadFilter() {
      const n = node("filter");
      n.frequency = param(n.id, "frequency");
      Object.defineProperty(n, "type", { set: (v) => log.push([n.id, "type=", v]) });
      return n;
    }
    createBufferSource() {
      const n = node("src");
      Object.defineProperty(n, "buffer", { set: () => log.push([n.id, "buffer="]) });
      return n;
    }
    createBuffer(channels, length, rate) {
      log.push(["buffer", "create", channels, length, rate]);
      return { getChannelData: () => new Float32Array(length) };
    }
  }
  const previousContext = globalThis.AudioContext,
    previousFetch = globalThis.fetch;
  globalThis.AudioContext = Context;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => manifest,
    arrayBuffer: async () => new ArrayBuffer(0),
  });
  try {
    const audio = createDonorAudio({ baseUrl: "https://example.test/" });
    await audio.unlock();
    const hit = (weapon, extra = {}) => ({ type: "hit", weapon, amount: 5, actor: { id: 7 }, ...extra });
    const scenarios = {
      impacts: [
        { type: "sever-presented", victimId: 3 },
        { type: "hit", weapon: "knife", amount: 5, audioWeight: "heavy" },
        { type: "hit", weapon: "knife", amount: 5 },
        { type: "parry", weapon: "knife" },
        { type: "block", weapon: "knife" },
        { type: "guard-break", weapon: "knife" },
        { type: "attack", weapon: "knife", action: "heavy" },
        { type: "enemy-attack", weapon: "claw" },
        { type: "dodge", weapon: "knife" },
      ],
      gun: [
        hit("pistol"),
        { type: "shot", weapon: "pistol" },
        { type: "shot", weapon: "unlisted-gun" },
        { type: "reaper-shot", weapon: "rifle" },
      ],
      kill: [
        hit("pistol", { actor: { id: 9 } }),
        { type: "death", weapon: "pistol", actor: { id: 9 } },
        { type: "death", weapon: "rifle", actor: { id: 11 } },
      ],
      explosive: [
        { type: "rocket-launch" },
        { type: "boss-rocket-launch" },
        { type: "grenade-blast" },
        { type: "boss-rocket-blast" },
        { type: "pickup" },
      ],
      railgun: [
        { type: "railgun-charge-start", seconds: 1.5 },
        { type: "railgun-shot" },
        { type: "saw-start", actor: { id: 1 } },
        { type: "saw-stop", actor: { id: 1 } },
      ],
      crowd: Array.from({ length: 20 }, () => ({ type: "shot", weapon: "pistol" })),
    };
    const out = {};
    for (const mode of ["high", "low", "off"]) {
      audio.setMode(mode);
      out[mode] = {};
      for (const [name, events] of Object.entries(scenarios)) {
        audio.reset();
        log.length = 0;
        audio.play(events);
        out[mode][name] = { log: JSON.parse(JSON.stringify(log)), state: { ...audio.state, error: audio.state.error } };
      }
    }
    await audio.dispose();
    return out;
  } finally {
    if (previousContext === undefined) delete globalThis.AudioContext;
    else globalThis.AudioContext = previousContext;
    globalThis.fetch = previousFetch;
  }
}

if (process.argv[2]) process.stdout.write(JSON.stringify(await audioProbe(process.argv[2])));
