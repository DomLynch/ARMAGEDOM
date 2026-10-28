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
// Which models ragdoll is data (physicsRigs.json `models`, `live`). The record handed to the impl: the model, its bone map and its body row.
const RIGS = GAME_DATA.physicsRigs,
  names = new WeakMap(), // manifest description -> model name, found once per description
  baked = new WeakSet(); // views whose model has no live row: looked up once, then the clip plays every frame
function modelOf(view, entity, library) {
  if (entity.markedHunter) return CFG.rigRef;
  const d = view.description;
  if (!d || !library?.models) return null;
  if (!names.has(d)) names.set(d, [...library.models].find(([, m]) => m.description === d)?.[0] ?? null);
  return names.get(d);
}
function liveRow(model) {
  const m = RIGS.models[model];
  if (!m?.live) return null;
  const family = RIGS.rigs[m.rig];
  return {
    model,
    nodePrefix: family.nodePrefix,
    parts: family.parts === "physicsDeath.parts" ? CFG.parts : family.parts,
    body: m.body === "physicsBody" ? GAME_DATA.physicsBody.row : RIGS.bodies[m.body],
  };
}
// Per actor per frame, before the clip is sampled. True = the ragdoll owns the bones this frame; false = the baked clip plays.
export function physicsDeathStep(view, entity, library, dt, enabled = flag ?? physicsDeathEnabled()) {
  if (enabled && entity.markedHunter && entity.hp > 0 && entity.hp < entity.maxHP) prefetchCuts(library);
  if (!enabled || entity.hp > 0 || broken) return false;
  let s = view.physicsDeath;
  if (s?.failed || (!s && baked.has(view))) return false;
  try {
    if (!s) {
      const model = modelOf(view, entity, library),
        rig = model && liveRow(model);
      if (!rig) {
        baked.add(view); // no live row for this model: the clip, and no ragdoll is ever taken from the pool
        return false;
      }
      const bindScene = library.models.get(model)?.gltf.scene;
      if (!impl || !bindScene) return false; // chunk not loaded: baked clip, never wait
      s = view.physicsDeath = impl.startDeath(view, bindScene, entity, rig);
    }
    impl.stepDeath(s, dt);
    return true;
  } catch {
    failDeath(view, view.physicsDeath); // the old handle, not the replacement: it still owns the body and the cut visuals
    return false;
  }
}
