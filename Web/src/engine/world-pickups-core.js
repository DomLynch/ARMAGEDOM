import { GAME_DATA, fillText } from "./game-data.js";
import { lockerInventory } from "./locker-core.js";
import { LOCKER_RESOURCE_OWNER, LOCKER_RESOURCE_RULES } from "./locker-state.js";
// Ground pickups hidden in every area but the hub (data/worldPickups.json): a medkit, an ammo box and a cash stash. This module is the
// rules only: who may take one, what it gives, the toast, and when a taken one comes back. Nothing here is drawn or saved.
// The taken-pickup timers live on the run (`g.worldPickups`) in active game time, so leaving an area and coming back does not reset
// a pickup, and pausing or travelling does not run the clock.
export const WORLD_PICKUPS = GAME_DATA.worldPickups;
export const placementsFor = (areaId) => WORLD_PICKUPS.placements[areaId] ?? [];
// Where each carried resource sits on the run (the same fields lockerInventory reads), so a refill writes exactly what the locker reads.
const AMMO_FIELDS = {
  "pistol-reserve": (g) => [g.pistol, "reserve"],
  "rifle-reserve": (g) => [g.rifle, "reserve"],
  "flame-fuel": (g) => [g.flameFuel, "fuelUnits"],
  "shotgun-reserve": (g) => [g.bossEquipment?.shotgun, "reserve"],
  "rocket-reserve": (g) => [g.bossEquipment?.rocketLauncher, "reserve"],
  "grenade-charges": (g) => [g.bossEquipment?.grenade, "magazine"],
  "railgun-reserve": (g) => [g.bossEquipment?.commanderPistol, "reserve"],
};
function hash(text) {
  let h = 2166136261; // tuning-ok: FNV-1a offset basis, a hash constant
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); // tuning-ok: FNV-1a prime
  return h >>> 0;
}
// Cash for the nth time this stash is taken: a whole number of `step`s between `min` and `max`, fixed by the stash's id.
export function stashCash(id, taken = 0, rules = WORLD_PICKUPS.items.cashStash) {
  const steps = (rules.max - rules.min) / rules.step + 1;
  return rules.min + rules.step * (hash(`${id}:${taken}`) % steps);
}
export function worldPickupState(g) {
  return (g.worldPickups ??= { until: {}, taken: {}, notice: null, noticeUntil: 0 });
}
// Tops every owned weapon's reserve up to its carry cap. Returns how much was added (0 when everything was already full).
function refill(g) {
  const owned = lockerInventory(g).weapons;
  let added = 0;
  for (const [resource, owner] of Object.entries(LOCKER_RESOURCE_OWNER)) {
    if (!owned[owner]?.owned) continue;
    const [holder, field] = AMMO_FIELDS[resource](g);
    if (!holder || !Number.isFinite(holder[field])) continue;
    const cap = LOCKER_RESOURCE_RULES[resource].carryCap;
    if (holder[field] >= cap) continue;
    added += cap - holder[field];
    holder[field] = cap;
  }
  return added;
}
// What taking this pickup does to the run: { ok, amount } on success, { ok: false, reason } when it would be wasted.
export function applyPickup(g, placement, state) {
  const items = WORLD_PICKUPS.items;
  if (placement.type === "medkit") {
    const p = g.player,
      amount = Math.min(p.maxHP - p.hp, Math.ceil(p.maxHP * items.medkit.healFraction));
    if (!(amount > 0)) return { ok: false, reason: "medkitFull" };
    p.hp += amount;
    return { ok: true, amount };
  }
  if (placement.type === "ammoBox") return refill(g) > 0 ? { ok: true, amount: 0 } : { ok: false, reason: "ammoBoxFull" };
  const money = g.marked,
    max = g.world?.markedData?.maxMoney;
  if (!money || !Number.isFinite(max) || money.carried + money.bank >= max) return { ok: false, reason: "cashStashFull" };
  const amount = Math.min(stashCash(placement.id, state.taken[placement.id] ?? 0), max - money.carried - money.bank);
  money.carried += amount;
  return { ok: true, amount };
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
