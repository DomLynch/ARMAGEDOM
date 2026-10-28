import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { addPickupGlow } from "../pickup-glow.js";
import { GAME_DATA } from "./game-data.js";
import { createDropMarker } from "./drop-marker.js";
import { WORLD_PICKUPS, placementsFor, stepWorldPickups, worldPickupState } from "./world-pickups-core.js";
// The small boxes lying in an area (data/worldPickups.json `models`): one instanced mesh per kind, so a whole area costs three draw
// calls and three thin contours (the same glow the other ground pickups wear). A taken pickup is scaled to nothing until it returns.
// A part may carry `rot` (radians: tilt about z, then x, then a turn about the vertical) and `wear` (how much its colour is scuffed:
// its faces are cut into a grid and each vertex is darkened by a hash of where it sits; the numbers are data/worldPickups.json `finish`).
const FINISH = WORLD_PICKUPS.finish;
const scuff = (x, y, z) => {
  const [a, b, c] = FINISH.hashSeed,
    t = Math.sin((Math.round(x * FINISH.hashScale) * a + Math.round(y * FINISH.hashScale) * b + Math.round(z * FINISH.hashScale) * c)) * FINISH.hashMultiplier;
  return t - Math.floor(t);
};
const cells = (length, wear) => (wear ? Math.min(FINISH.maxCells, Math.max(1, Math.ceil(length / FINISH.gridMetres))) : 1);
export function modelGeometry(THREE, parts, segments = WORLD_PICKUPS.cylinderSegments) {
  const pieces = parts.map((part) => {
    const [sx, sy, sz] = part.size,
      g =
        part.shape === "cylinder"
          ? new THREE.CylinderGeometry(sx, sx, sy, segments, cells(sy, part.wear))
          : new THREE.BoxGeometry(sx, sy, sz, cells(sx, part.wear), cells(sy, part.wear), cells(sz, part.wear));
    if (part.rot) {
      g.rotateZ(part.rot[2]);
      g.rotateX(part.rot[0]);
      g.rotateY(part.rot[1]);
    }
    g.translate(...part.pos);
    const colour = new THREE.Color(`#${part.color}`),
      stride = colour.toArray().length,
      colours = new Float32Array(g.attributes.position.count * stride),
      at = g.attributes.position,
      shade = new THREE.Color();
    for (let v = 0; v < at.count; v++) {
      shade.copy(colour).multiplyScalar(part.wear ? 1 - part.wear * FINISH.contrast * scuff(at.getX(v), at.getY(v), at.getZ(v)) : 1);
      shade.toArray(colours, v * stride);
    }
    g.setAttribute("color", new THREE.BufferAttribute(colours, stride));
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
  for (const type of Object.keys(WORLD_PICKUPS.models)) {
    const rows = list.filter((p) => p.type === type);
    if (!rows.length) continue;
    const look = WORLD_PICKUPS.look[type],
      scale = WORLD_PICKUPS.lookScale[look] ?? 1,
      geometry = modelGeometry(THREE, WORLD_PICKUPS.looks[type]?.[look] ?? WORLD_PICKUPS.models[type]).scale(scale, scale, scale),
      material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: WORLD_PICKUPS.roughness, metalness: WORLD_PICKUPS.metalness }),
      mesh = new THREE.InstancedMesh(geometry, material, rows.length);
    mesh.userData.pickupType = type;
    mesh.frustumCulled = false;
    group.add(mesh);
    parts.push({ rows, mesh, shown: rows.map(() => null), glow: WORLD_PICKUPS.contour[type] ? addPickupGlow(mesh) : null, geometry, material });
  }
  // A coloured ground ring and glow under every pickup, and its name once the player is within `labelDistance`. Each pickup has its own root
  // (the marker pulses its parent), apart from the instanced models.
  const MARKERS = WORLD_PICKUPS.markers,
    markers = list.map((row) => {
      const root = new THREE.Group(),
        look = MARKERS[row.type],
        marker = createDropMarker(look.label, { ...GAME_DATA.visual.dropMarker, ...MARKERS.style, ringColour: look.ringColour, labelColour: look.labelColour });
      root.position.set(row.x, 0, -row.z);
      root.add(marker.group);
      group.add(root);
      return { row, root, marker };
    });
  world.group.add(group);
  // The spot is "in view" while it projects inside the screen (plus the data's margin): a taken pickup waits for it to leave.
  // The camera is passed in each time: this stage's own camera is only a copy once the area has been entered.
  const inView = (place, camera) => {
    scratch.set(place.x, WORLD_PICKUPS.spotHeight, -place.z).project(camera);
    return Math.abs(scratch.x) <= margin && Math.abs(scratch.y) <= margin && scratch.z >= -1 && scratch.z <= 1;
  };
  function show(part, i, visible) {
    if (part.shown[i] === visible) return;
    part.shown[i] = visible;
    const row = part.rows[i];
    dummy.position.set(row.x, 0, -row.z);
    dummy.scale.setScalar(visible ? WORLD_PICKUPS.displayScale : 0);
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
      const at = g.player.pos;
      for (const { row, root, marker } of markers) {
        root.visible = until[row.id] === undefined;
        if (marker.sprite) marker.sprite.visible = Math.hypot(row.x - at.x, row.z - at.z) <= MARKERS.labelDistance;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const { marker } of markers) marker.dispose();
      for (const part of parts) {
        part.glow?.dispose();
        part.geometry.dispose();
        part.material.dispose();
        part.mesh.dispose();
      }
    },
  };
}
