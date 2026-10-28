// qualityTier.json validator (engine/quality-tier.js reads the data).
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

export function validateQualityTier(d) {
  closed(d, ["schema_version", "note", "enabled", "param", "autoValue", "probe", "signals", "tiers"]);
  if (d.schema_version !== 1) fail("qualityTier", "schema_version must be 1");
  if (typeof d.enabled !== "boolean") fail("qualityTier", "enabled must be true or false");
  if (!d.param || !d.autoValue) fail("qualityTier", "param and autoValue are required");
  closed(d.probe, ["warmupFrames", "sampleFrames", "maxFrameMs"]);
  count("qualityTier", "probe.warmupFrames", d.probe.warmupFrames, 0, 600);
  count("qualityTier", "probe.sampleFrames", d.probe.sampleFrames, 1, 600);
  number("qualityTier", "probe.maxFrameMs", d.probe.maxFrameMs, 1);
  if (!Array.isArray(d.signals) || !d.signals.length) fail("qualityTier", "signals must be a list");
  for (const s of d.signals) {
    closed(s, ["name", "weak", "limit"]);
    if (!s.name || !["atMost", "atLeast"].includes(s.weak)) fail("qualityTier", "a signal needs a name and atMost or atLeast");
    number("qualityTier", `${s.name}.limit`, s.limit, 0);
  }
  if (!Array.isArray(d.tiers) || !d.tiers.length) fail("qualityTier", "tiers must be a list");
  let last = -1;
  const names = new Set();
  for (const t of d.tiers) {
    closed(t, ["name", "weakSignals", "pixelRatio", "ragdolls", "crowdBodies", "distanceScale", "shadowScale"]);
    if (!t.name || names.has(t.name) || t.name === d.autoValue) fail("qualityTier", "tier names must be unique and not the auto value");
    names.add(t.name);
    count("qualityTier", `${t.name}.weakSignals`, t.weakSignals, last + 1, d.signals.length);
    last = t.weakSignals;
    number("qualityTier", `${t.name}.pixelRatio`, t.pixelRatio, 1);
    count("qualityTier", `${t.name}.ragdolls`, t.ragdolls, 1, 64);
    count("qualityTier", `${t.name}.crowdBodies`, t.crowdBodies, 0, 12);
    number("qualityTier", `${t.name}.distanceScale`, t.distanceScale, 0.1);
    number("qualityTier", `${t.name}.shadowScale`, t.shadowScale, 0.1);
  }
  if (d.tiers[0].weakSignals !== 0) fail("qualityTier", "the first tier must need no weak signals");
}
