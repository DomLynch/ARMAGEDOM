import { DRONE_RULES, droneHoverHeight } from "./drone-mechanics.js";
import { GAME_DATA } from "./engine/game-data.js";
import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
// One original shared foundation; metres/render-space. Presentation owns no damage,
// AI/pathfinding, reward, save, projectile or actor-scale authority.
export const DRONE_VISUAL_SCALE = 2;
// The row's values live in data/appearance.json `droneSupport`; this adds the hover height and radius from creatures.json.
const SUPPORT = GAME_DATA.appearance.droneSupport;
export const DRONE_SUPPORT = Object.freeze({
  id: SUPPORT.id,
  procedural: true,
  rig: null,
  clips: [],
  states: SUPPORT.states,
  hoverHeight: DRONE_RULES.hoverHeight,
  bodyBand: Object.freeze(SUPPORT.bodyBandOffsets.map((offset) => DRONE_RULES.hoverHeight + offset * DRONE_VISUAL_SCALE)),
  movementRadius: DRONE_RULES.radius,
  attackWarningSeconds: SUPPORT.attackWarningSeconds,
  deathSeconds: SUPPORT.deathSeconds,
  finisher: SUPPORT.finisher,
  melee: SUPPORT.melee,
});
// Commander art profile only. Keep the watcher default and gameplay support unchanged.
export const HUMAN_SILVER_DRONE_APPEARANCE = "human-brushed-silver";
export const COMMANDER_DRONE_APPEARANCE = "commander-compact-black";
export const COMMANDER_DRONE_VISUAL_SCALE = DRONE_VISUAL_SCALE * 0.7;
function commanderHull(silver = false) {
  const outline = [
      [-0.11, -0.23],
      [0.11, -0.23],
      [0.15, -0.16],
      [0.15, 0.13],
      [0.11, 0.2],
      [-0.11, 0.2],
      [-0.15, 0.13],
      [-0.15, -0.16],
    ],
    rings = [
      { y: -0.04, k: 0.92 },
      { y: 0.035, k: 1 },
      { y: 0.105, k: 0.82 },
    ],
    positions = [],
    colors = [];
  function triangle(a, b, c, color) {
    const shade = new T.Color(color);
    for (const p of [a, b, c]) {
      positions.push(...p);
      colors.push(shade.r, shade.g, shade.b);
    }
  }
  const point = (ring, i) => [outline[i][0] * ring.k, ring.y, outline[i][1] * ring.k];
  for (let band = 0; band < 2; band++)
    for (let i = 0; i < 8; i++) {
      const next = (i + 1) % 8,
        lo = point(rings[band], i),
        ln = point(rings[band], next),
        hi = point(rings[band + 1], i),
        hn = point(rings[band + 1], next),
        color = silver ? (band ? 0x929ca5 : 0x3c4650) : band ? 0x2b3036 : 0x20252a;
      triangle(lo, hi, hn, color);
      triangle(lo, hn, ln, color);
    }
  for (let i = 0; i < 8; i++) {
    const next = (i + 1) % 8;
    triangle([0, rings[0].y, 0], point(rings[0], i), point(rings[0], next), silver ? 0x252d35 : 0x15191d);
    triangle([0, rings[2].y, 0], point(rings[2], next), point(rings[2], i), silver ? 0xb0b8bf : 0x292e34);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new T.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(new Float32Array((positions.length / 3) * 2), 2));
  geometry.setIndex(Array.from({ length: positions.length / 3 }, (_, i) => i));
  geometry.computeVertexNormals();
  return geometry;
}
function addCommanderFrame(add, silver = false) {
  add(commanderHull(silver), null);
  for (const x of [-0.28, 0.28])
    for (const z of [-0.18, 0.18]) {
      add(
        new T.BoxGeometry(0.36, 0.035, 0.045),
        silver ? 0x7d8993 : 0x1d2227,
        x * 0.52,
        0,
        z * 0.5,
        0,
        Math.atan2(-z, x),
        0,
      );
      add(new T.CylinderGeometry(0.043, 0.043, 0.075, 8), silver ? 0x343d45 : 0x15191d, x, 0.04, z);
      add(new T.CylinderGeometry(0.043, 0.043, 0.018, 8), silver ? 0xc7cfd5 : 0xa2a8ad, x, 0.0865, z);
      add(new T.CylinderGeometry(0.024, 0.024, 0.14, 6), silver ? 0x252d35 : 0x171b1f, x, -0.065, z);
    }
  add(new T.BoxGeometry(0.11, 0.075, 0.07), silver ? 0x20272e : 0x11161b, 0, -0.045, 0.19);
  add(new T.BoxGeometry(0.085, 0.05, 0.012), silver ? 0x65717c : 0x657079, 0, -0.045, 0.228);
}
export function createLowHoverDroneLibrary({ appearance = "watcher" } = {}) {
  if (!["watcher", COMMANDER_DRONE_APPEARANCE, HUMAN_SILVER_DRONE_APPEARANCE].includes(appearance))
    throw Error("Unknown drone appearance");
  const commander = appearance === COMMANDER_DRONE_APPEARANCE,
    silver = appearance === HUMAN_SILVER_DRONE_APPEARANCE,
    compact = commander || silver,
    visualScale = commander ? COMMANDER_DRONE_VISUAL_SCALE : DRONE_VISUAL_SCALE,
    sensorY = compact ? -0.045 : -0.15,
    rotorY = compact ? 0.105 : 0.066;
  const pieces = [];
  const add = (g, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    g.rotateX(rx);
    g.rotateY(ry);
    g.rotateZ(rz);
    g.translate(x, y, z);
    if (color !== null) {
      const c = new T.Color(color),
        a = new Float32Array(g.attributes.position.count * 3);
      for (let i = 0; i < a.length; i += 3) {
        a[i] = c.r;
        a[i + 1] = c.g;
        a[i + 2] = c.b;
      }
      g.setAttribute("color", new T.BufferAttribute(a, 3));
    }
    pieces.push(g);
  };
  if (compact) addCommanderFrame(add, silver);
  else {
    add(new T.BoxGeometry(0.56, 0.24, 0.38), 0x9b9c91);
    add(new T.BoxGeometry(0.44, 0.025, 0.25), 0x55574f, 0, 0.132, 0);
    add(new T.BoxGeometry(0.28, 0.026, 0.06), 0xb27d32, 0, 0.15, 0.05);
    for (const x of [-0.28, 0.28])
      for (const z of [-0.18, 0.18]) {
        add(new T.BoxGeometry(0.36, 0.035, 0.045), 0x4b4d45, x * 0.52, 0, z * 0.5, 0, Math.atan2(-z, x), 0);
        add(new T.TorusGeometry(0.17, 0.022, 6, 16), 0x797b71, x, 0.06, z, Math.PI / 2);
      }
    add(new T.BoxGeometry(0.18, 0.12, 0.12), 0x292d2b, 0, -0.15, 0.16);
    add(new T.BoxGeometry(0.05, 0.15, 0.03), 0xa47736, -0.17, -0.01, 0.205);
    add(new T.BoxGeometry(0.05, 0.15, 0.03), 0xa47736, 0.17, -0.01, 0.205);
  }
  const frame = mergeGeometries(pieces, false);
  pieces.forEach((g) => g.dispose());
  frame.computeBoundingBox();
  frame.computeBoundingSphere();
  const bladeParts = compact
      ? [new T.BoxGeometry(0.384, 0.009, 0.026), new T.BoxGeometry(0.026, 0.009, 0.384)]
      : [new T.BoxGeometry(0.25, 0.009, 0.025), new T.BoxGeometry(0.025, 0.009, 0.25)],
    blade = mergeGeometries(bladeParts, false);
  bladeParts.forEach((g) => g.dispose());
  const sensor = new T.SphereGeometry(0.04, 8, 6),
    halo = new T.TorusGeometry(0.55, 0.016, 4, 24);
  const frameMat = new T.MeshStandardMaterial({
      vertexColors: true,
      roughness: silver ? 0.62 : 0.91,
      metalness: silver ? 0.45 : 0.18,
    }),
    bladeMat = new T.MeshStandardMaterial({
      color: silver ? 0x252d34 : commander ? 0x22272c : 0x242927,
      roughness: 0.9,
    }),
    ownedG = [frame, blade, sensor, halo],
    ownedM = [frameMat, bladeMat];
  let users = 0,
    disposed = false;
  // The old physical model lives in a detached scene, never in the render tree.
  // Damage/contact queries use it explicitly; visible touch bounds use the new model.
  let contacts = null;
  const contactScene = silver ? new T.Scene() : null;
  try {
    if (silver) contacts = createLowHoverDroneLibrary();
  } catch (error) {
    for (const g of ownedG) g.dispose();
    for (const m of ownedM) m.dispose();
    throw error;
  }
  // Existing rigid frame plus sensor support; rotor cross-blades are fully
  // contained by the protective rings. Cache each corpse phase/yaw result.
  const framePositions = frame.attributes.position,
    sensorPositions = sensor.attributes.position;
  return {
    support: DRONE_SUPPORT,
    spawn({ scene, position = { x: 0, z: 0 }, heading = 0, groundY = 0 } = {}) {
      if (disposed || !scene?.isScene || ![position.x, position.z, heading, groundY].every(Number.isFinite))
        throw Error("Valid drone scene/render-space coordinates required");
      const root = new T.Group();
      root.name = commander ? "ARM Commander compact quadcopter" : "ARM low-hover watcher drone"; // text-ok: debug scene label, never shown
      root.scale.setScalar(visualScale);
      const privateFrame = frameMat.clone(),
        privateBlade = bladeMat.clone();
      const shell = new T.Mesh(frame, privateFrame);
      shell.name = "ARM_Drone_Rigid_Frame";
      root.add(shell);
      const rotors = [];
      for (const x of [-0.28, 0.28])
        for (const z of [-0.18, 0.18]) {
          const rotor = new T.Mesh(blade, privateBlade);
          rotor.position.set(x, rotorY, z);
          if (compact) rotor.name = "ARM_Drone_Rotor_" + rotors.length;
          root.add(rotor);
          rotors.push(rotor);
        }
      let floorPhase = -1,
        floorYaw = null,
        minFloor = 0;
      const floorRotation = new T.Matrix4();
      const eyeMat = new T.MeshBasicMaterial({ color: 0x829885 }),
        warnMat = new T.MeshBasicMaterial({ color: 0xe0a537, transparent: true, opacity: 0.7, depthWrite: false });
      const eye = new T.Mesh(sensor, eyeMat);
      eye.position.set(0, sensorY, 0.229);
      root.add(eye);
      const muzzle = new T.Object3D();
      muzzle.name = "ARM_Drone_Bolt_Exit";
      muzzle.position.set(0, 0, 0.229);
      root.add(muzzle);
      const warning = new T.Mesh(halo, warnMat);
      warning.rotation.x = Math.PI / 2;
      warning.visible = false;
      let contact = null;
      try {
        if (silver) contact = contacts.spawn({ scene: contactScene, position, heading, groundY });
      } catch (error) {
        eyeMat.dispose();
        warnMat.dispose();
        privateFrame.dispose();
        privateBlade.dispose();
        throw error;
      }
      scene.add(root, warning);
      users++;
      let released = false,
        state = "idle";
      function update({
        time = 0,
        dt = 0,
        state: next = "idle",
        phase = 0,
        position: point = position,
        heading: yaw = heading,
      } = {}) {
        if (released) return;
        if (
          !DRONE_SUPPORT.states.includes(next) ||
          ![time, dt, phase, point.x, point.z, yaw].every(Number.isFinite) ||
          dt < 0
        )
          throw Error("Invalid drone presentation state");
        state = next;
        const p = T.MathUtils.clamp(phase, 0, 1),
          dead = state === "death";
        root.position.set(
          point.x,
          groundY + (dead ? T.MathUtils.lerp(DRONE_RULES.hoverHeight, 0.36, p) : droneHoverHeight(time)),
          point.z,
        );
        root.rotation.set(dead ? p * 0.55 : Math.sin(time * 2) * 0.025, yaw, dead ? p * -0.25 : 0);
        if (dead) {
          if (floorPhase !== p || floorYaw !== yaw) {
            floorRotation.makeRotationFromQuaternion(root.quaternion);
            const e = floorRotation.elements;
            minFloor = Infinity;
            for (const positions of [framePositions, sensorPositions])
              for (let i = 0; i < positions.count; i++) {
                const sensorPart = positions === sensorPositions,
                  x = positions.getX(i),
                  y = positions.getY(i) + (sensorPart ? sensorY : 0),
                  z = positions.getZ(i) + (sensorPart ? 0.229 : 0);
                minFloor = Math.min(minFloor, visualScale * (e[1] * x + e[5] * y + e[9] * z));
              }
            if (compact) {
              const positions = blade.attributes.position;
              for (const rotor of rotors) {
                const c = Math.cos(rotor.rotation.y),
                  s = Math.sin(rotor.rotation.y);
                for (let i = 0; i < positions.count; i++) {
                  const bx = positions.getX(i),
                    bz = positions.getZ(i),
                    x = rotor.position.x + c * bx + s * bz,
                    y = rotor.position.y + positions.getY(i),
                    z = rotor.position.z - s * bx + c * bz;
                  minFloor = Math.min(minFloor, visualScale * (e[1] * x + e[5] * y + e[9] * z));
                }
              }
            }
            floorPhase = p;
            floorYaw = yaw;
          }
          root.position.y = Math.max(root.position.y, groundY - minFloor + 1e-6);
        }
        for (const rotor of rotors) rotor.rotation.y = dead ? rotor.rotation.y : time * (state === "patrol" ? 26 : 20);
        eyeMat.color.setHex(dead ? 0x313531 : state === "alert" || state === "attack" ? 0xe6a340 : 0x829885);
        if (contact) {
          contact.update({ time, dt, state: next, phase, position: point, heading: yaw });
          contact.root.updateMatrixWorld(true);
        }
        warning.visible = state === "alert";
        warning.position.set(point.x, groundY + 0.035, point.z);
        warning.scale.setScalar(DRONE_VISUAL_SCALE * (0.84 + 0.16 * p));
        warnMat.opacity = 0.4 + 0.35 * Math.sin(Math.PI * p);
        return { state, bodyBand: DRONE_SUPPORT.bodyBand, warningVisible: warning.visible };
      }
      update();
      return {
        root,
        muzzle: contact?.muzzle ?? muzzle,
        contactModel: contact?.root ?? null,
        support: DRONE_SUPPORT,
        update,
        stats() {
          return { state, disposed: released, sharedGeometries: contact ? 8 : 4, privateMaterials: contact ? 8 : 4 };
        },
        dispose() {
          if (released) return;
          released = true;
          contact?.dispose();
          root.removeFromParent();
          warning.removeFromParent();
          root.clear();
          eyeMat.dispose();
          warnMat.dispose();
          privateFrame.dispose();
          privateBlade.dispose();
          users--;
        },
      };
    },
    stats() {
      return {
        users,
        ownedGeometries: ownedG.length + (contacts?.stats().ownedGeometries ?? 0),
        ownedMaterials: ownedM.length + (contacts?.stats().ownedMaterials ?? 0),
        contactCache: contacts?.stats() ?? null,
        geometryBytes:
          ownedG.reduce(
            (n, g) =>
              n +
              Object.values(g.attributes).reduce((s, a) => s + a.array.byteLength, 0) +
              (g.index?.array.byteLength ?? 0),
            0,
          ) + (contacts?.stats().geometryBytes ?? 0),
        newTextures: 0,
        frameTriangles: frame.index.count / 3,
      };
    },
    dispose() {
      if (disposed) return;
      if (users) throw Error("Release drone actors before shared library");
      disposed = true;
      contacts?.dispose();
      for (const g of ownedG) g.dispose();
      for (const m of ownedM) m.dispose();
    },
  };
}
