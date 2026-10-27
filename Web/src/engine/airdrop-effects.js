import { refillAmmo, healPlayer, grantCash } from "./world-pickups-core.js";

// The airdrop's loot outcomes (data/airdrop.json loot.bundle / loot.bonus name them by id). The medkit, ammo and cash effects are the
// world pickups' own (engine/world-pickups-core.js), so there is one effect path. The golden weapon registers itself with
// registerAirdropOutcome("golden-weapon", fn); until it does, that outcome does nothing and reports false.
const outcomes = new Map([
  ["ammo-refill", (g) => refillAmmo(g) > 0],
  ["medkit", (g, row) => healPlayer(g.player, row.fraction) > 0],
  ["cash", (g, row) => grantCash(g, row.amount)],
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
