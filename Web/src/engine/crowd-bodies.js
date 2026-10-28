// Which model dresses an actor, and the crowd appearance pool (data/crowdBodies.json).
// Appearance only: a crowd body changes how a plain resident human looks, never its rig, stats, rules or save record. The choice is a
// pure function of the area id and the resident's placement key, so a resident has the same body in every session and every rebuild.
import { GAME_DATA } from "./game-data.js";
import { hash as faceHash } from "../face-allocator.js";

const POOL = GAME_DATA.crowdBodies;
const CROWD = new Set(POOL.pool.map((row) => row.ref).filter((ref) => ref !== POOL.defaultRef));
const CROOKED = new Set(GAME_DATA.spawns.crookedResidents);
const HOLLOW_RIG = "hollow-scavenger";

// A number strictly between 0 and 1 for a text. The face allocator's FNV-1a hash, read through its low bits (`buckets`): keys that differ
// only in a trailing digit share their high bits, so the high bits would put every placed resident in the same slice of the weights.
const unit = (text) => ((faceHash(text) % POOL.buckets) + 1) / (POOL.buckets + 1);

// The crowd is on unless the data switches it off or the URL carries the off switch (improvements ship default-on).
export function crowdOn(search = globalThis.location?.search ?? "") {
  return POOL.enabled && new URLSearchParams(search).get(POOL.offParam) !== POOL.offValue;
}
export const isCrowdBody = (name) => CROWD.has(name);

const areaSets = new Map();
// The rows an area draws from: the default look (when active) plus up to maxBodiesPerArea downloadable bodies, drawn by weight.
function areaSet(areaId) {
  if (!areaSets.has(areaId)) {
    const active = POOL.pool.filter((row) => row.active && row.weight > 0);
    const chosen = new Set(
      active
        .filter((row) => row.ref !== POOL.defaultRef)
        .map((row) => ({ ref: row.ref, key: -Math.log(unit(`${POOL.seed}|${areaId}|${row.ref}`)) / row.weight }))
        .sort((a, b) => a.key - b.key || (a.ref < b.ref ? -1 : 1))
        .slice(0, POOL.maxBodiesPerArea)
        .map((row) => row.ref),
    );
    areaSets.set(
      areaId,
      active.filter((row) => row.ref === POOL.defaultRef || chosen.has(row.ref)),
    );
  }
  return areaSets.get(areaId);
}
// The body model name for a resident key in an area, or null for the existing scavenger look.
export function crowdBodyForKey(areaId, key) {
  if (!crowdOn() || POOL.excludedAreas.includes(areaId) || typeof key !== "string" || CROOKED.has(key)) return null;
  const rows = areaSet(areaId),
    total = rows.reduce((sum, row) => sum + row.weight, 0);
  let at = unit(`${POOL.seed}|${areaId}|${key}`) * total;
  for (const row of rows) {
    at -= row.weight;
    if (at < 0) return row.ref === POOL.defaultRef ? null : row.ref;
  }
  return null;
}
// Only a plain resident human takes a crowd body: not a marked hunter, a boss, an animal or drone, an explicit appearance or a gaunt recipe.
export function crowdBodyRef(entity, areaId) {
  return entity.kind >= 0 &&
    entity.rig === HOLLOW_RIG &&
    !entity.markedHunter &&
    !entity.bossProfile &&
    entity.appearanceRef === undefined &&
    !entity.humanBodyRecipe
    ? crowdBodyForKey(areaId, entity.placementKey)
    : null;
}
// Crowd body models a fresh area entry may need: the bodies its plain placed humans draw (the files are downloaded only for those).
export function crowdAreaRefs(world, areaId, fallbackRows = []) {
  const rows = world.residentPlacements?.[areaId] ?? fallbackRows;
  return [
    ...new Set(
      rows
        .filter(
          (row) => row.foundationRef === undefined && row.appearanceRef === undefined && row.recipeRef === undefined,
        )
        .map((row) => crowdBodyForKey(areaId, row.key))
        .filter((ref) => ref !== null),
    ),
  ];
}

// The model name for an entity. `loaded` (the library's model map) is given when the view is built: a hunter or crowd body whose
// file has not arrived yet is stood in for by the scavenger, and the model list for an area (no `loaded`) names the real one.
export function actorModelRef(entity, manifest, loaded, areaId) {
  if (entity.markedHunter && manifest.models?.["marked-hunter"] && (!loaded || loaded.has("marked-hunter")))
    return "marked-hunter";
  if (entity.appearanceRef !== undefined) {
    const ref = entity.appearanceRef;
    if (
      entity.kind < 0 ||
      typeof ref !== "string" ||
      !/^[a-z][a-z0-9-]*$/.test(ref) ||
      !manifest.models ||
      !Object.hasOwn(manifest.models, ref) ||
      manifest.models[ref].rig !== entity.rig
    )
      throw Error("Invalid actor appearance reference");
    return ref;
  }
  const crowd = crowdBodyRef(entity, areaId);
  if (crowd && manifest.models?.[crowd] && (!loaded || loaded.has(crowd))) return crowd;
  return entity.kind < 0 ? "vagrant" : manifest.pilot === "donor-knife" ? entity.rig : names[entity.kind];
}
const names = ["revenant", "orc", "warlock", "warlord"];

// The models an area's saved actors need that are deferred, named by the model rule above.
export function areaActorModelRefs(entities, manifest, areaId) {
  return entities
    .filter(
      (e) =>
        e.bossProfile ||
        e.appearanceRef !== undefined ||
        manifest.models[e.rig]?.deferred === true ||
        crowdBodyRef(e, areaId) !== null,
    )
    .map((e) => actorModelRef(e, manifest, undefined, areaId));
}
// The rig a view is dressed as: the body's own rig for the marked hunter and the crowd bodies, otherwise the entity's.
export function visualRigOf(entity, name, description) {
  return (entity.markedHunter && name === "marked-hunter") || CROWD.has(name) ? description.rig : entity.rig;
}
