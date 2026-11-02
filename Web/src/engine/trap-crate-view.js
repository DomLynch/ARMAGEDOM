import * as T from "three";
import { GAME_DATA } from "./game-data.js";
import { createExplosionEffects } from "./explosion-effect.js";
import { trapCrateList } from "./trap-crate.js";
// Draws the booby-trapped crates of the current area (data/trapCrates.json): the crate itself, a flashing red crate and a pulsing
// danger ring over the blast radius while the fuse burns, and the shared explosion effect when it goes off. All state is read from
// `g.trapCrates` (engine/trap-crate.js); this module owns only meshes. The explosion layers are built on the first blast.
const DATA = GAME_DATA.trapCrates,
  CUE = DATA.cue,
  RADIUS = GAME_DATA.weapons.ranged[DATA.blast.profile].payload.radius;
const hex = (v) => new T.Color(`#${v}`),
  FACING = new T.Vector3(0, 0, 1), // a flat ring is drawn facing +Z
  UP = new T.Vector3(0, 1, 0);
function partMesh(part) {
  // A cylinder part's size is [radius, height, unused]; a box part's is [width, height, depth].
  const [w, h, d] = part.size,
    geometry =
      part.shape === "cylinder" ? new T.CylinderGeometry(w, w, h, CUE.cylinderSides) : new T.BoxGeometry(w, h, d),
    material = new T.MeshStandardMaterial({
      color: hex(part.color),
      roughness: CUE.roughness,
      emissive: hex(CUE.flashColour),
      emissiveIntensity: 0,
    });
  const mesh = new T.Mesh(geometry, material);
  mesh.position.set(...part.pos);
  return mesh;
}
export function createTrapCrateView(s) {
  const rows = new Map();
  let areaId = null,
    explosions = null;
  function build(crate) {
    const root = new T.Group(),
      materials = [];
    for (const part of DATA.model) {
      const mesh = partMesh(part);
      materials.push(mesh.material);
      root.add(mesh);
    }
    const ring = new T.Mesh(
      new T.RingGeometry(RADIUS * CUE.ringInnerRatio, RADIUS, CUE.ringSegments),
      new T.MeshBasicMaterial({
        color: hex(CUE.ringColour),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: T.DoubleSide,
      }),
    );
    ring.quaternion.setFromUnitVectors(FACING, UP); // lays the ring flat on the ground
    ring.position.y = CUE.ringLift;
    ring.visible = false;
    const at = s.world.toRender({ x: crate.x, z: crate.z });
    root.position.copy(at);
    ring.position.add(at);
    s.scene.add(root, ring);
    return { root, ring, materials, blastSeen: 0 };
  }
  function dispose(row) {
    row.root.removeFromParent();
    row.ring.removeFromParent();
    for (const mesh of row.root.children) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    row.ring.geometry.dispose();
    row.ring.material.dispose();
  }
  function clear() {
    for (const row of rows.values()) dispose(row);
    rows.clear();
    explosions?.clear();
    areaId = null;
  }
  function flash(row, level) {
    for (const m of row.materials) m.emissiveIntensity = level;
  }
  return {
    update() {
      const g = s.game;
      if (!g || s.contextLost || s.traveling || !s.world) return;
      if (areaId !== s.world.areaId) {
        clear();
        areaId = s.world.areaId;
        for (const crate of trapCrateList(areaId))
          rows.set(crate.id, { crate, ...build(crate), blastSeen: g.trapCrates?.[crate.id]?.blastAt ?? 0 });
      }
      for (const [id, row] of rows) {
        const state = g.trapCrates?.[id],
          phase = state?.phase ?? "armed";
        row.root.visible = phase !== "spent";
        row.ring.visible = phase === "fusing";
        if (phase === "fusing") {
          const burned = Math.min(1, (g.time - state.openedAt) / DATA.fuseSeconds),
            hz = CUE.flashHzFrom + (CUE.flashHzTo - CUE.flashHzFrom) * burned,
            beat = Math.abs(Math.sin(Math.PI * hz * g.time)); // hz pulses a second, 0 to 1
          flash(row, beat);
          row.ring.material.opacity = CUE.ringOpacityFrom + (CUE.ringOpacityTo - CUE.ringOpacityFrom) * beat;
        } else flash(row, 0);
        if (state?.blastAt && state.blastAt !== row.blastSeen) {
          row.blastSeen = state.blastAt;
          explosions ??= createExplosionEffects(s);
          explosions.spawn(row.root.position, RADIUS, state.blastAt);
        }
      }
      explosions?.update(g.time);
    },
    dispose() {
      clear();
      explosions?.dispose();
      explosions = null;
    },
  };
}
