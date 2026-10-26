// Only the two registered bridge-side road bend chains (data/atmosphere.json bends); no global navigation graph.
import { GAME_DATA } from "./engine/game-data.js";

const BENDS = GAME_DATA.atmosphere.bends;
// The road-edge safety margin, the default leash, the progress and stall limits and the waypoint reach are creatures.json `bridgeSteering`.
const STEER = GAME_DATA.creatures.bridgeSteering;
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
function pointSegmentSq(p, a, b) {
  const x = b.x - a.x,
    z = b.z - a.z,
    length = x * x + z * z;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * x + (p.z - a.z) * z) / length)) : 0;
  return (p.x - a.x - t * x) ** 2 + (p.z - a.z - t * z) ** 2;
}
// Exact capsule clearance against the SAME painted road edges and safety margin.
export function bodyLineClear(geometry, a, b, radius) {
  if (!geometry.clear(a, radius) || !geometry.clear(b, radius) || !geometry.lineClear(a, b)) return false;
  const limit = (radius + STEER.edgeMargin) ** 2;
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
  function steer({ world, actor, goal, time, mode = "pursuit", leash = STEER.leash }) {
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
      if (distance(position, state.progressPosition) > STEER.progressStep) {
        state.progressPosition = { ...position };
        state.progressAt = time;
      }
      if (time - state.progressAt > STEER.stallSeconds) {
        reset(actor);
        state = null;
      } else if (state.route) {
        // Advance only when the full-body next leg is legal from the current live position.
        while (
          state.index < state.route.length - 1 &&
          distance(position, state.route[state.index]) < STEER.waypointReach &&
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
