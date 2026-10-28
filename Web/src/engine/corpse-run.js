import { GAME_DATA } from "./game-data.js";
import { webText } from "./web-text.js";
import { grantCash } from "./world-pickups-core.js";

// Corpse run (data/corpseRun.json): the cash a death takes out of the run waits in a body bag where the player fell, in that area.
// Walking over it puts the cash back; bosses of the area converge on it like an airdrop (engine/converge.js); after the scavenger
// timer it is gone. State is `g.corpseBag` and NOTHING of it is saved: the save record and the server never see the bag.
//
// Why this cannot duplicate or desync cash: the bag is created in the same commit that lowers the stored `marked.carried`
// (marked-core.js), with exactly the amount that commit removed, so cash is moved between the record and the bag, never copied.
// Taking it back adds it to `marked.carried` again WITHOUT a server claim (claimCash is for new money only), so the server's
// earned total is untouched and its enforce_cash clamp (carried + bank <= start + earned) still bounds everything. Reload, Retry,
// a new run or a scavenger all just lose the bag; none of them can restore money the record no longer holds.
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const toast = (g, text) => {
  g.message = text;
  g.messageUntil = g.time + GAME_DATA.corpseRun.bag.noticeSeconds;
};

// Called with the cash a death just removed from `marked.carried` and where the player fell. Returns the bag or null.
export function dropCorpseBag(g, lost, at) {
  const rules = GAME_DATA.corpseRun,
    cash = Math.floor(lost * rules.drop.cashShare);
  if (!rules.enabled || !(cash >= rules.drop.minCash) || !at?.areaId) return null;
  const old = rules.bag.mergeOnSecondDeath ? g.corpseBag : null,
    max = g.world?.markedData?.maxMoney ?? cash;
  g.corpseBag = {
    areaId: at.areaId,
    at: { x: at.x, z: at.z },
    cash: Math.min(max, cash + (old?.cash ?? 0)),
    stealableBy: rules.bag.stealableBy,
    expiresAt: g.time + rules.bag.scavengerSeconds,
    hud: "",
  };
  toast(g, webText("corpse.dropped", { cash: g.corpseBag.cash }));
  return g.corpseBag;
}

// Every step (any area): the scavenger timer, the hud line, and the pickup when the living player stands on the bag.
export function stepCorpseRun(g, dt) {
  const bag = g.corpseBag,
    rules = GAME_DATA.corpseRun;
  if (!bag) return;
  if (g.time >= bag.expiresAt) {
    g.corpseBag = null;
    toast(g, webText("corpse.lost"));
    return;
  }
  const here = g.world?.areaId === bag.areaId && g.player.hp > 0 && !g.finished,
    apart = here ? distance(g.player.pos, bag.at) : Infinity;
  bag.hud = here
    ? webText("corpse.hud", { distance: Math.round(apart), seconds: Math.ceil(bag.expiresAt - g.time) })
    : "";
  if (apart > rules.retrieve.radius) return;
  const taken = grantCash(g, bag.cash);
  if (taken <= 0) return;
  bag.cash -= taken;
  if (bag.cash > 0) return toast(g, webText("corpse.partial", { cash: taken }));
  g.corpseBag = null;
  toast(g, webText("corpse.retrieved", { cash: taken }));
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
