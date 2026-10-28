// Device quality tier (data/qualityTier.json). A device probe (cores, memory, texture size, pixel ratio) and a frame-time sample pick a
// tier row; the callers read its ceilings (pixel ratio, ragdolls, crowd bodies, distance scales). Presentation only: sim, hits, spawns
// and saves never read it. The tier can only go down while the game runs, once, when the frame-time sample lands.
import { GAME_DATA } from "./game-data.js";

const median = (list) => [...list].sort((a, b) => a - b)[list.length >> 1];

export function createQualityTier(rules, search = globalThis.location?.search ?? "") {
  const asked = new URLSearchParams(search).get(rules.param),
    forced = rules.tiers.find((t) => t.name === asked) ?? null,
    listeners = new Set(),
    values = {},
    frames = [];
  let current = rules.tiers[0],
    previous = 0,
    seen = 0,
    sampled = !rules.enabled || !!forced;
  const weakCount = () =>
    rules.signals.filter((s) => {
      const v = values[s.name];
      return Number.isFinite(v) && (s.weak === "atMost" ? v <= s.limit : v >= s.limit);
    }).length;
  const choose = () => {
    if (!rules.enabled || forced) return;
    const weak = weakCount(),
      next = rules.tiers.filter((t) => t.weakSignals <= weak).at(-1);
    if (next === current) return;
    current = next;
    for (const fn of listeners) fn(current);
  };
  if (forced) current = forced;
  return {
    row: () => current,
    // A ceiling from the tier row: the smaller of the data's own value and the tier's.
    cap: (value, field) => Math.min(value, current[field]),
    // The budget rows the physics pool reads, with the ragdoll cap lowered to the tier's.
    ragdollRows: (rows) => ({ ...rows, max_simultaneous_ragdolls: Math.min(rows.max_simultaneous_ragdolls, current.ragdolls) }),
    onChange: (fn) => listeners.add(fn),
    // The one-off device probe: { cores, memoryGb, textureSize, devicePixelRatio } (anything the browser does not report is left out).
    probe(env) {
      Object.assign(values, env);
      choose();
    },
    // Called with each frame's timestamp (ms). After warmup the median of the sample becomes the frameMs signal, once.
    frame(ms) {
      const delta = ms - previous;
      previous = ms;
      if (sampled || delta <= 0 || delta > rules.probe.maxFrameMs) return;
      if (++seen <= rules.probe.warmupFrames) return;
      frames.push(delta);
      if (frames.length < rules.probe.sampleFrames) return;
      sampled = true;
      values.frameMs = median(frames);
      choose();
    },
  };
}

export const QUALITY = createQualityTier(GAME_DATA.qualityTier);
