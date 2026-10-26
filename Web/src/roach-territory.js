import { resolveResidentIntent } from "./creature-behaviour-intents.js";
import { rigText } from "./rig-capabilities.js";
import { GAME_DATA } from "./engine/game-data.js";
const nest = resolveResidentIntent("roach-nest-guard", { behaviourCapabilities: ["home", "lineOfSight"] });
const HOME_ARRIVED = GAME_DATA.creatures.roachTerritory.homeArrivedMetres; // metres from home at which a returning roach counts as home
const point = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
// Only one approved role/registered recipe; no actor writes, movement or timers.
export function resolveRoachNestGuard(e, { areaId, animalCycle } = {}) {
  if (
    animalCycle !== "B" ||
    areaId !== "east" ||
    e?.placementKey !== "east-roamer-2" ||
    e.animalRecipe !== "roach-nest-guard" ||
    rigText(e.rig, "species") !== "roach" ||
    (e.areaId ?? areaId) !== areaId ||
    !Number.isFinite(e.hp) ||
    e.hp <= 0 ||
    !point(e.home) ||
    !point(e.pos)
  )
    return null;
  return nest;
}
// Caller retains native swing/hurt/death and radius-aware World/crowd movement.
export function territoryHomeStep(p, o) {
  let alerted = o.alerted === true,
    returning = o.returning === true;
  const result = (action) => ({ alerted, returning, action });
  if (o.alive !== true || o.swingActive === true || o.hurt === true) return result("native");
  if (
    !Number.isFinite(o.playerHomeDistance) ||
    o.playerHomeDistance < 0 ||
    !Number.isFinite(o.homeDistance) ||
    o.homeDistance < 0
  )
    return result("hold");
  if (p.pursuitScope !== "area" && alerted && o.playerHomeDistance > p.homeLeash) {
    alerted = false;
    returning = true;
  }
  if (returning && o.homeDistance <= HOME_ARRIVED) returning = false;
  return result(returning ? (o.returnPathClear === false ? "hold" : "return") : "native");
}
