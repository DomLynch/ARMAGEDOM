import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { addPickupGlow } from "../pickup-glow.js";
import { WORLD_PICKUP_TYPES } from "./game-data-world-pickups.js";
import { WORLD_PICKUPS, placementsFor, stepWorldPickups, worldPickupState } from "./world-pickups-core.js";
// The small boxes lying in an area (data/worldPickups.json `models`): one instanced mesh per kind, so a whole area costs three draw
// calls and three thin contours (the same glow the other ground pickups wear). A taken pickup is scaled to nothing until it returns.
function modelGeometry(THREE, parts) {
  const pieces = parts.map((part) => {
    const g =
      part.shape === "cylinder"
        ? new THREE.CylinderGeometry(part.size[0], part.size[0], part.size[1], 12) // tuning-ok: a round tin needs a dozen sides
        : new THREE.BoxGeometry(...part.size);
    g.translate(...part.pos);
    const colour = new THREE.Color(`#${part.color}`),
      colours = new Float32Array(g.attributes.position.count * 3); // tuning-ok: r, g, b per vertex
    for (let i = 0; i < colours.length; i += 3) colour.toArray(colours, i); // tuning-ok: r, g, b per vertex
    g.setAttribute("color", new THREE.BufferAttribute(colours, 3)); // tuning-ok: r, g, b per vertex
    return g;
  });
  const merged = mergeGeometries(pieces);
  for (const g of pieces) g.dispose();
  return merged;
}
export function createWorldPickups(world) {
  const { THREE } = world,
    list = placementsFor(world.areaId),
    group = new THREE.Group(),
    parts = [],
    scratch = new THREE.Vector3(),
    margin = 1 + WORLD_PICKUPS.offscreenMargin,
    dummy = new THREE.Object3D();
  group.name = "World pickups"; // text-ok: internal mesh name
  for (const type of WORLD_PICKUP_TYPES) {
    const rows = list.filter((p) => p.type === type);
    if (!rows.length) continue;
    const geometry = modelGeometry(THREE, WORLD_PICKUPS.models[type]),
      material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1 }),
      mesh = new THREE.InstancedMesh(geometry, material, rows.length);
    mesh.name = `World pickup ${type}`; // text-ok: internal mesh name
    mesh.frustumCulled = false;
    group.add(mesh);
    parts.push({ rows, mesh, shown: rows.map(() => null), glow: addPickupGlow(mesh), geometry, material });
  }
  world.group.add(group);
  // The spot is "in view" while it projects inside the screen (plus the data's margin): a taken pickup waits for it to leave.
  // The camera is passed in each time: this stage's own camera is only a copy once the area has been entered.
  const inView = (place, camera) => {
    scratch.set(place.x, 0.2, -place.z).project(camera); // tuning-ok: a pickup's height above the ground, for the screen test
    return Math.abs(scratch.x) <= margin && Math.abs(scratch.y) <= margin && scratch.z >= -1 && scratch.z <= 1;
  };
  function show(part, i, visible) {
    if (part.shown[i] === visible) return;
    part.shown[i] = visible;
    const row = part.rows[i];
    dummy.position.set(row.x, 0, -row.z);
    dummy.scale.setScalar(visible ? 1 : 0);
    dummy.updateMatrix();
    part.mesh.setMatrixAt(i, dummy.matrix);
    part.mesh.instanceMatrix.needsUpdate = true;
  }
  let disposed = false;
  return {
    group,
    inView,
    // In the fixed step: take a pickup the player stands on, and bring back one that is due and unseen.
    collect(g, camera) {
      stepWorldPickups(g, world.areaId, inView, camera);
    },
    // Once a frame: draw each pickup that is not taken.
    sync(g) {
      const until = worldPickupState(g).until;
      for (const part of parts) for (let i = 0; i < part.rows.length; i++) show(part, i, until[part.rows[i].id] === undefined);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const part of parts) {
        part.glow.dispose();
        part.geometry.dispose();
        part.material.dispose();
        part.mesh.dispose();
      }
    },
  };
}
