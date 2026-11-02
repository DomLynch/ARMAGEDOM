import { GAME_DATA } from "./game-data.js";
import { closed } from "./content-schema.js";
// Presentation numbers of the boss-equipment view (engine/boss-equipment-view.js) and of the pickup model fit (engine/pickup-model-view.js),
// from data/visual.json `bossEquipmentView` and `pickupModel`. They are checked when this module loads. Seconds and metres unless a name
// says otherwise; colours are 6-digit hex strings and opacities are 0 to 1.
const fail = (why) => {
  throw TypeError(`Invalid game data visual: ${why}`);
};
const number = (field, v, min) => {
  if (!Number.isFinite(v) || v < min) fail(`${field} must be a finite number >= ${min}`);
};
const hex = (field, v) => {
  if (typeof v !== "string" || !/^[0-9a-f]{6}$/.test(v)) fail(`${field} must be 6 lowercase hex digits`);
};
const opacity = (field, v) => {
  if (!(v > 0 && v <= 1)) fail(`${field} must be above 0 and at most 1`);
};
export function validatePickupModel(v) {
  closed(v, ["fitDiameter", "groundLift"]);
  number("pickupModel.fitDiameter", v.fitDiameter, 0.001);
  number("pickupModel.groundLift", v.groundLift, 0);
}
export function validateBossEquipmentView(v) {
  closed(v, ["loadFailureSeconds", "claimMessageSeconds", "grenade"]);
  number("bossEquipmentView.loadFailureSeconds", v.loadFailureSeconds, 0.001);
  number("bossEquipmentView.claimMessageSeconds", v.claimMessageSeconds, 0.001);
  const g = v.grenade;
  closed(g, ["startHeight", "landHeight", "arcHeight", "flightSeconds", "spinPi", "ring", "blast"]);
  for (const f of ["startHeight", "landHeight", "arcHeight", "spinPi"]) number(`grenade.${f}`, g[f], 0);
  number("grenade.flightSeconds", g.flightSeconds, 0.001);
  closed(g.ring, ["inner", "outer", "segments", "colour", "opacity", "height", "pulseBase", "pulseSwing", "pulseRate"]);
  number("grenade.ring.inner", g.ring.inner, 0.001);
  if (!(g.ring.outer > g.ring.inner)) fail("grenade.ring.outer must exceed inner");
  if (!Number.isSafeInteger(g.ring.segments) || g.ring.segments < 3 || g.ring.segments > 128) fail("grenade.ring.segments must be an integer from 3 to 128");
  hex("grenade.ring.colour", g.ring.colour);
  opacity("grenade.ring.opacity", g.ring.opacity);
  for (const f of ["height", "pulseBase", "pulseSwing", "pulseRate"]) number(`grenade.ring.${f}`, g.ring[f], 0);
  if (!(g.ring.pulseBase + g.ring.pulseSwing <= 1)) fail("grenade.ring pulseBase plus pulseSwing must be at most 1");
  closed(g.blast, ["seconds", "colour", "startScale", "growth", "opacity"]);
  number("grenade.blast.seconds", g.blast.seconds, 0.001);
  hex("grenade.blast.colour", g.blast.colour);
  number("grenade.blast.startScale", g.blast.startScale, 0);
  number("grenade.blast.growth", g.blast.growth, 0);
  opacity("grenade.blast.opacity", g.blast.opacity);
}
validatePickupModel(GAME_DATA.visual.pickupModel);
validateBossEquipmentView(GAME_DATA.visual.bossEquipmentView);
export const PICKUP_MODEL = GAME_DATA.visual.pickupModel;
export const BOSS_EQUIPMENT_VIEW = GAME_DATA.visual.bossEquipmentView;
