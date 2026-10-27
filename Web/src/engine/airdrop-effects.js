import { lockerInventory } from "./locker-core.js";
import { LOCKER_RESOURCE_OWNER, LOCKER_RESOURCE_RULES } from "./locker-state.js";

// The airdrop's loot outcomes, as small adapters over the run state. The crate bundle names an outcome id (data/airdrop.json
// loot.bundle / loot.bonus); this file is the only place that knows how to apply one. The world pickups (medkit, ammo box, cash) are
// built on branch world/area-pickups: when that merges, point `medkit`, `ammoRefill` and `cash` below at its effect functions.
// The golden weapon system does not exist yet: register it with registerAirdropOutcome("golden-weapon", fn) and the crate starts
// granting it; until then the outcome is a no-op that reports false.

// Where each carried resource lives on the run (the same fields the safehouse locker reads in locker-core.js).
const RESOURCE_PATH = {
  "railgun-reserve": ["bossEquipment", "commanderPistol", "reserve"],
  "pistol-reserve": ["pistol", "reserve"],
  "rifle-reserve": ["rifle", "reserve"],
  "shotgun-reserve": ["bossEquipment", "shotgun", "reserve"],
  "rocket-reserve": ["bossEquipment", "rocketLauncher", "reserve"],
  "grenade-charges": ["bossEquipment", "grenade", "magazine"],
  "flame-fuel": ["flameFuel", "fuelUnits"],
};

/** Tops up the reserve of every weapon the player owns to its carry cap. Returns true when anything rose. */
export function ammoRefill(g) {
  const owned = lockerInventory(g).weapons;
  let changed = false;
  for (const [resource, path] of Object.entries(RESOURCE_PATH)) {
    if (!owned[LOCKER_RESOURCE_OWNER[resource]]?.owned) continue;
    const holder = path.slice(0, -1).reduce((node, key) => node?.[key], g),
      field = path[path.length - 1],
      cap = LOCKER_RESOURCE_RULES[resource].carryCap;
    if (!holder || !Number.isFinite(holder[field]) || holder[field] >= cap) continue;
    holder[field] = cap;
    changed = true;
  }
  return changed;
}

/** Heals the player by a share of max health. Returns true when health rose. */
export function medkit(g, { fraction }) {
  const p = g.player;
  if (!(p.hp > 0) || p.hp >= p.maxHP) return false;
  p.hp = Math.min(p.maxHP, p.hp + p.maxHP * fraction);
  return true;
}

/** Adds carried cash (the bank and the bounty are untouched), capped like a kill award. Returns the amount added. */
export function cash(g, { amount }) {
  const money = g.marked,
    max = g.world?.markedData?.maxMoney;
  if (!money || !Number.isSafeInteger(money.carried) || !Number.isFinite(max)) return 0;
  const added = Math.max(0, Math.min(max - money.bank - money.carried, amount));
  money.carried += added;
  return added;
}

const outcomes = new Map([
  ["ammo-refill", (g) => ammoRefill(g)],
  ["medkit", (g, row) => medkit(g, row)],
  ["cash", (g, row) => cash(g, row)],
]);

/** Hooks a loot outcome id to its effect: fn(g, row) returns a truthy value when it granted something. */
export function registerAirdropOutcome(id, fn) {
  outcomes.set(id, fn);
}

/** Applies one outcome. An id with no registered effect (the golden weapon, for now) does nothing and returns false. */
export function applyAirdropOutcome(g, row) {
  const effect = outcomes.get(row.id);
  return effect ? (effect(g, row) ?? false) : false;
}
