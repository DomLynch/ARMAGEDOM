import { GAME_DATA } from "./game-data.js";
import { webText } from "./web-text.js";
import { grantCash } from "./world-pickups-core.js";
import { carriedWeaponTiles } from "./weapon-tiles.js";

// Corpse run (data/corpseRun.json): what a death takes out of the run waits in a body bag where the player fell, in that area: the
// carried cash and the weapon in hand. Walking over it gives both back; bosses of the area converge on it like an airdrop
// (engine/converge.js); after the scavenger timer the cash is gone. State is `g.corpseBag`; NOTHING of it is saved.
//
// Cash: the bag is created in the same commit that lowers the stored `marked.carried` (marked-core.js), with exactly the amount that
// commit removed, so cash is moved between the record and the bag, never copied. Taking it back adds it to `marked.carried` WITHOUT a
// server claim (claimCash is for new money only), so the server's earned total is untouched and its enforce_cash clamp
// (carried + bank <= start + earned) still bounds everything. Reload, Retry, a new run or a scavenger only ever lose the bag.
//
// Weapon: the weapon is never removed from the save or from its owner (pistol, rifle, flame, boss equipment...). It is WITHHELD:
// `lockerStored` (locker-core.js), which every equip/fire/reload command and every weapon tile already asks, answers true for the
// bag's `gearId` while the bag holds it. So it cannot be used, and it cannot be duplicated, because there is only ever the one owned
// weapon. Lost to a reload: nothing. A reload clears the bag, so the weapon comes back with the saved run (the cash does not).
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

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

// Called with the cash a death (or Retry) just removed from `marked.carried`, the weapon in hand, and where the player fell.
// Returns the bag or null.
export function dropCorpseBag(g, lost, at, gear) {
  const rules = GAME_DATA.corpseRun,
    cash = Math.floor(lost * rules.drop.cashShare),
    takes = cash >= rules.drop.minCash;
  if (!rules.enabled || !at?.areaId || !(takes || gear)) return null;
  const old = rules.bag.mergeOnSecondDeath ? g.corpseBag : null,
    max = g.world?.markedData?.maxMoney ?? cash;
  g.corpseBag = {
    areaId: at.areaId,
    at: { x: at.x, z: at.z },
    cash: Math.min(max, (takes ? cash : 0) + (old?.cash ?? 0)),
    gearId: gear?.id ?? old?.gearId ?? null,
    gearName: gear?.name ?? old?.gearName ?? null,
    stealableBy: rules.bag.stealableBy,
    expiresAt: g.time + rules.bag.scavengerSeconds,
    hud: "",
  };
  toast(g, webText("corpse.dropped", { contents: contents(g.corpseBag.cash, g.corpseBag.gearName) }));
  return g.corpseBag;
}

// Every step (any area): the scavenger timer, the hud line, and the pickup when the living player stands on the bag.
export function stepCorpseRun(g, dt) {
  const bag = g.corpseBag,
    rules = GAME_DATA.corpseRun;
  if (!bag) return;
  if (g.time >= bag.expiresAt) {
    // The cash is gone. The weapon comes back to its owner ("release") or stays withheld until the next reload ("keep").
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
