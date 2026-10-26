import { SEVER_BLOOD_DATA as DATA, groundPoolPlacement } from "./sever-blood-data.js";
import { GAME_DATA } from "./game-data.js";
// The jet cone, the pool disc, the blood colour and the pool's lift off the ground are appearance.json `severBloodEffect`.
const LOOK = GAME_DATA.appearance.severBloodEffect;
const JET_ORDER = 2; // tuning-ok: the jets draw after the ground pools (draw order, not a look value)
const squared = (x) => x ** 2; // tuning-ok: a square
// Fixed private cosmetic slots. The existing finisher gate owns admission and
// the caller's presentation clock owns age; no gameplay events, timers or saves.
export function createSeverBloodEffect({ THREE: T, scene, world }) {
  const group = new T.Group();
  group.name = "Sever neck jets and ground pools"; // text-ok: scene-graph object name
  scene.add(group);
  const jetGeometry = new T.CylinderGeometry(1, LOOK.jetTopRadius, 1, LOOK.jetSegments),
    poolGeometry = new T.CircleGeometry(1, LOOK.poolSegments),
    up = new T.Vector3(0, 1, 0),
    direction = new T.Vector3();
  let disposed = false,
    clock = 0,
    area = world.areaId;
  const slots = (count, geometry, name) =>
    Array.from({ length: count }, () => {
      const material = new T.MeshBasicMaterial({
          color: LOOK.color,
          transparent: true,
          opacity: 0,
          depthTest: true,
          depthWrite: false,
          side: T.DoubleSide,
          toneMapped: false,
        }),
        mesh = new T.Mesh(geometry, material);
      mesh.name = name;
      mesh.visible = false;
      mesh.frustumCulled = false;
      mesh.renderOrder = name === "Sever arterial jet" ? JET_ORDER : 0; // text-ok: scene-graph object name
      group.add(mesh);
      return { mesh, token: null, start: 0 };
    });
  const jets = slots(DATA.jet.capacity, jetGeometry, "Sever arterial jet"), // text-ok: scene-graph object name
    pools = slots(DATA.pool.capacity, poolGeometry, "Sever ground blood pool"); // text-ok: scene-graph object name
  for (const slot of pools) slot.mesh.rotation.x = -Math.PI / 2; // tuning-ok: a quarter turn lays the pool flat
  const stop = (slot) => {
    slot.token = null;
    slot.pending = false;
    slot.gore = false;
    slot.mesh.visible = false;
    slot.mesh.material.opacity = 0;
    slot.mesh.scale.setScalar(0);
  };
  const reset = () => {
    for (const slot of [...jets, ...pools]) stop(slot);
  };
  const anchorsFor = (token) =>
    token.gore?.started ? token.gore.impactAnchors() : token.finisher?.impactAnchors(token.finisherAge ?? 0);
  const valid = (p) => p && ["x", "y", "z"].every((k) => Number.isFinite(p[k]));
  function update(now) {
    if (disposed || !Number.isFinite(now) || now < clock) return;
    if (area !== world.areaId) {
      reset();
      area = world.areaId;
    }
    clock = now;
    for (const slot of jets) {
      if (!slot.token) continue;
      const age = clock - slot.start;
      if (age >= DATA.jet.duration) {
        stop(slot);
        continue;
      }
      const anchors = anchorsFor(slot.token),
        origin = slot.gore ? anchors?.gore?.jetOrigin : anchors?.head,
        normal = slot.gore ? anchors?.gore?.jetDirection : anchors?.neckNormal;
      if (!valid(origin) || !valid(normal)) {
        stop(slot);
        continue;
      }
      direction.set(normal.x, normal.y, normal.z);
      if (direction.lengthSq() < 1e-12) {
        stop(slot);
        continue;
      }
      direction.normalize();
      const strength = Math.sin((Math.PI * Math.max(0, age)) / DATA.jet.duration),
        requested = DATA.jet.length * strength,
        length = direction.y < 0 ? Math.min(requested, Math.max(0, origin.y / -direction.y)) : requested;
      slot.mesh.position.set(origin.x, origin.y, origin.z).addScaledVector(direction, length / 2);
      slot.mesh.quaternion.setFromUnitVectors(up, direction);
      slot.mesh.scale.set(DATA.jet.radius * strength, length, DATA.jet.radius * strength);
      slot.mesh.material.opacity = strength;
      slot.mesh.visible = length > 0;
    }
    for (const slot of pools) {
      if (!slot.token) continue;
      let age = clock - slot.start;
      if (slot.pending) {
        if (age < DATA.pool.settleSeconds) continue;
        const anchors = anchorsFor(slot.token),
          origin = slot.gore ? anchors?.gore?.jetOrigin : anchors?.head,
          placement =
            valid(origin) &&
            groundPoolPlacement({
              layout: world.layout,
              geometry: world.geometry,
              position: { x: origin.x, z: -origin.z },
              radius: DATA.pool.radius,
            });
        if (!placement) {
          stop(slot);
          continue;
        }
        slot.pending = false;
        slot.radius = placement.radius;
        slot.mesh.position.copy(world.toRender(placement.position, LOOK.groundLift));
        slot.start = clock;
        age = 0;
      }
      if (age >= DATA.pool.lifetime) {
        stop(slot);
        continue;
      }
      const spread = Math.min(1, Math.max(0, age) / DATA.pool.spreadSeconds),
        radius = slot.radius * (1 - squared(1 - spread));
      slot.mesh.scale.setScalar(radius);
      slot.mesh.material.opacity = DATA.pool.opacity * spread * (1 - age / DATA.pool.lifetime);
      slot.mesh.visible = radius > 0;
    }
  }
  function start(token, effect, anchors) {
    const gore = effect?.gore;
    if (
      disposed ||
      !token ||
      (gore
        ? !valid(anchors?.gore?.jetOrigin) || !valid(anchors?.gore?.jetDirection)
        : !valid(anchors?.head) || !valid(anchors.neckNormal))
    )
      return null;
    if (area !== world.areaId) {
      reset();
      area = world.areaId;
    }
    const jet = (!gore || gore.jet) && jets.find((s) => !s.token),
      pool = (!gore || gore.pool) && pools.find((s) => !s.token);
    if (jet) {
      jet.token = token;
      jet.gore = !!gore;
      jet.start = clock;
      jet.mesh.material.color.setHex(effect.palette[1]);
    }
    if (pool) {
      pool.token = token;
      pool.gore = !!gore;
      pool.start = clock;
      pool.pending = true;
      pool.radius = DATA.pool.radius;
      pool.mesh.material.color.setHex(effect.palette[0]);
    }
    update(clock);
    return { jet: !!jet, pool: !!pool };
  }
  return {
    start,
    update,
    cancel(token) {
      for (const slot of [...jets, ...pools]) if (slot.token === token) stop(slot);
    },
    reset,
    snapshot() {
      return {
        clock,
        jetCapacity: jets.length,
        poolCapacity: pools.length,
        jets: jets
          .filter((s) => s.token)
          .map((s) => ({
            age: clock - s.start,
            visible: s.mesh.visible,
            position: s.mesh.position.toArray(),
            scale: s.mesh.scale.toArray(),
          })),
        pendingPools: pools.filter((s) => s.token && s.pending).length,
        pools: pools
          .filter((s) => s.token && !s.pending)
          .map((s) => ({
            age: clock - s.start,
            visible: s.mesh.visible,
            position: s.mesh.position.toArray(),
            radius: s.mesh.scale.x,
            maxRadius: s.radius,
            opacity: s.mesh.material.opacity,
            area,
          })),
      };
    },
    dispose() {
      if (disposed) return;
      reset();
      disposed = true;
      group.removeFromParent();
      for (const s of [...jets, ...pools]) s.mesh.material.dispose();
      jetGeometry.dispose();
      poolGeometry.dispose();
    },
  };
}
