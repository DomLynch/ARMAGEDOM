// visual.json `flameEffect` (engine/flame-effect.js): the pooled flame sprite's falloff texture, how the emitter puffs spread around the
// stream, and where the cosmetic burn on a victim sits. Called from validateVisual in game-data.js. Metres, seconds, shares.
import { closed } from "./content-schema.js";
import { fail, number } from "./game-data-checks.js";

export function validateFlameEffect(f) {
  closed(f, ["texture", "alphaTest", "floorClearance", "spread", "phaseClamp", "corpseDeathFallbackSeconds", "burnSurface", "burnWisp"]);
  closed(f.texture, ["falloffPower", "peakAlpha"]);
  number("visual", "flameEffect.texture.falloffPower", f.texture.falloffPower, 0.1);
  if (!(f.texture.peakAlpha >= 1 && f.texture.peakAlpha <= 255)) fail("visual", "flameEffect.texture.peakAlpha must be 1 to 255");
  if (!(f.alphaTest >= 0 && f.alphaTest < 1)) fail("visual", "flameEffect.alphaTest must be 0 up to 1");
  number("visual", "flameEffect.floorClearance", f.floorClearance, 0);
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
