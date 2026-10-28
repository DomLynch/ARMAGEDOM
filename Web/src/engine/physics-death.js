// Pilot: ragdoll DEATH for the marked hunter, behind ?physics=1 (default OFF). The baked Death clip is the fallback for every failure:
// flag off, chunk not loaded yet, missing bone, a throw. Nothing here waits: a hunter that dies before the chunk is ready plays the clip.
import { GAME_DATA } from "./game-data.js";
import { cutsEnabled } from "./finisher-cuts.js";
import { rigOf } from "./physics-rigs.js";

const CFG = GAME_DATA.physicsDeath;

let impl = null,
  loading = null,
  broken = false;
let flag = null; // read once: the off path allocates nothing per frame
// Default comes from the row (defaultOn); ?physics=0 (offValue) is the OFF switch, ?physics=1 (flagValue) forces ON.
const fromSearch = (search) => {
  const v = new URLSearchParams(search).get(CFG.flagParam);
  return v === CFG.offValue ? false : v === CFG.flagValue ? true : CFG.defaultOn;
};
export const physicsDeathEnabled = (search) =>
  search === undefined ? (flag ??= fromSearch(globalThis.location?.search ?? "")) : fromSearch(search);
const load = () =>
  (loading ??= import("./physics-death-impl.js")
    .then(async (m) => {
      await m.loadWorld();
      m.warm();
      impl = m;
      m.markChunkLoaded();
    })
    .catch(() => void (broken = true)));
export const usePhysicsDeathImpl = (module) => (impl = module); // tests hand in the chunk without loading the Jolt WASM world
// Call once after first paint: fetches the chunk on idle, only when the flag is on.
export function preloadPhysicsDeath(enabled = physicsDeathEnabled()) {
  if (!enabled) return;
  const go = () => void load();
  if (globalThis.requestIdleCallback) globalThis.requestIdleCallback(go, { timeout: CFG.preloadIdleMs });
  else setTimeout(go, CFG.preloadIdleMs);
}
// Call when an actor view is removed (despawn, travel): frees its ragdoll body and active entry at once instead of leaking it.
// `parked` (the area is parked, the actor lives on): only the body and pool slot go, exactly as the timed release does; the handle stays so the
// corpse is never re-ragdolled, and the cut visuals stay where the corpse lies.
export function releasePhysicsDeath(view, parked = false) {
  const s = view.physicsDeath;
  if (!s) return;
  if (!parked) view.physicsDeath = undefined;
  if (s.failed) return;
  if (!parked) impl?.disposeCuts(s); // the cut body and its pieces leave the scene with the actor
  impl?.releaseDeath(s);
}
// The ragdoll threw: free what it took (the cut visuals, the body, its pool slot), put the hunter's own body back, and let the baked clip play.
function failDeath(view, s) {
  try {
    if (s && !s.failed) {
      impl.disposeCuts(s); // also un-hides the hunter's own body
      impl.releaseDeath(s);
    }
  } catch {
    /* nothing more to free */
  }
  view.physicsDeath = { failed: true };
}
// The Pitborn's cut GLB (data/pitbornCuts.json, about 2 MB gzip) is fetched once per page: at idle after the area is entered (prefetchCutsOnIdle),
// or at the latest when a marked hunter is first WOUNDED. A kill before it arrives is the plain ragdoll.
let cutsRequested = false;
function prefetchCuts(library) {
  if (cutsRequested || !impl || !cutsEnabled() || !library?.ensureModels) return;
  cutsRequested = true;
  // Started from a microtask so a synchronous throw from ensureModels lands in the catch below, not in the caller.
  Promise.resolve()
    .then(() => impl.loadCutAssets(library))
    .catch(() => {
      /* No cut GLB: every death stays the plain ragdoll. */
    });
}
// Data saver or a slow link (data/physicsDeath.json cutPrefetch): the idle fetch is skipped; the wound-time fetch is unchanged.
const slowLink = () => {
  const c = globalThis.navigator?.connection,
    p = CFG.cutPrefetch;
  return !!c && ((p.skipSaveData && c.saveData === true) || p.slowTypes.includes(c.effectiveType));
};
// The game, read only to see how close a marked hunter is to the player (set once by the browser session).
let probe = null;
export const watchCutPrefetch = (getGame) => void (probe = getGame);
const hunterNear = (entity) => {
  const g = probe?.();
  return (
    !!g?.player &&
    (entity.areaId ?? g.world.areaId) === g.world.areaId &&
    Math.hypot(entity.pos.x - g.player.pos.x, entity.pos.z - g.player.pos.z) <= CFG.cutPrefetch.range
  );
};
// A marked hunter alive in the current area has come within cutPrefetch.range of the player: warm the cut GLB at idle (once), so its first wound
// does not start a 2 MB fetch mid-fight. Never at area entry, never for a player nobody hunts.
let cutsScheduled = false;
export function prefetchCutsOnIdle(library, enabled = physicsDeathEnabled()) {
  if (!enabled || !cutsEnabled() || slowLink() || cutsRequested || cutsScheduled || !library?.ensureModels) return;
  cutsScheduled = true;
  const go = () => load().then(() => (broken ? undefined : prefetchCuts(library)));
  if (globalThis.requestIdleCallback) globalThis.requestIdleCallback(go, { timeout: CFG.cutPrefetch.idleMs });
  else setTimeout(go, CFG.cutPrefetch.idleMs);
}
// Which models ragdoll is data (physicsRigs.json `models`, `live`). The record handed to the impl: the model, its bone map and its body row.
const names = new WeakMap(), // manifest description -> model name, found once per description
  baked = new WeakSet(); // views whose model has no live row: looked up once, then the clip plays every frame
function modelOf(view, entity, library) {
  if (entity.markedHunter) return CFG.rigRef;
  if (entity.remotePlayer) return CFG.remote.modelRef; // another player seen through presence (the reduced survivor mesh)
  const d = view.description;
  if (!d || !library?.models) return null;
  if (!names.has(d)) names.set(d, [...library.models].find(([, m]) => m.description === d)?.[0] ?? null);
  return names.get(d);
}
// Already dead when first drawn: a corpse restored from a save or a parked area, or a reloaded dead local player (no death response was recorded
// this session). It lies on its baked last frame and never falls again.
const arrivedDead = (view, entity) =>
  !!view.restoredCorpse ||
  (entity.id === GAME_DATA.physicsBudget.local_player_id && entity.kind < 0 && !entity.response);
// Per actor per frame, before the clip is sampled. True = the ragdoll owns the bones this frame; false = the baked clip plays.
export function physicsDeathStep(view, entity, library, dt, enabled = flag ?? physicsDeathEnabled()) {
  if (enabled && entity.markedHunter && entity.hp > 0 && !cutsRequested) {
    if (entity.hp < entity.maxHP) prefetchCuts(library);
    else if (!cutsScheduled && hunterNear(entity)) prefetchCutsOnIdle(library, true);
  }
  // Revived (the player's retry keeps no old corpse; a body that lives again): give the ragdoll back at once, the clip owns the bones again.
  if (entity.hp > 0 && view.physicsDeath) releasePhysicsDeath(view);
  if (!enabled || entity.hp > 0 || broken) return false;
  let s = view.physicsDeath;
  // A corpse restored from a save or a parked area was dead before it was drawn: it lies on its baked last frame and never falls again.
  if (s?.failed || (!s && (baked.has(view) || arrivedDead(view, entity)))) return false;
  try {
    if (!s) {
      const model = modelOf(view, entity, library),
        rig = model && rigOf(model);
      if (!rig) {
        baked.add(view); // no live row for this model: the clip, and no ragdoll is ever taken from the pool
        return false;
      }
      const bindScene = library.models.get(model)?.gltf.scene;
      if (!impl || !bindScene) return false; // chunk not loaded: baked clip, never wait
      s = impl.startDeath(view, bindScene, entity, rig);
      if (!s) {
        view.physicsDeath = { failed: true }; // over the simultaneous-ragdoll budget: this one dies on the baked clip
        return false;
      }
      view.physicsDeath = s;
    }
    impl.stepDeath(s, dt);
    return true;
  } catch {
    failDeath(view, view.physicsDeath); // the old handle, not the replacement: it still owns the body and the cut visuals
    return false;
  }
}
