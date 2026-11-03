import { GAME_DATA } from "./game-data.js";
import { webText } from "./web-text.js";
import { grantCash } from "./world-pickups-core.js";
import { carriedWeaponTiles } from "./weapon-tiles.js";
import { lockerStored } from "./locker-core.js";
import { LOCKER_WEAPON_IDS } from "./locker-state.js";

// Corpse run (data/corpseRun.json): what a death takes out of the run waits in a body bag where the player fell, in that area: the
// carried cash and the weapon in hand. Walking over it gives both back; bosses of the area converge on it like an airdrop
// (engine/converge.js); after the scavenger timer the cash is gone. State is `g.corpseBag`, saved in the run record as `corpseBag`
// (marked-core.js) in the SAME write as the cash and the weapon it took, so no reload or crash can lose or duplicate any of them.
//
// Cash: the bag is created in the same commit that lowers the stored `marked.carried` (marked-core.js), with exactly the amount that
// commit removed, so cash is moved between the record and the bag, never copied. Taking it back adds it to `marked.carried` WITHOUT a
// server claim (claimCash is for new money only), so the server's earned total is untouched and its enforce_cash clamp
// (carried + bank <= start + earned) still bounds everything. A new run or a scavenger only ever lose the bag.
//
// Weapon: the weapon is never removed from the save or from its owner (pistol, rifle, flame, boss equipment...). It is WITHHELD:
// `lockerStored` (locker-core.js), which every equip/fire/reload command and every weapon tile already asks, answers true for the
// bag's `gearId` while the bag holds it. So it cannot be used, and it cannot be duplicated, because there is only ever the one owned
// weapon. The saved bag keeps withholding it after a reload until the bag is touched or the scavenger timer ends.
//
// Time: the scavenger countdown is play time. The record stores the seconds REMAINING (g.time restarts at 0 on every load), saved
// again whenever it has moved by `bag.saveEverySeconds` (isBagSaved below), so a refresh gives back at most that much time.
import { closed } from "./content-schema.js";
import { distance } from "./shared-checks.js";

const toast = (g, text) => {
  g.message = text;
  g.messageUntil = g.time + GAME_DATA.corpseRun.bag.noticeSeconds;
};

const contents = (cash, gearName) =>
  [cash > 0 ? webText("corpse.contentsCash", { cash }) : "", gearName ? webText("corpse.contentsGear", { gear: gearName }) : ""]
    .filter(Boolean)
    .join(webText("corpse.contentsJoin"));

// The weapon the player holds in the run `g` (a dead run, or the run being replaced by Retry), as { id, name }; null when the rules
// keep it (the knife, the cleaver, the Reaper companion), when the bag already holds one, or when gear is off.
export function gearOf(g) {
  const rules = GAME_DATA.corpseRun.gear;
  // A run that was loaded from a save and has not been played yet (time 0) never drops: a reload of a dead record must not
  // re-withhold the weapon the reload just returned.
  if (!rules.enabled || g.corpseBag?.gearId || !(g.time > 0)) return null;
  const held = carriedWeaponTiles(g).find((row) => row.active);
  return held && !rules.neverDrop.includes(held.id) ? { id: held.id, name: held.name } : null;
}

// A pistol the bag withholds is put away. combat.js steps the pistol from its own `equipped` flag (held fire, touch, mouse all end
// there) and stepGame runs this hook first every step, so no fire path can shoot a withheld pistol; the equip command is already
// refused by lockerStored. The bag, not this flag, owns the weapon: touching the bag frees it and the player equips it again.
function holdBackPistol(g) {
  if (!g.pistol?.equipped || !lockerStored(g, LOCKER_WEAPON_IDS[0])) return;
  g.pistol = { ...g.pistol, equipped: false, reloadingUntil: 0 };
  g.player.weapon = "knife";
}

// The bag a death makes, from the cash it removed from `marked.carried`, the weapon in hand and where the player fell, on the clock
// `time` (the run's own). Pure: nothing is stored. A second death merges into the bag still on the ground. Returns the bag or null.
export function makeCorpseBag(g, lost, at, gear, time = g.time) {
  const rules = GAME_DATA.corpseRun,
    cash = Math.floor(lost * rules.drop.cashShare),
    takes = cash >= rules.drop.minCash;
  if (!rules.enabled || !at?.areaId || !(takes || gear)) return null;
  const old = rules.bag.mergeOnSecondDeath ? g.corpseBag : null,
    max = g.world?.markedData?.maxMoney ?? cash;
  return {
    areaId: at.areaId,
    at: { x: at.x, z: at.z },
    cash: Math.min(max, (takes ? cash : 0) + (old?.cash ?? 0)),
    gearId: gear?.id ?? old?.gearId ?? null,
    gearName: gear?.name ?? old?.gearName ?? null,
    stealableBy: rules.bag.stealableBy,
    expiresAt: time + rules.bag.scavengerSeconds,
    hud: "",
  };
}

// Puts `bag` on the run (on the run's clock: `from` is the clock it was made on) and tells the player what it holds.
export function placeCorpseBag(g, bag, from = g.time) {
  g.corpseBag = { ...bag, at: { ...bag.at }, expiresAt: g.time + bag.expiresAt - from };
  toast(g, webText("corpse.dropped", { contents: contents(g.corpseBag.cash, g.corpseBag.gearName) }));
  return g.corpseBag;
}

// Called with the cash a death (or Retry) just removed from `marked.carried`, the weapon in hand, and where the player fell.
// Returns the bag or null.
export function dropCorpseBag(g, lost, at, gear) {
  const bag = makeCorpseBag(g, lost, at, gear);
  return bag ? placeCorpseBag(g, bag) : null;
}

// ---- The bag in the save record (`corpseBag`, absent when there is none) ----
// { areaId, position: {x, z}, cash, gearId, gearName, remaining }: `remaining` is the play seconds left (null once the cash is gone and the
// weapon stays withheld, expiresAt Infinity). The server's closed key list and caps are supabase/migrations/20261103000029.
export function savedCorpseBag(g) {
  const bag = g.corpseBag;
  if (!bag) return null;
  const left = bag.expiresAt - (g.time ?? 0);
  return {
    areaId: bag.areaId,
    position: { x: bag.at.x, z: bag.at.z },
    cash: bag.cash,
    gearId: bag.gearId,
    gearName: bag.gearName,
    // Clamped: expiresAt - time can land a rounding error above the full countdown, which the validator below would refuse.
    remaining: Number.isFinite(left) ? Math.min(GAME_DATA.corpseRun.bag.scavengerSeconds, Math.max(0, left)) : null,
  };
}

const text = (v) => typeof v === "string" && v.length > 0; // the server's default string length caps how long a saved id or name may be

export function validSavedCorpseBag(b, maxMoney) {
  try {
    closed(b, ["areaId", "position", "cash", "gearId", "gearName", "remaining"]);
    closed(b.position, ["x", "z"]);
    const seconds = GAME_DATA.corpseRun.bag.scavengerSeconds;
    return (
      text(b.areaId) &&
      Number.isFinite(b.position.x) &&
      Number.isFinite(b.position.z) &&
      Number.isSafeInteger(b.cash) &&
      b.cash >= 0 &&
      b.cash <= maxMoney &&
      (b.gearId === null ? b.gearName === null : text(b.gearId) && text(b.gearName)) &&
      (b.remaining === null ? b.cash === 0 && b.gearId !== null : Number.isFinite(b.remaining) && b.remaining >= 0 && b.remaining <= seconds) &&
      (b.cash > 0 || b.gearId !== null)
    );
  } catch {
    return false;
  }
}

// The live bag for a saved one, on the run's clock; null when its time ran out while it was away (the cash is gone and the weapon
// is released, as when the timer ends in play).
export function restoreCorpseBag(g, saved) {
  if (!saved || (saved.remaining !== null && saved.remaining <= 0)) return null;
  return {
    areaId: saved.areaId,
    at: { x: saved.position.x, z: saved.position.z },
    cash: saved.cash,
    gearId: saved.gearId,
    gearName: saved.gearName,
    stealableBy: GAME_DATA.corpseRun.bag.stealableBy,
    expiresAt: saved.remaining === null ? Infinity : (g.time ?? 0) + saved.remaining,
    hud: "",
  };
}

// Is the stored bag still good enough for the live one? Everything but the countdown must match exactly; the countdown may lag by
// `bag.saveEverySeconds` (the save then lags it by at most that, which is all a refresh can give back).
export function isBagSaved(live, stored) {
  if (!live || !stored) return !live && !stored;
  const { remaining: a, ...rest } = live,
    { remaining: b, ...kept } = stored;
  return (
    JSON.stringify(rest) === JSON.stringify(kept) &&
    (a === null || b === null ? a === b : Math.abs(b - a) < GAME_DATA.corpseRun.bag.saveEverySeconds)
  );
}

// Every step (any area): the scavenger timer, the hud line, and the pickup when the living player stands on the bag.
export function stepCorpseRun(g, dt) {
  const bag = g.corpseBag,
    rules = GAME_DATA.corpseRun;
  if (!bag) return;
  holdBackPistol(g);
  if (g.time >= bag.expiresAt) {
    // The cash is gone. The weapon comes back to its owner ("release") or stays withheld ("keep"):
    // the saved bag keeps it so, across reloads, with no cash in it.
    if (rules.gear.onScavenge === "keep" && bag.gearId) {
      Object.assign(bag, { cash: 0, expiresAt: Infinity, hud: "" });
      return toast(g, webText("corpse.lost", { contents: contents(0, bag.gearName) }));
    }
    g.corpseBag = null;
    return toast(g, webText("corpse.lost", { contents: contents(bag.cash, null) }));
  }
  const here = g.world?.areaId === bag.areaId && g.player.hp > 0 && !g.finished,
    apart = here ? distance(g.player.pos, bag.at) : Infinity;
  bag.hud = here
    ? webText("corpse.hud", { distance: Math.round(apart), seconds: Math.ceil(bag.expiresAt - g.time) })
    : "";
  if (apart > rules.retrieve.radius) return;
  const gearName = bag.gearName,
    taken = bag.cash > 0 ? grantCash(g, bag.cash) : 0;
  if (taken <= 0 && bag.cash > 0 && !bag.gearId) return; // full pockets and nothing else inside: the bag waits
  bag.cash -= taken;
  bag.gearId = bag.gearName = null; // the weapon is usable again the moment the bag is touched
  if (bag.cash > 0) return toast(g, webText("corpse.partial", { contents: contents(taken, gearName) }));
  g.corpseBag = null;
  toast(g, webText("corpse.retrieved", { contents: contents(taken, gearName) }));
}

// The convergence target for the bosses of the bag's area: the bag and the data row, or null.
export function corpseTarget(g) {
  const bag = g.corpseBag,
    pull = GAME_DATA.corpseRun.convergence;
  return pull.enabled && bag && g.world?.areaId === bag.areaId ? { at: bag.at, pull } : null;
}

// Where Retry puts the player: the safehouse area when the death was out in the field, the usual start when it was at home.
// Returns an area id. `areaId` is the area the player died in.
export function respawnArea(areaId, startArea) {
  const rules = GAME_DATA.corpseRun.respawn;
  return rules.enabled && !rules.homeAreas.includes(areaId) ? rules.safehouseAreaId : startArea;
}
