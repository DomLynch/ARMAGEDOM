import { freeze } from "./content-schema.js";
import { GAME_DATA } from "./game-data.js";

// Family vocabulary is not a promise that every family is playable.
// The list lives in weapons.json "families".
export const WEAPON_FAMILY_IDS = GAME_DATA.weapons.families;
export const RIFLE_ITEM_ID = "bridge-warden-rifle-v1";
const key = (value) =>
  typeof value === "string" &&
  /^[a-z][a-z0-9-]{0,95}$/.test(value) &&
  !["constructor", "prototype", "__proto__"].includes(value);
const closed = (value, fields) =>
  !!value &&
  Object.getPrototypeOf(value) === Object.prototype &&
  Reflect.ownKeys(value).length === fields.length &&
  fields.every((name) => {
    const d = Object.getOwnPropertyDescriptor(value, name);
    return d && d.enumerable && "value" in d;
  });
const fields = [
  "itemId",
  "name",
  "family",
  "weaponKey",
  "damageType",
  "delivery",
  "guidance",
  "fireMode",
  "attachment",
  "modelRef",
  "finisherBinding",
  "rules",
  "source",
];
const ruleFields = ["capacity", "reserve", "damage", "range", "cadence", "reload", "pickupRadius"];
export function validateRangedWeaponCatalog(input) {
  const fail = () => {
    throw TypeError("Invalid ranged weapon catalogue");
  };
  if (!input || Object.getPrototypeOf(input) !== Object.prototype) fail();
  const entries = Reflect.ownKeys(input).map((id) => {
      const d = Object.getOwnPropertyDescriptor(input, id);
      if (typeof id !== "string" || !d?.enumerable || !("value" in d)) fail();
      return [id, d.value];
    }),
    weapons = new Set();
  if (!entries.length || entries.length > 16) fail();
  for (const [id, row] of entries) {
    const payloadFamily = ["shotguns", "grenades", "launchers"].includes(row.family),
      railgun = row.weaponKey === "railgun";
    if (
      !key(id) ||
      !closed(row, railgun ? [...fields, "automatic"] : payloadFamily ? [...fields, "payload"] : fields) ||
      row.itemId !== id ||
      typeof row.name !== "string" ||
      !row.name ||
      row.name.length > 80 ||
      !["pistols", "rifles", "shotguns", "grenades", "launchers"].includes(row.family) ||
      !key(row.weaponKey) ||
      (weapons.has(row.weaponKey) && row.family !== "pistols") ||
      row.damageType !== (["grenades", "launchers"].includes(row.family) ? "blast" : "bullet") ||
      row.delivery !== (["grenades", "launchers"].includes(row.family) ? "projectile" : "ray") ||
      row.guidance !== "none" ||
      !["held", "press"].includes(row.fireMode) ||
      !["model-root", "hand_r"].includes(row.attachment) ||
      (row.modelRef !== null && !key(row.modelRef)) ||
      !key(row.finisherBinding) ||
      !closed(row.rules, ruleFields)
    )
      fail();
    if (row.family === "pistols" && row.weaponKey !== "pistol") fail();
    if (
      railgun &&
      (row.family !== "rifles" ||
        row.fireMode !== "held" ||
        // automatic: the light machine gun's held fire. Spread is a cone in degrees, stagger is a brief flinch in seconds.
        !closed(row.automatic, [
          "spreadDegrees",
          "spreadStride",
          "staggerSeconds",
          "bossStaggerSeconds",
          "tracerColour",
          "tracerSeconds",
        ]) ||
        !Number.isFinite(row.automatic.spreadDegrees) ||
        row.automatic.spreadDegrees < 0 ||
        row.automatic.spreadDegrees > 20 ||
        !Number.isFinite(row.automatic.spreadStride) ||
        row.automatic.spreadStride <= 0 ||
        row.automatic.spreadStride >= 1 ||
        !Number.isFinite(row.automatic.staggerSeconds) ||
        row.automatic.staggerSeconds < 0 ||
        row.automatic.staggerSeconds >= row.rules.cadence ||
        !Number.isFinite(row.automatic.bossStaggerSeconds) ||
        row.automatic.bossStaggerSeconds < 0 ||
        row.automatic.bossStaggerSeconds > row.automatic.staggerSeconds ||
        !/^[0-9a-f]{6}$/.test(row.automatic.tracerColour) ||
        !Number.isFinite(row.automatic.tracerSeconds) ||
        row.automatic.tracerSeconds <= 0 ||
        row.automatic.tracerSeconds > 1)
    )
      fail();
    weapons.add(row.weaponKey);
    for (const [name, min, max, integer] of [
      ["capacity", 1, 64, true],
      ["reserve", 0, 512, true],
      ["damage", 1, 500, false],
      ["range", 1, 100, false],
      ["cadence", 0.1, 10, false],
      ["reload", 0.1, 10, false],
      ["pickupRadius", 0.2, 3, false],
    ]) {
      const value = row.rules[name],
        minimum = name === "reload" && row.family === "grenades" ? 0 : min;
      if (!Number.isFinite(value) || value < minimum || value > max || (integer && !Number.isSafeInteger(value)))
        fail();
    }
    if (
      row.family === "shotguns" &&
      (!closed(row.payload, ["pelletCount", "pelletDamage", "range", "spreadDegrees"]) ||
        row.payload.pelletCount !== 8 ||
        row.payload.pelletDamage !== 8 ||
        row.payload.range !== 6 ||
        row.payload.spreadDegrees !== 12)
    )
      fail();
    if (
      row.family === "grenades" &&
      (!closed(row.payload, ["itemId", "capacity", "maxRange", "fuseSeconds", "radius", "maxDamage"]) ||
        row.payload.itemId !== row.itemId ||
        row.payload.capacity !== 3 ||
        row.payload.maxRange !== 8 ||
        row.payload.fuseSeconds !== 1 ||
        row.payload.radius !== 3 ||
        row.payload.maxDamage !== 60 ||
        row.rules.reload !== 0 ||
        row.rules.reserve !== 0)
    )
      fail();
    if (
      row.family === "launchers" &&
      (id !== "borough-butchers-rocket-launcher-v1" ||
        row.weaponKey !== "rocket" ||
        row.rules.capacity !== 1 ||
        row.rules.reserve !== 3 ||
        row.rules.damage !== 80 ||
        row.rules.range !== 20 ||
        row.rules.cadence !== 0.8 ||
        row.rules.reload !== 3.2 ||
        row.rules.pickupRadius !== 1.3 ||
        !closed(row.payload, ["maxDamage", "radius", "maxRange", "speed"]) ||
        row.payload.maxDamage !== 80 ||
        row.payload.radius !== 3 ||
        row.payload.maxRange !== 20 ||
        row.payload.speed !== 14 ||
        !closed(row.source, ["placementKey", "areaId", "receiptId"]) ||
        row.source.placementKey !== "boss-butcher-v1" ||
        row.source.areaId !== "elephant-and-castle")
    )
      fail();
    if (row.source !== null) {
      const source = row.source;
      if (
        !closed(source, ["placementKey", "areaId", "receiptId"]) ||
        !key(source.placementKey) ||
        !key(source.areaId) ||
        source.receiptId !== source.placementKey + ":" + id
      )
        fail();
    }
  }
  return freeze(structuredClone(input));
}
// The catalogue values live in Web/src/data/weapons.json (read through game-data.js); this module still runs the full validator.
export const RANGED_WEAPON_CATALOG = validateRangedWeaponCatalog(GAME_DATA.weapons.ranged);
export const RIFLE_PROFILE = RANGED_WEAPON_CATALOG[RIFLE_ITEM_ID];

export const SHOTGUN_PROFILE = RANGED_WEAPON_CATALOG["south-stalker-shotgun-v1"];
export const ROCKET_PROFILE = RANGED_WEAPON_CATALOG["borough-butchers-rocket-launcher-v1"];
export const GRENADE_PROFILE = RANGED_WEAPON_CATALOG["standard-grenade-v1"];

export const MARSHAL_PISTOL_PROFILE = RANGED_WEAPON_CATALOG["borough-marshals-pistol-v1"];

// The shotgun and grenade blast cues live in weapons.json "audio".
export const WEAPON_AUDIO = GAME_DATA.weapons.audio;
