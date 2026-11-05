import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";
// damageFeedback.json validator: the floating damage numbers and the hurt vignette (engine/damage-feedback.js).
const FILE = "damageFeedback";
const checkShare = (field, v, min = 0) => {
  number(FILE, field, v, min);
  if (v > 1) fail(FILE, `${field} must be at most 1`);
};
const checkRgb = (field, v) => {
  if (!Array.isArray(v) || v.length !== 3) fail(FILE, `${field} must be [r, g, b]`);
  v.forEach((c, i) => count(FILE, `${field}[${i}]`, c, 0, 255));
};
export function validateDamageFeedback(d) {
  closed(d, ["schema_version", "numbers", "vignette"]);
  const n = d.numbers;
  closed(n, [
    "cap",
    "perTargetCap",
    "mergeSeconds",
    "lifeSeconds",
    "reducedLifeSeconds",
    "fadeSeconds",
    "alpha",
    "risePxPerSecond",
    "startLiftPx",
    "stackGapPx",
    "basePx",
    "sizeSteps",
    "sizeStepPx",
    "popSeconds",
    "popPx",
    "colourRamp",
    "critColour",
    "critScale",
    "critMultiple",
    "minimumShown",
  ]);
  count(FILE, "numbers.cap", n.cap, 1, 64);
  count(FILE, "numbers.perTargetCap", n.perTargetCap, 1, n.cap);
  count(FILE, "numbers.sizeSteps", n.sizeSteps, 1, 100);
  count(FILE, "numbers.minimumShown", n.minimumShown, 1, 99);
  for (const f of ["mergeSeconds", "lifeSeconds", "reducedLifeSeconds", "fadeSeconds", "popSeconds"])
    number(FILE, `numbers.${f}`, n[f], 0.01);
  for (const f of ["risePxPerSecond", "startLiftPx", "stackGapPx", "sizeStepPx", "popPx"])
    number(FILE, `numbers.${f}`, n[f], 0);
  number(FILE, "numbers.critMultiple", n.critMultiple, 1);
  checkShare("numbers.alpha", n.alpha, 0.01);
  closed(n.basePx, ["phone", "desktop"]);
  number(FILE, "numbers.basePx.phone", n.basePx.phone, 1);
  number(FILE, "numbers.basePx.desktop", n.basePx.desktop, 1);
  if (!Array.isArray(n.colourRamp) || n.colourRamp.length < 2)
    fail(FILE, "numbers.colourRamp needs at least two colours");
  n.colourRamp.forEach((c, i) => checkRgb(`numbers.colourRamp[${i}]`, c));
  checkRgb("numbers.critColour", n.critColour);
  closed(n.critScale, ["from", "peak", "end", "lifeShare", "peakShare"]);
  for (const f of ["from", "peak", "end"]) number(FILE, `numbers.critScale.${f}`, n.critScale[f], 0.01);
  checkShare("numbers.critScale.lifeShare", n.critScale.lifeShare, 0.01);
  checkShare("numbers.critScale.peakShare", n.critScale.peakShare, 0.01);
  closed(d.vignette, ["flash", "low"]);
  const flash = d.vignette.flash;
  closed(flash, ["rgb", "gain", "minCount", "hpLostDivisor", "scale", "maxAlpha", "decayCount", "reducedScale"]);
  checkRgb("vignette.flash.rgb", flash.rgb);
  for (const f of ["gain", "minCount", "hpLostDivisor", "scale", "decayCount"])
    number(FILE, `vignette.flash.${f}`, flash[f], 0.01);
  checkShare("vignette.flash.maxAlpha", flash.maxAlpha, 0.01);
  checkShare("vignette.flash.reducedScale", flash.reducedScale);
  const low = d.vignette.low;
  closed(low, ["hpShare", "dark", "light", "opacity", "staticMix", "cyclesGain", "cyclesFrom"]);
  checkShare("vignette.low.staticMix", low.staticMix);
  checkShare("vignette.low.hpShare", low.hpShare);
  checkRgb("vignette.low.dark", low.dark);
  checkRgb("vignette.low.light", low.light);
  checkShare("vignette.low.opacity", low.opacity);
  number(FILE, "vignette.low.cyclesGain", low.cyclesGain, 0);
  number(FILE, "vignette.low.cyclesFrom", low.cyclesFrom, 0);
  if (low.cyclesFrom < low.hpShare) fail(FILE, "vignette.low.cyclesFrom must not be below hpShare");
}
