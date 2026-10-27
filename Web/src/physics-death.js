// Pilot: ragdoll DEATH for the marked hunter, behind ?physics=1 (default OFF). The baked Death clip is the fallback for every failure:
// flag off, chunk not loaded yet, missing bone, a throw. Nothing here waits: a hunter that dies before the chunk is ready plays the clip.
import { GAME_DATA } from "./engine/game-data.js";

const CFG = GAME_DATA.physicsDeath;

let impl = null,
  loading = null,
  broken = false;
let flag = null; // read once: the off path allocates nothing per frame
export const physicsDeathEnabled = (search) =>
  search === undefined
    ? (flag ??= new URLSearchParams(globalThis.location?.search ?? "").get(CFG.flagParam) === CFG.flagValue)
    : new URLSearchParams(search).get(CFG.flagParam) === CFG.flagValue;
const load = () =>
  (loading ??= import("./physics-death-impl.js")
    .then(async (m) => {
      await m.loadWorld();
      impl = m;
    })
    .catch(() => void (broken = true)));
// Call once after first paint: fetches the chunk on idle, only when the flag is on.
export function preloadPhysicsDeath(enabled = physicsDeathEnabled()) {
  if (!enabled) return;
  const go = () => void load();
  if (globalThis.requestIdleCallback) globalThis.requestIdleCallback(go, { timeout: CFG.preloadIdleMs });
  else setTimeout(go, CFG.preloadIdleMs);
}
// Per actor per frame, before the clip is sampled. True = the ragdoll owns the bones this frame; false = the baked clip plays.
export function physicsDeathStep(view, entity, library, dt, enabled = flag ?? physicsDeathEnabled()) {
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
    view.physicsDeath = { failed: true };
    return false;
  }
}
