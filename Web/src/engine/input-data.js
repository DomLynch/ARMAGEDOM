import { closed } from "./content-schema.js";
// visual.json `input` (input.js) and `touchTarget` (engine/touch-target.js). Called from validateVisual in game-data.js; both modules read their
// row through GAME_DATA.visual. Pixels, milliseconds, shares and tilt (1 is the stick at its full radius).
const fail = (why) => {
  throw TypeError(`Invalid game data visual: ${why}`);
};
const positive = (field, v) => {
  if (!Number.isFinite(v) || !(v > 0)) fail(`${field} must be a finite number above 0`);
};
export function validateInput(i) {
  closed(i, ["knobPadPx", "knobTravelShare", "stickRadiusPx", "runTilt", "aimStartPx", "doubleTapMs", "worldTapMaxMs", "worldTapSlopPx"]);
  for (const f of ["knobPadPx", "stickRadiusPx", "aimStartPx", "doubleTapMs", "worldTapMaxMs", "worldTapSlopPx"]) positive(`input.${f}`, i[f]);
  if (!(i.knobTravelShare > 0 && i.knobTravelShare <= 1)) fail("input.knobTravelShare must be above 0 and at most 1");
  if (!(Number.isFinite(i.runTilt) && i.runTilt > 1)) fail("input.runTilt must be a number above 1 (past full tilt)");
}
export function validateTouchTarget(t) {
  closed(t, ["paddingPx"]);
  if (!Number.isFinite(t.paddingPx) || t.paddingPx < 0) fail("touchTarget.paddingPx must be a finite number from 0");
}
