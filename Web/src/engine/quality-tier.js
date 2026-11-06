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
  const desktopClass = (needSettled) => {
    const rule = rules.desktopBackdrop,
      asked = new URLSearchParams(search).get(rule.param);
    if (!current.desktopBackdrop || asked === rule.offValue) return false;
    if (asked === rule.forceValue) return true;
    if (!(probed || forced) || (needSettled && !sampled)) return false;
    return rule.needs.every((n) => {
      const v = values[n.name];
      if (!Number.isFinite(v)) return n.whenMissing;
      return (n.min === undefined || v >= n.min) && (n.max === undefined || v <= n.max);
    });
  };
  if (forced) current = forced;
  const probeListeners = new Set();
  // Every need of a rule list holds against the probe readings (a missing reading follows the need's whenMissing).
  const needsMet = (needs) =>
    needs.every((n) => {
      const v = values[n.name];
      if (!Number.isFinite(v)) return n.whenMissing;
      return (n.min === undefined || v >= n.min) && (n.max === undefined || v <= n.max);
    });
  return {
    row: () => current,
    // A ceiling from the tier row: the smaller of the data's own value and the tier's.
    cap: (value, field) => Math.min(value, current[field]),
    onChange: (fn) => listeners.add(fn),
    // True once the device probe and the frame sample have both landed (or the tier is forced or off): row() is then final.
    settled: () => (probed || !rules.enabled || !!forced) && sampled,
    // Opt-in 1.5x desktop backdrop: only a tier row that allows it, once settled, with every need met. A missing reading follows its
    // need's whenMissing (cores and texture size must be reported; deviceMemory and touch points may be absent). ?desktop=0 is off;
    // ?desktop=1 skips the needs and the settle wait but never the tier row, so a low or mid tier can never be forced onto it.
    desktopBackdrop: () => desktopClass(true),
    // Desktop sharpness (data desktopSharpness): the same device class as the desktop backdrop but without the settle wait, so the higher
    // pixel ratio applies from the first resize. Null for phones, tablets and mid or low tiers; a later tier drop (onChange) turns it off.
    sharpness: () => (desktopClass(false) ? rules.desktopSharpness : null),
    // Desktop-only material polish (qualityTier.json materialPolish): the rule when the tier row allows it, the device probe has landed
    // (or the tier is forced) and every need holds, else null. It does not wait for the frame sample; if the tier later drops this
    // returns null and onChange fires. ?nopolish=1 is off. A phone or tablet fails the touchPoints need even on the full tier.
    materialPolish() {
      const rule = rules.materialPolish;
      if (!current.materialPolish || new URLSearchParams(search).get(rule.param) === rule.offValue) return null;
      return (probed || forced) && needsMet(rule.needs) ? rule : null;
    },
    // Called once when the device probe lands (the readings are then known).
    onProbe: (fn) => probeListeners.add(fn),
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
      for (const fn of probeListeners) fn(current);
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
