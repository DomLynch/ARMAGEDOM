// Device quality tier (data/qualityTier.json). A device probe (cores, memory, texture size) and a sustained frame-time sample pick a
// tier row; the callers read its ceilings (pixel ratio, ragdolls, crowd bodies, distance scales). Presentation only: sim, hits, spawns
// and saves never read it. The probe runs once per session; the tier can only go down, once, when the frame-time sample lands.
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
    probed = false,
    sampled = !rules.enabled || !!forced;
  const weakSignals = () =>
    rules.signals.filter((s) => {
      const v = values[s.name];
      return Number.isFinite(v) && (s.weak === "atMost" ? v <= s.limit : v >= s.limit);
    });
  const choose = () => {
    if (!rules.enabled || forced) return;
    const weak = weakSignals().length,
      next = rules.tiers.filter((t) => t.weakSignals <= weak).at(-1);
    if (rules.tiers.indexOf(next) <= rules.tiers.indexOf(current)) return; // never back up to a better tier
    current = next;
    for (const fn of listeners) fn(current);
  };
  if (forced) current = forced;
  return {
    row: () => current,
    // A ceiling from the tier row: the smaller of the data's own value and the tier's.
    cap: (value, field) => Math.min(value, current[field]),
    onChange: (fn) => listeners.add(fn),
    // True once the device probe and the frame sample have both landed (or the tier is forced or off): row() is then final.
    settled: () => (probed || !rules.enabled || !!forced) && sampled,
    // The chosen tier and why, as plain data a phone can show: the tier name, the readings, the signals that were weak, and how it was chosen.
    report: () =>
      Object.freeze({
        tier: current.name,
        how: !rules.enabled ? "off" : forced ? "forced" : "auto",
        values: Object.freeze({ ...values }),
        reasons: Object.freeze(weakSignals().map((s) => s.name)),
      }),
    // The device probe, taken ONCE per session: { cores, memoryGb, textureSize } (anything the browser does not report is left out).
    // Later calls (a resize asks again) are ignored, so the result is cached and the tier cannot move on them.
    probe(env) {
      if (probed) return;
      probed = true;
      Object.assign(values, env);
      choose();
    },
    // Called with each real frame's timestamp (ms). After warmup the median of a long sample becomes the frameMs signal, once.
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

// The read-only global a phone can show (the name is data). A getter with no setter: assigning to it changes nothing.
export function exposeQualityTier(tier, rules, target = globalThis) {
  if (rules.globalName)
    Object.defineProperty(target, rules.globalName, { get: tier.report, set: undefined, configurable: true, enumerable: true });
  return tier;
}

export const QUALITY = exposeQualityTier(createQualityTier(GAME_DATA.qualityTier), GAME_DATA.qualityTier);
