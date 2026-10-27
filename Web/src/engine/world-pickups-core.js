import { GAME_DATA, fillText } from "./game-data.js";
import { lockerInventory } from "./locker-core.js";
import { resourceOwner, LOCKER_RESOURCE_RULES } from "./locker-state.js";
// Ground pickups hidden in every area but the hub (data/worldPickups.json): a medkit, an ammo box and a cash stash. This module is the
// rules only: who may take one, what it gives, the toast, and when a taken one comes back. Nothing here is drawn or saved.
// The taken-pickup timers live on the run (`g.worldPickups`) in active game time, so leaving an area and coming back does not reset
// a pickup, and pausing or travelling does not run the clock.
export const WORLD_PICKUPS = GAME_DATA.worldPickups;
export const placementsFor = (areaId) => WORLD_PICKUPS.placements[areaId] ?? [];
// Where each carried resource sits on the run (the same fields lockerInventory reads), so a refill writes exactly what the locker reads.
function ammoHolder(g, resource) {
  const boss = g.bossEquipment;
  switch (resource) {
    case "pistol-reserve":
      return [g.pistol, "reserve"];
    case "rifle-reserve":
      return [g.rifle, "reserve"];
    case "flame-fuel":
      return [g.flameFuel, "fuelUnits"];
    case "shotgun-reserve":
      return [boss?.shotgun, "reserve"];
    case "rocket-reserve":
      return [boss?.rocketLauncher, "reserve"];
    case "grenade-charges":
      return [boss?.grenade, "magazine"];
    default:
      return [boss?.commanderPistol, "reserve"]; // railgun-reserve: the arc gun
  }
}
// Cash for a stash: a whole number of `step`s between `min` and `max`. It depends on which stash it is (its place in the placement
// list) and how many times it has been taken, so neighbours differ and a returning stash is not always the same sum.
export function stashCash(id, taken = 0, rules = WORLD_PICKUPS.items.cashStash) {
  const steps = (rules.max - rules.min) / rules.step + 1,
    ordinal = Object.values(WORLD_PICKUPS.placements).flat().findIndex((p) => p.id === id);
  return rules.min + rules.step * ((Math.max(0, ordinal) + taken) % steps);
}
export function worldPickupState(g) {
  return (g.worldPickups ??= { until: {}, taken: {}, notice: null, noticeUntil: 0 });
}
// Tops every owned weapon's reserve up to its carry cap. Returns how much was added (0 when everything was already full).
export function refillAmmo(g) {
  const owned = lockerInventory(g).weapons;
  let added = 0;
  for (const [resource, owner] of Object.entries(resourceOwner)) {
    if (!owned[owner]?.owned) continue;
    const [holder, field] = ammoHolder(g, resource);
    if (!holder || !Number.isFinite(holder[field])) continue;
    const cap = LOCKER_RESOURCE_RULES[resource].carryCap;
    if (holder[field] >= cap) continue;
    added += cap - holder[field];
    holder[field] = cap;
  }
  return added;
}
// Heals a fraction of max HP, never past max. Returns the HP granted (shared with the trap crate's loot).
export function healPlayer(player, fraction) {
  const hp = Math.max(0, Math.min(player.maxHP - player.hp, player.maxHP * fraction));
  player.hp += hp;
  return hp;
}
// What taking this pickup does to the run: { ok, amount } on success, { ok: false, reason } when it would be wasted.
export function applyPickup(g, placement, state) {
  const items = WORLD_PICKUPS.items;
  if (placement.type === "medkit") {
    const amount = Math.ceil(healPlayer(g.player, items.medkit.healFraction));
    return amount > 0 ? { ok: true, amount } : { ok: false, reason: "medkitFull" };
  }
  if (placement.type === "ammoBox") return refillAmmo(g) > 0 ? { ok: true, amount: 0 } : { ok: false, reason: "ammoBoxFull" };
  const amount = grantCash(g, stashCash(placement.id, state.taken[placement.id] ?? 0));
  return amount > 0 ? { ok: true, amount } : { ok: false, reason: "cashStashFull" };
}
// Adds carried cash, capped so carried + bank never passes the game's maximum. Returns the amount added (shared with the airdrop).
export function grantCash(g, wanted) {
  const money = g.marked,
    max = g.world?.markedData?.maxMoney;
  if (!money || !Number.isFinite(max) || money.carried + money.bank >= max) return 0;
  const amount = Math.min(wanted, max - money.carried - money.bank);
  money.carried += amount;
  return amount;
}
const say = (g, text, seconds) => {
  g.message = text;
  g.messageUntil = g.time + seconds;
};
// One step for the current area. `inView(placement, camera)` says whether the spot is on screen right now (a pickup only returns unseen).
export function stepWorldPickups(g, areaId, inView, camera) {
  const list = placementsFor(areaId);
  if (!list.length) return;
  const state = worldPickupState(g),
    p = g.player,
    can = p.hp > 0 && !g.finished;
  for (const place of list) {
    const due = state.until[place.id];
    if (due !== undefined) {
      if (g.time >= due && !inView(place, camera)) delete state.until[place.id];
      continue;
    }
    if (!can || Math.hypot(place.x - p.pos.x, place.z - p.pos.z) > WORLD_PICKUPS.pickupRadius) continue;
    const result = applyPickup(g, place, state);
    if (!result.ok) {
      const key = `${place.id}:${result.reason}`;
      if (state.notice === key && g.time < state.noticeUntil) continue;
      state.notice = key;
      state.noticeUntil = g.time + WORLD_PICKUPS.refusalRepeatSeconds;
      say(g, WORLD_PICKUPS.text[result.reason], WORLD_PICKUPS.noticeSeconds);
      continue;
    }
    state.until[place.id] = g.time + WORLD_PICKUPS.respawnSeconds;
    state.taken[place.id] = (state.taken[place.id] ?? 0) + 1;
    say(g, fillText(WORLD_PICKUPS.text[place.type], { amount: result.amount }), WORLD_PICKUPS.noticeSeconds);
  }
}
