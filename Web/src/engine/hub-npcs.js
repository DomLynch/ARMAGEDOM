// The named Central Hub NPCs (data/hubNpcs.json): presentation only. Each is a skinned crowd-body model (106 rig, one idle clip) standing at
// a fixed ground spot of the hub. They are not entities: no health, collision, targeting, trade, healing, quest or save state.
// A model that has not arrived (deferred, best effort) just leaves the NPC out; the next entry asks again.
import * as THREE from "three";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { GAME_DATA } from "./game-data.js";

const DATA = GAME_DATA.hubNpcs;

// On unless the data switches it off or the URL carries the off switch (improvements ship default-on).
export const hubNpcsOn = (search = globalThis.location?.search ?? "") =>
  DATA.enabled && new URLSearchParams(search).get(DATA.offParam) !== DATA.offValue;
// The model names an area draws: all of them in the hub, none elsewhere.
export const hubNpcRefs = (areaId) => (areaId === DATA.area && hubNpcsOn() ? DATA.npcs.map((n) => n.ref) : []);

export function createHubNpcs({ library }) {
  let built = null, // { world, root, mixers }
    asked = null; // the world a download was last requested for (one request per entry)
  const dispose = () => {
    built?.root.removeFromParent();
    built = null;
  };
  function build(world) {
    const root = new THREE.Group(),
      mixers = [];
    root.name = "hub-npcs";
    for (const npc of DATA.npcs) {
      const source = library.models.get(npc.ref),
        description = source.description,
        model = clone(source.gltf.scene),
        holder = new THREE.Group();
      const ground = world.geometry.ground(npc.at);
      holder.position.copy(world.toRender(ground));
      holder.rotation.y = THREE.MathUtils.degToRad(npc.facingDegrees);
      holder.scale.setScalar((world.layout.characterScale ?? GAME_DATA.areaRuntime.view.defaultCharacterScale) * (description.scale ?? 1));
      holder.name = npc.ref;
      holder.add(model);
      model.position.y += description.groundOffset ?? 0;
      root.add(holder);
      const mixer = new THREE.AnimationMixer(model);
      mixer.clipAction(THREE.AnimationClip.findByName(source.gltf.animations, npc.idleClip)).play();
      mixer.update(npc.phaseSeconds);
      mixers.push(mixer);
    }
    world.group.add(root);
    built = { world, root, mixers };
  }
  return {
    // Called every frame with the current world: builds the NPCs when the hub is current and every model is in, removes them elsewhere.
    sync(world, dt) {
      const refs = hubNpcRefs(world?.areaId);
      if (!refs.length) return dispose();
      if (built && built.world !== world) dispose();
      if (built) {
        for (const mixer of built.mixers) mixer.update(dt);
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
    get shown() {
      return built !== null;
    },
  };
}
