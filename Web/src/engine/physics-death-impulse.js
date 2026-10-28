// Which shove a ragdoll death gets: the killing hit's weapon, and attack class pick one row of physicsDeath.json `bulletImpulse`
// (a pistol round pushes the body back with a little lift, a shotgun launches it, a blast throws it from the blast centre, a knife barely
// moves it). Pure data lookups with no physics import, so the actor code can record the hit and tests can read the rows. ?bulletimpulse=0
// (the row's offValue) restores the single fixed `killImpulse`.
import { GAME_DATA } from "./game-data.js";

const CFG = GAME_DATA.physicsDeath,
  BI = CFG.bulletImpulse;

const fromSearch = (search) => {
  const v = new URLSearchParams(search).get(BI.flagParam);
  return v === BI.offValue ? false : v === BI.onValue ? true : BI.defaultOn;
};
let flag = null; // read once: the off path allocates nothing per kill
export const bulletImpulseEnabled = (search) =>
  search === undefined ? (flag ??= fromSearch(globalThis.location?.search ?? "")) : fromSearch(search);

// The killing hit as the actor code records it on the dying entity (`entity.deathImpact`). `hit` is the game's "hit" event.
export const deathImpactOf = (hit) => ({
  x: hit.impactDirection?.x ?? 0,
  z: hit.impactDirection?.z ?? 0,
  weapon: hit.weapon,
  attackClass: hit.attackClass,
});

// One row { horizontal, up, part }: weapon first, then attack class, then the fixed default.
export function impulseRow(impact, enabled = bulletImpulseEnabled()) {
  const base = CFG.killImpulse,
    row = enabled && impact ? (BI.byWeapon[impact.weapon] ?? BI.byAttackClass[impact.attackClass] ?? base) : base;
  return { horizontal: row.horizontal, up: row.up, part: row.part ?? base.part };
}
