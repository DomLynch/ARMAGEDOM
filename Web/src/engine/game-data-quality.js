// qualityTier.json validator (engine/quality-tier.js reads the data).
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

export function validateQualityTier(d) {
  closed(d, ["schema_version", "note", "enabled", "param", "autoValue", "globalName", "probe", "desktopBackdrop", "desktopSharpness", "materialPolish", "signals", "tiers"]);
  if (d.schema_version !== 1) fail("qualityTier", "schema_version must be 1");
  if (typeof d.enabled !== "boolean") fail("qualityTier", "enabled must be true or false");
  if (!d.param || !d.autoValue) fail("qualityTier", "param and autoValue are required");
  closed(d.probe, ["warmupFrames", "sampleFrames", "maxFrameMs"]);
  count("qualityTier", "probe.warmupFrames", d.probe.warmupFrames, 0, 600);
  count("qualityTier", "probe.sampleFrames", d.probe.sampleFrames, 1, 600);
  number("qualityTier", "probe.maxFrameMs", d.probe.maxFrameMs, 1);
  closed(d.desktopBackdrop, ["param", "forceValue", "offValue", "needs"]);
  for (const f of ["param", "forceValue", "offValue"])
    if (!d.desktopBackdrop[f]) fail("qualityTier", `desktopBackdrop.${f} is required`);
  if (d.desktopBackdrop.param === d.param) fail("qualityTier", "desktopBackdrop.param must differ from param");
  if (!Array.isArray(d.desktopBackdrop.needs)) fail("qualityTier", "desktopBackdrop.needs must be a list");
  for (const n of d.desktopBackdrop.needs) {
    closed(n, ["name", "whenMissing"], ["min", "max"]);
    if (!n.name || typeof n.whenMissing !== "boolean") fail("qualityTier", "a need has a name and a true or false whenMissing");
    if (n.min === undefined && n.max === undefined) fail("qualityTier", `${n.name} needs a min or a max`);
    for (const f of ["min", "max"]) if (n[f] !== undefined) number("qualityTier", `${n.name}.${f}`, n[f], 0);
  }
  closed(d.desktopSharpness, ["pixelRatio", "anisotropy"]);
  number("qualityTier", "desktopSharpness.pixelRatio", d.desktopSharpness.pixelRatio, 1);
  count("qualityTier", "desktopSharpness.anisotropy", d.desktopSharpness.anisotropy, 1, 16);
  const m = d.materialPolish;
  closed(m, ["param", "offValue", "needs", "anisotropy", "roughnessMin", "metalnessMax"]);
  if (!m.param || !m.offValue) fail("qualityTier", "materialPolish.param and offValue are required");
  if (m.param === d.param || m.param === d.desktopBackdrop.param) fail("qualityTier", "materialPolish.param must be its own parameter");
  if (!Array.isArray(m.needs)) fail("qualityTier", "materialPolish.needs must be a list");
  for (const n of m.needs) {
    closed(n, ["name", "whenMissing"], ["min", "max"]);
    if (!n.name || typeof n.whenMissing !== "boolean") fail("qualityTier", "a polish need has a name and a true or false whenMissing");
    if (n.min === undefined && n.max === undefined) fail("qualityTier", `polish ${n.name} needs a min or a max`);
    for (const f of ["min", "max"]) if (n[f] !== undefined) number("qualityTier", `polish ${n.name}.${f}`, n[f], 0);
  }
  count("qualityTier", "materialPolish.anisotropy", m.anisotropy, 1, 16);
  number("qualityTier", "materialPolish.roughnessMin", m.roughnessMin, 0);
  number("qualityTier", "materialPolish.metalnessMax", m.metalnessMax, 0);
  if (m.roughnessMin > 1 || m.metalnessMax > 1) fail("qualityTier", "materialPolish roughnessMin and metalnessMax are 0 to 1");
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
    closed(t, ["name", "weakSignals", "desktopBackdrop", "materialPolish", "pixelRatio", "ragdolls", "crowdBodies", "distanceScale", "shadowScale"]);
    if (!t.name || names.has(t.name) || t.name === d.autoValue) fail("qualityTier", "tier names must be unique and not the auto value");
    names.add(t.name);
    if (typeof t.materialPolish !== "boolean") fail("qualityTier", `${t.name}.materialPolish must be true or false`);
    if (typeof t.desktopBackdrop !== "boolean") fail("qualityTier", `${t.name}.desktopBackdrop must be true or false`);
    count("qualityTier", `${t.name}.weakSignals`, t.weakSignals, last + 1, d.signals.length);
    last = t.weakSignals;
    number("qualityTier", `${t.name}.pixelRatio`, t.pixelRatio, 1);
    count("qualityTier", `${t.name}.ragdolls`, t.ragdolls, 1, 64);
    count("qualityTier", `${t.name}.crowdBodies`, t.crowdBodies, 0, 12);
    number("qualityTier", `${t.name}.distanceScale`, t.distanceScale, 0.1);
    number("qualityTier", `${t.name}.shadowScale`, t.shadowScale, 0.1);
  }
  if (d.tiers.slice(1).some((t) => t.desktopBackdrop)) fail("qualityTier", "only the first (top) tier may allow the desktop backdrop");
  if (d.tiers.slice(1).some((t) => t.materialPolish)) fail("qualityTier", "only the first (top) tier may allow material polish");
  if (d.tiers[0].weakSignals !== 0) fail("qualityTier", "the first tier must need no weak signals");
  if (d.tiers.slice(1).some((t) => t.weakSignals < 2)) fail("qualityTier", "leaving the first tier needs at least two weak signals");
  if (typeof d.globalName !== "string") fail("qualityTier", "globalName must be text (empty for none)");
}
