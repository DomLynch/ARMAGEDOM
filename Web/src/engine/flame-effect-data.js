// visual.json `flameEffect` (engine/flame-effect.js): the pooled flame sprite's falloff texture, how the emitter puffs spread around the
// stream, and where the cosmetic burn on a victim sits. Called from validateVisual in game-data.js. Metres, seconds, shares.
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

// particles: the pooled mesh's sizes (engine/flame-data.js FLAME_VISUAL_DATA): puff counts, burn slots, widths in metres, palette as hex.
function validateFlameParticles(p) {
  closed(p, ["emitterCount", "reducedCount", "burnSlots", "burnPerVictim", "burnSeconds", "textureSize", "emitterWidth", "burnWidth", "burnAspect", "palette"]);
  count("visual", "flameEffect.particles.emitterCount", p.emitterCount, 1, 200);
  count("visual", "flameEffect.particles.reducedCount", p.reducedCount, 1, p.emitterCount);
  count("visual", "flameEffect.particles.burnSlots", p.burnSlots, 1, 50);
  count("visual", "flameEffect.particles.burnPerVictim", p.burnPerVictim, 1, 10);
  count("visual", "flameEffect.particles.textureSize", p.textureSize, 2, 512);
  number("visual", "flameEffect.particles.burnSeconds", p.burnSeconds, 0.01);
  number("visual", "flameEffect.particles.burnAspect", p.burnAspect, 0.1);
  for (const k of ["emitterWidth", "burnWidth"]) {
    if (!Array.isArray(p[k]) || p[k].length !== 2) fail("visual", `flameEffect.particles.${k} must be two numbers`);
    for (const v of p[k]) number("visual", `flameEffect.particles.${k}`, v, 0.01);
  }
  if (!Array.isArray(p.palette) || p.palette.length < 1 || p.palette.some((c) => !/^[0-9a-f]{6}$/.test(c)))
    fail("visual", "flameEffect.particles.palette must list six-digit lowercase hex colours");
  if (p.burnWidth.length < p.burnPerVictim) fail("visual", "flameEffect.particles.burnWidth needs a width per burn puff");
}

export function validateFlameEffect(f) {
  closed(f, [
    "texture",
    "alphaTest",
    "renderOrder",
    "cyclesPerSecond",
    "floorClearance",
    "spread",
    "phaseClamp",
    "corpseDeathFallbackSeconds",
    "burnSurface",
    "burnWisp",
    "particles",
  ]);
  validateFlameParticles(f.particles);
  closed(f.texture, ["falloffPower", "peakAlpha"]);
  number("visual", "flameEffect.texture.falloffPower", f.texture.falloffPower, 0.1);
  if (!(f.texture.peakAlpha >= 1 && f.texture.peakAlpha <= 255)) fail("visual", "flameEffect.texture.peakAlpha must be 1 to 255");
  if (!(f.alphaTest >= 0 && f.alphaTest < 1)) fail("visual", "flameEffect.alphaTest must be 0 up to 1");
  number("visual", "flameEffect.floorClearance", f.floorClearance, 0);
  number("visual", "flameEffect.cyclesPerSecond", f.cyclesPerSecond, 0.01);
  if (!Number.isInteger(f.renderOrder)) fail("visual", "flameEffect.renderOrder must be an integer");
  closed(f.spread, ["radiusShare", "jitterRate"]);
  for (const k of ["radiusShare", "jitterRate"]) number("visual", `flameEffect.spread.${k}`, f.spread[k], 0.01);
  const clamp = f.phaseClamp;
  if (!Array.isArray(clamp) || clamp.length !== 2 || !(clamp[0] > 0 && clamp[0] < clamp[1] && clamp[1] < 1))
    fail("visual", "flameEffect.phaseClamp must be [low, high] with 0 < low < high < 1");
  number("visual", "flameEffect.corpseDeathFallbackSeconds", f.corpseDeathFallbackSeconds, 0.1);
  closed(f.burnSurface, ["maxOffset", "defaultRadius", "margin"]);
  for (const k of ["maxOffset", "defaultRadius", "margin"]) number("visual", `flameEffect.burnSurface.${k}`, f.burnSurface[k], 0);
  closed(f.burnWisp, ["spacing", "baseHeight", "wobbleRate", "wobbleHeight"]);
  for (const k of ["spacing", "baseHeight", "wobbleRate", "wobbleHeight"]) number("visual", `flameEffect.burnWisp.${k}`, f.burnWisp[k], 0);
}
