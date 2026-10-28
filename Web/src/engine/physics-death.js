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
// Call once after the area is entered: warms the cut GLB at idle, so the first wounded hunter does not start a 2 MB fetch mid-fight.
export function prefetchCutsOnIdle(library, enabled = physicsDeathEnabled()) {
  if (!enabled || !cutsEnabled() || slowLink() || cutsRequested || !library?.ensureModels) return;
  const go = () => load().then(() => (broken ? undefined : prefetchCuts(library)));
  if (globalThis.requestIdleCallback) globalThis.requestIdleCallback(go, { timeout: CFG.cutPrefetch.idleMs });
  else setTimeout(go, CFG.cutPrefetch.idleMs);
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
      s = impl.startDeath(view, bindScene, entity);
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
