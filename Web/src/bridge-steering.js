// Only the two registered bridge-side road bend chains; no global navigation graph.
const BENDS = {
  westminster: [
    [0.52, 0.78],
    [0.603125, 0.6875],
    [0.70625, 0.575],
    [0.770833333333, 0.516666666667],
    [0.835416666667, 0.458333333333],
    [0.9, 0.4],
    [0.97, 0.34],
  ],
  east: [
    [0.1, 0.72],
    [0.12, 0.68],
    [0.17, 0.66],
    [0.21, 0.61],
    [0.26, 0.57],
    [0.31, 0.54],
    [0.4, 0.51],
    [0.44, 0.45],
    [0.44, 0.36],
  ],
};
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function pointSegmentSq(p, a, b) {
  const x = b.x - a.x,
    z = b.z - a.z,
    length = x * x + z * z;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.z - a.z) * z) / length)) : 0;
  return (p.x - a.x - t * x) ** 2 + (p.z - a.z - t * z) ** 2;
}
// Exact capsule clearance against the SAME painted road edges and .061 safety margin.
export function bodyLineClear(geometry, a, b, radius) {
  if (!geometry.clear(a, radius) || !geometry.clear(b, radius) || !geometry.lineClear(a, b)) return false;
  const limit = (radius + 0.061) ** 2;
  return geometry.edges.every(
    ([c, d]) =>
      Math.min(pointSegmentSq(a, c, d), pointSegmentSq(b, c, d), pointSegmentSq(c, a, b), pointSegmentSq(d, a, b)) >
      limit,
  );
}
export function createBridgeSteering() {
  const states = new WeakMap(),
    roads = new WeakMap();
  function reset(actor) {
    states.delete(actor);
  }
  function steer({ world, actor, goal, time, mode = "pursuit", leash = 12 }) {
    const geometry = world.geometry,
      area = world.areaId,
      position = actor.pos,
      radius = actor.radius;
    const home = actor.home,
      within = (p) => !home || distance(home, p) <= leash;
    if (
      !BENDS[area] ||
      !geometry ||
      !goal ||
      !Number.isFinite(time) ||
      !Number.isFinite(radius) ||
      radius < 0 ||
      !within(position) ||
      !within(goal)
    ) {
      reset(actor);
      return goal;
    }
    let state = states.get(actor);
    if (
      state &&
      (state.geometry !== geometry ||
        state.area !== area ||
        state.radius !== radius ||
        state.mode !== mode ||
        state.homeX !== home?.x ||
        state.homeZ !== home?.z ||
        state.leash !== leash ||
        distance(state.goal, goal) > 0.5)
    ) {
      reset(actor);
      state = null;
    }
    if (bodyLineClear(geometry, position, goal, radius)) {
      reset(actor);
      return goal;
    }
    if (state) {
      if (distance(position, state.progressPosition) > 0.08) {
        state.progressPosition = { ...position };
        state.progressAt = time;
      }
      if (time - state.progressAt > 0.75) {
        reset(actor);
        state = null;
      } else if (state.route) {
        // Advance only when the full-body next leg is legal from the current live position.
        while (
          state.index < state.route.length - 1 &&
          distance(position, state.route[state.index]) < 0.15 &&
          bodyLineClear(geometry, position, state.route[state.index + 1], radius)
        )
          state.index++;
        const target = state.index === state.route.length - 1 ? goal : state.route[state.index];
        if (bodyLineClear(geometry, position, target, radius)) return target;
        reset(actor);
        state = null;
      } else if (time - state.progressAt < 0.5) return goal;
    }
    let road = roads.get(geometry);
    if (!road) {
      road = BENDS[area].map(([x, y]) => geometry.ground({ x, y }));
      roads.set(geometry, road);
    }
    const legal = (a, b) => within(a) && within(b) && bodyLineClear(geometry, a, b, radius);
    let best = null,
      bestLength = Infinity;
    // Consider contiguous forward/reverse portions of one small ordered chain only.
    for (let i = 0; i < road.length; i++) {
      if (!legal(position, road[i])) continue;
      for (const direction of [-1, 1]) {
        let length = distance(position, road[i]),
          route = [road[i]];
        for (let j = i; j >= 0 && j < road.length; j += direction) {
          if (j !== i) {
            if (!legal(road[j - direction], road[j])) break;
            length += distance(road[j - direction], road[j]);
            route.push(road[j]);
          }
          const total = length + distance(road[j], goal);
          if (total < bestLength && legal(road[j], goal)) {
            bestLength = total;
            best = [...route, { ...goal }];
          }
        }
      }
    }
    states.set(actor, {
      geometry,
      area,
      radius,
      mode,
      homeX: home?.x,
      homeZ: home?.z,
      leash,
      goal: { ...goal },
      route: best,
      index: 0,
      progressPosition: { ...position },
      progressAt: time,
    });
    return best ? best[0] : goal; // Existing collision mover retains impossible-path behaviour.
  }
  return { steer, reset };
}
