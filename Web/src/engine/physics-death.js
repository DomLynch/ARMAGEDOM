// Pilot: ragdoll DEATH for the marked hunter, behind ?physics=1 (default OFF). The baked Death clip is the fallback for every failure:
// flag off, chunk not loaded yet, missing bone, a throw. Nothing here waits: a hunter that dies before the chunk is ready plays the clip.
import { GAME_DATA } from "./game-data.js";
import { cutsEnabled } from "./finisher-cuts.js";

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
export const physicsDeathLoaded = () => loading; // the chunk's load promise (null until preloaded): tests and tools await it
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
// The Pitborn's cut GLB (data/pitbornCuts.json, about 2 MB gzip) is fetched once, only when a marked hunter is first WOUNDED: never in the idle
// preload, never at area load, never for a player who does not fight one. A kill before it arrives is the plain ragdoll.
let cutsRequested = false;
function prefetchCuts(library) {
  if (cutsRequested || !impl || !cutsEnabled() || !library?.ensureModels) return;
  cutsRequested = true;
  impl.loadCutAssets(library).catch(() => {
    /* No cut GLB: every death stays the plain ragdoll. */
  });
}
// Per actor per frame, before the clip is sampled. True = the ragdoll owns the bones this frame; false = the baked clip plays.
export function physicsDeathStep(view, entity, library, dt, enabled = flag ?? physicsDeathEnabled()) {
  if (enabled && entity.markedHunter && entity.hp > 0 && entity.hp < entity.maxHP) prefetchCuts(library);
  if (!enabled || !entity.markedHunter || entity.hp > 0 || broken) return false;
  let s = view.physicsDeath;
  if (s?.failed) return false;
  try {
    if (!s) {
      const bindScene = library.models.get(CFG.rigRef)?.gltf.scene;
      if (!impl || !bindScene) return false; // chunk not loaded: baked clip, never wait
      s = view.physicsDeath = impl.startDeath(view, bindScene, entity);
    }
    impl.stepDeath(s, dt);
    return true;
  } catch {
    failDeath(view, view.physicsDeath); // the old handle, not the replacement: it still owns the body and the cut visuals
    return false;
  }
}
