import { GAME_DATA } from "./game-data.js";
import { closed } from "./content-schema.js";
// The rocket blast flash, the flame/rifle/unique-reward pickup and message numbers and the marked head-total hold (engine/rocket-view.js,
// engine/flame-view.js, engine/rifle-view.js, unique-reward-view.js, engine/marked-view.js), from
// data/visual.json `weaponViews`. They are checked when this module loads; the key name is checked by game-data.js. Metres and seconds;
// colours are 6-digit hex strings and opacities are 0 to 1.
const fail = (why) => {
  throw TypeError(`Invalid game data visual: weaponViews.${why}`);
};
const number = (field, v, min) => {
  if (!Number.isFinite(v) || v < min) fail(`${field} must be a finite number >= ${min}`);
};
const ensureSegments = (field, v) => {
  if (!Number.isSafeInteger(v) || v < 3 || v > 128) fail(`${field} must be an integer from 3 to 128`);
};
const hex = (field, v) => {
  if (typeof v !== "string" || !/^[0-9a-f]{6}$/.test(v)) fail(`${field} must be 6 lowercase hex digits`);
};
const opacity = (field, v) => {
  if (!(v > 0 && v <= 1)) fail(`${field} must be above 0 and at most 1`);
};
export function validateWeaponViews(v) {
  closed(v, ["rocket", "flame", "rifle", "uniqueReward", "marked"]);
  closed(v.rocket, ["blast"]);
  const b = v.rocket.blast;
  closed(b, [
    "seconds",
    "fallbackRadius",
    "ringInnerRatio",
    "ringSegments",
    "ringColour",
    "ringOpacity",
    "coreRadius",
    "coreWidthSegments",
    "coreHeightSegments",
    "coreColour",
    "coreOpacity",
    "coreHeight",
    "groundLift",
    "startScale",
    "growScale",
  ]);
  for (const f of ["seconds", "fallbackRadius", "coreRadius", "startScale", "growScale"])
    number(`rocket.blast.${f}`, b[f], 0.001);
  if (!(b.ringInnerRatio > 0 && b.ringInnerRatio < 1)) fail("rocket.blast.ringInnerRatio must be above 0 and below 1");
  ensureSegments("rocket.blast.ringSegments", b.ringSegments);
  ensureSegments("rocket.blast.coreWidthSegments", b.coreWidthSegments);
  ensureSegments("rocket.blast.coreHeightSegments", b.coreHeightSegments);
  hex("rocket.blast.ringColour", b.ringColour);
  hex("rocket.blast.coreColour", b.coreColour);
  opacity("rocket.blast.ringOpacity", b.ringOpacity);
  opacity("rocket.blast.coreOpacity", b.coreOpacity);
  number("rocket.blast.coreHeight", b.coreHeight, 0);
  number("rocket.blast.groundLift", b.groundLift, 0);
  const f = v.flame;
  closed(f, ["pickup", "ring", "messageSeconds"]);
  closed(f.pickup, ["fitSize", "lift"]);
  number("flame.pickup.fitSize", f.pickup.fitSize, 0.001);
  number("flame.pickup.lift", f.pickup.lift, 0);
  closed(f.ring, ["radius", "tube", "radialSegments", "tubularSegments", "colour", "lift"]);
  number("flame.ring.radius", f.ring.radius, 0.001);
  number("flame.ring.tube", f.ring.tube, 0.001);
  ensureSegments("flame.ring.radialSegments", f.ring.radialSegments);
  ensureSegments("flame.ring.tubularSegments", f.ring.tubularSegments);
  hex("flame.ring.colour", f.ring.colour);
  number("flame.ring.lift", f.ring.lift, 0);
  number("flame.messageSeconds", f.messageSeconds, 0.001);
  closed(v.rifle, ["pickup", "messageSeconds", "loadFailedSeconds"]);
  closed(v.uniqueReward, ["pickup", "messageSeconds", "loadFailedSeconds", "pickupReach"]);
  for (const name of ["rifle", "uniqueReward"]) {
    const row = v[name];
    closed(row.pickup, ["fitSize", "lift"]);
    number(`${name}.pickup.fitSize`, row.pickup.fitSize, 0.001);
    number(`${name}.pickup.lift`, row.pickup.lift, 0);
    number(`${name}.messageSeconds`, row.messageSeconds, 0.001);
    number(`${name}.loadFailedSeconds`, row.loadFailedSeconds, 0.001);
  }
  number("uniqueReward.pickupReach", v.uniqueReward.pickupReach, 0.001);
  closed(v.marked, ["headTotalSeconds"]);
  number("marked.headTotalSeconds", v.marked.headTotalSeconds, 0.001);
}
validateWeaponViews(GAME_DATA.visual.weaponViews);
export const WEAPON_VIEWS = GAME_DATA.visual.weaponViews;
