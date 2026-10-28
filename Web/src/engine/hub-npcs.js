// The named Central Hub NPCs (data/hubNpcs.json): presentation only. Each is a skinned body (106 rig, one idle clip) standing at a fixed
// ground spot of the hub. The idle is driven here: DonorMotion holds a standing human at idle phase 0, so every frame samples the Idle at
// (clock + the NPC's phaseSeconds) x idleRate over the clip length, which is what makes them breathe. They are not entities: no health,
// collision, targeting, trade, healing, quest or save state. A model that has not arrived (deferred, best effort) leaves the NPCs out; the next
// entry asks again.
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { GAME_DATA } from "./game-data.js";
import { DonorMotion } from "../donor-motion.js";

const DATA = GAME_DATA.hubNpcs;

// On unless the data switches it off or the URL carries the off switch (improvements ship default-on).
export const hubNpcsOn = (search = globalThis.location?.search ?? "") =>
  DATA.enabled && new URLSearchParams(search).get(DATA.offParam) !== DATA.offValue;
// The model names an area draws: all of them in the hub, none elsewhere. A row's ref is its manifest model id.
export const hubNpcRefs = (areaId) => (areaId === DATA.area && hubNpcsOn() ? DATA.npcs.map((n) => n.ref) : []);
// Where an NPC's Idle is at a clock time (0 to 1 of the loop), offset per NPC so they do not move together.
export const idlePhase = (phaseSeconds, clock, duration) =>
  THREE.MathUtils.euclideanModulo(((clock + phaseSeconds) * DATA.idleRate) / duration, 1);

// visualScale is the actors' own visual scale, so the NPCs stand the same size as the player and the residents.
export function createHubNpcs({ library, visualScale = DATA.scaleFallback }) {
  let built = null, // { world, root, views, clock }
    asked = null; // the world a download was last requested for (one request per entry)
  const pose = (view, clock) => view.motion.sample(view.idle, idlePhase(view.npc.phaseSeconds, clock, view.duration));
  const dispose = () => {
    for (const view of built?.views ?? []) view.motion.dispose();
    built?.root.removeFromParent();
    built = null;
  };
  function build(world) {
    const root = new THREE.Group(),
      views = [];
    root.name = "hub-npcs";
    for (const npc of DATA.npcs) {
      const source = library.models.get(npc.ref),
        description = source.description,
        model = clone(source.gltf.scene),
        holder = new THREE.Group();
      const ground = world.geometry.ground(npc.at);
      holder.position.copy(world.toRender(ground));
      holder.rotation.y = THREE.MathUtils.degToRad(npc.facingDegrees);
      holder.scale.setScalar(
        (world.layout.characterScale ?? GAME_DATA.areaRuntime.view.defaultCharacterScale) *
          (description.scale ?? DATA.scaleFallback) *
          visualScale,
      );
      holder.name = npc.ref;
      holder.add(model);
      model.position.y += description.groundOffset ?? 0;
      root.add(holder);
      const motion = new DonorMotion(holder, model, source.gltf.animations, description),
        idle = description.clips.idle,
        view = { npc, motion, idle, duration: source.gltf.animations.find((c) => c.name === idle).duration };
      pose(view, 0);
      views.push(view);
    }
    world.group.add(root);
    built = { world, root, views, clock: 0 };
  }
  return {
    // Called every frame with the current world: builds the NPCs when the hub is current and every model is in, removes them elsewhere.
    sync(world, dt) {
      const refs = hubNpcRefs(world?.areaId);
      if (!refs.length) return dispose();
      if (built && built.world !== world) dispose();
      if (built) {
        built.clock += dt;
        for (const view of built.views) pose(view, built.clock);
        return;
      }
      if (refs.every((ref) => library.models.has(ref))) return build(world);
      if (asked !== world) {
        asked = world;
        Promise.resolve(library.ensureModels?.(refs)).catch(() => {
          /* Best effort: the NPCs stay out until the next entry. */
        });
      }
    },
    dispose,
    // For tests: each NPC's motion and the idle clock.
    get views() {
      return built ? built.views.map((v) => ({ ref: v.npc.ref, motion: v.motion })) : [];
    },
    get clock() {
      return built?.clock ?? 0;
    },
    get shown() {
      return built !== null;
    },
  };
}
