// Which model dresses an actor, and the crowd appearance pool (data/crowdBodies.json).
// Appearance only: a crowd body changes how a plain resident human looks, never its rig, stats, rules or save record. The choice is a
// pure function of the area id and the resident's placement key, so a resident has the same body in every session and every rebuild.
import { GAME_DATA } from "./game-data.js";
import { QUALITY } from "./quality-tier.js";
import { hash as faceHash } from "../face-allocator.js";
import { AREA_MOB_SPAWNS } from "../area-mob-spawns.js";

const POOL = GAME_DATA.crowdBodies;
// The MakeHuman bodies: pool rows that are not native looks (the existing scavenger and Pitborn keep their own rig, clips and finishers).
const CROWD = new Set(POOL.pool.filter((row) => !row.native).map((row) => row.ref));
const CROOKED = new Set(GAME_DATA.spawns.crookedResidents);
const HOLLOW_RIG = "hollow-scavenger";

// A number strictly between 0 and 1 for a text. The face allocator's FNV-1a hash, read through its low bits (`buckets`): keys that differ
// only in a trailing digit share their high bits, so the high bits would put every placed resident in the same slice of the weights.
const unit = (text) => ((faceHash(text) % POOL.buckets) + 1) / (POOL.buckets + 1);

// The crowd is on unless the data switches it off or the URL carries the off switch (improvements ship default-on).
const onBySearch = new Map(); // the address does not change in a page, and this is asked for every resident every frame
export function crowdOn(search = globalThis.location?.search ?? "") {
  if (!onBySearch.has(search))
    onBySearch.set(search, POOL.enabled && new URLSearchParams(search).get(POOL.offParam) !== POOL.offValue);
  return onBySearch.get(search);
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
        .slice(0, QUALITY.cap(POOL.maxBodiesPerArea, "crowdBodies"))
        .map((row) => row.ref),
    );
    areaSets.set(
      areaId,
      active.filter((row) => row.ref === POOL.defaultRef || chosen.has(row.ref)),
    );
  }
  return areaSets.get(areaId);
}
const looks = new Map();
// The pool model name for a resident key in an area, or null for the existing scavenger look.
export function crowdBodyForKey(areaId, key) {
  if (!crowdOn() || POOL.excludedAreas.includes(areaId) || typeof key !== "string" || CROOKED.has(key)) return null;
  const id = `${areaId}|${key}`;
  if (!looks.has(id)) {
    const rows = areaSet(areaId),
      total = rows.reduce((sum, row) => sum + row.weight, 0);
    let at = unit(`${POOL.seed}|${id}`) * total,
      look = null;
    for (const row of rows) {
      at -= row.weight;
      if (at < 0) {
        look = row.ref === POOL.defaultRef ? null : row.ref;
        break;
      }
    }
    looks.set(id, look);
  }
  return looks.get(id);
}
// Only a plain resident human takes a look from the pool: not a marked hunter, a boss, an animal or drone, an explicit appearance or a gaunt recipe.
function crowdLookRef(entity, areaId) {
  return entity.kind >= 0 &&
    entity.rig === HOLLOW_RIG &&
    !entity.markedHunter &&
    !entity.bossProfile &&
    entity.appearanceRef === undefined &&
    !entity.humanBodyRecipe
    ? crowdBodyForKey(areaId, entity.placementKey)
    : null;
}
// The MakeHuman body (a 106-rig model, not a native look) a resident wears, or null: these views take the body's own rig and have no finisher.
export function crowdBodyRef(entity, areaId) {
  const ref = crowdLookRef(entity, areaId);
  return CROWD.has(ref) ? ref : null;
}
// A placed row is a plain human when it is the scavenger foundation (or none) with no appearance of its own and no recipe but a plain one
// (the street scavenger of the area content). Animals, gaunt skulkers and explicit appearances are not.
const plainRow = (row) =>
  (row.foundationRef === undefined || row.foundationRef === HOLLOW_RIG) &&
  row.appearanceRef === undefined &&
  (row.recipeRef === undefined || POOL.plainRecipes.includes(row.recipeRef));
// The pool models (bodies and native looks other than the scavenger) the plain placed humans of an area draw.
export function crowdAreaRefs(world, areaId, fallbackRows = AREA_MOB_SPAWNS[areaId] ?? []) {
  const rows = world.residentPlacements?.[areaId] ?? fallbackRows;
  return [
    ...new Set(
      rows
        .filter(plainRow)
        .map((row) => crowdBodyForKey(areaId, row.key))
        .filter((ref) => ref !== null),
    ),
  ];
}
// A living plain human built before its pool model had arrived (so it stands in as the scavenger), calm and OFF SCREEN now: true when its view
// should be rebuilt with the model that has loaded since. Never while it fights (alert, swinging or reacting) and never while the player can see it
// (the offscreen throttle, data/offscreenActors.json marginMetres, hides a view that is outside the camera frustum plus margin), so nothing
// pops on screen: a resident the player is looking at keeps its look until it re-enters or respawns, when the cached body is used.
export function staleLook(entity, view, library, areaId) {
  if (entity.markedHunter)
    return entity.hp > 0 && view?.root.name !== actorModelRef(entity, library.manifest, library.models, areaId);
  if (!view || view.root.visible !== false || entity.hp <= 0 || entity.alerted || entity.swing || entity.response)
    return false;
  return (
    crowdLookRef(entity, areaId) !== null &&
    view.root.name !== actorModelRef(entity, library.manifest, library.models, areaId)
  );
}
// Fire and forget, never required: download the pool models an area's residents draw, once the browser is idle (at once outside a browser).
// Nothing waits on it: residents built before a file arrives keep the scavenger look, and the next spawn or entry uses the cached body. The
// returned promise always resolves (a failed file only leaves those residents as they are, and the next entry asks again), so a missing body
// can never fail boot, restore or an area entry.
export function ensureCrowdModels(library, world, areaId, entities = []) {
  const refs = [
    ...new Set([
      ...crowdAreaRefs(world, areaId),
      ...entities.map((e) => crowdLookRef(e, areaId)).filter((ref) => ref !== null),
    ]),
  ];
  if (refs.length === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const go = () => {
      try {
        Promise.resolve(library.ensureModels?.(refs))
          .catch(() => {
            /* Retried by the next area entry. */
          })
          .then(resolve);
      } catch {
        resolve();
      }
    };
    if (globalThis.requestIdleCallback) globalThis.requestIdleCallback(go, { timeout: POOL.idleMs });
    else setTimeout(go);
  });
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
  const crowd = crowdLookRef(entity, areaId);
  if (crowd && manifest.models?.[crowd] && (!loaded || loaded.has(crowd))) return crowd;
  return entity.kind < 0 ? "vagrant" : manifest.pilot === "donor-knife" ? entity.rig : names[entity.kind];
}
const names = ["revenant", "orc", "warlock", "warlord"];

// The models an area's saved actors REQUIRE that are deferred (bosses, explicit appearances, deferred foundations), named by the model rule
// above. Pool looks are not required: the array carries `crowd()`, which the caller runs once the entry has resolved to start the
// fire-and-forget download of the pool models the area's residents draw (ensureCrowdModels).
export function areaRequiredRefs(record, library, areaId, world) {
  const { manifest } = library,
    entities = [...(record.enemies ?? []), ...(record.corpses ?? [])];
  const refs = entities
    .filter((e) => e.bossProfile || e.appearanceRef !== undefined || manifest.models[e.rig]?.deferred === true)
    .map((e) => actorModelRef(e, manifest, undefined, areaId));
  return Object.assign(refs, { crowd: () => void ensureCrowdModels(library, world, areaId, entities) });
}
// The rig a view is dressed as: the body's own rig for the marked hunter and the crowd bodies, otherwise the entity's.
export function visualRigOf(entity, name, description) {
  return (entity.markedHunter && name === "marked-hunter") || CROWD.has(name) ? description.rig : entity.rig;
}
