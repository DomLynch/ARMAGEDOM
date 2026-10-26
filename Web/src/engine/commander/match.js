import { DRONE_RULES, droneHoverHeight } from "../../drone-mechanics.js";
import { GAME_DATA } from "../game-data.js";
import { rigOfSpecies } from "../../rig-capabilities.js";
import { tracePistol } from "../../pistol.js";
import { bodyLineClear, createBridgeSteering } from "../../bridge-steering.js";

// data/commander.json holds the match numbers; the machine's body, strike timing and bolt are the drone's own (creatures.json `drone`).
export const commanderRules = (rules, drone) =>
  Object.freeze({
    ...rules,
    machineRadius: drone.radius,
    damage: drone.damage,
    windup: drone.warningSeconds,
    recovery: drone.recoverySeconds,
    boltSpeed: drone.boltSpeed,
  });
export const COMMANDER_RULES = commanderRules(GAME_DATA.commander.rules, DRONE_RULES);
const EPS = 1e-8,
  copy = (p) => ({ x: p.x, z: p.z }),
  distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z),
  live = (a) => a.hp > 0,
  point = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const DRONE_RIG = rigOfSpecies("drone"); // the machine side's rig, from the rig capability rows
const all = (s) => [...s.units, ...s.opponents];
function actor(s, team, pos) {
  const id = s.nextId++,
    machine = team === "machine",
    hp = machine ? COMMANDER_RULES.machineHP : COMMANDER_RULES.biologicalHP;
  return {
    id,
    kind: 0,
    rig: machine ? DRONE_RIG : "hollow-scavenger",
    team,
    areaId: "westminster",
    placementKey: "commander-" + id,
    pos: copy(pos),
    home: copy(pos),
    facing: { x: 1, z: 0 },
    hp,
    maxHP: hp,
    radius: machine ? COMMANDER_RULES.machineRadius : 0.4,
    moveSpeed: machine ? COMMANDER_RULES.machineSpeed : COMMANDER_RULES.biologicalSpeed,
    weapon: machine ? "bolt" : "knife",
    ready: 0,
    recoverUntil: 0,
    staggerUntil: 0,
    hurtUntil: 0,
    dodgeUntil: 0,
    dodgeStart: 0,
    swing: null,
    response: null,
    flashUntil: 0,
    order: { type: "defend", point: copy(pos) },
    attack: null,
    droneState: { phase: "idle", readyAt: 0, warning: null },
  };
}
function freePosition(s, world, center, radius, ignore = null) {
  for (let ring = 0; ring <= 8; ring++)
    for (let i = 0; i < (ring ? 16 : 1); i++) {
      const a = (i * Math.PI) / 8,
        p = { x: center.x + Math.cos(a) * ring * 0.5, z: center.z + Math.sin(a) * ring * 0.5 };
      if (
        world.geometry.clear(p, radius) &&
        !all(s).some((e) => e !== ignore && live(e) && distance(e.pos, p) < e.radius + radius + 0.08)
      )
        return p;
    }
  return null;
}
export function createCommanderMatch(world) {
  if (world.areaId !== "westminster") throw Error("Commander requires Westminster");
  const spawn = world.geometry.ground({ x: 0.52, y: 0.78 }),
    objective = world.geometry.ground({ x: 0.603125, y: 0.6875 }),
    wavePoint = world.geometry.ground({ x: 0.770833333333, y: 0.516666666667 });
  if (
    !world.geometry.clear(spawn, COMMANDER_RULES.machineRadius) ||
    !world.geometry.clear(objective, COMMANDER_RULES.machineRadius) ||
    !bodyLineClear(world.geometry, spawn, objective, COMMANDER_RULES.machineRadius)
  )
    throw Error("Commander registered road pocket is not body-clear");
  const s = {
    mode: "commander",
    time: 0,
    tick: 0,
    phase: "capture",
    result: null,
    selected: [],
    reserve: COMMANDER_RULES.reserve,
    units: [],
    opponents: [],
    bolts: [],
    events: [],
    nextId: 1,
    nextBolt: 1,
    nextOrder: 1,
    lastOrder: null,
    spawn,
    objective: { pos: objective, hp: COMMANDER_RULES.beaconHP, maxHP: COMMANDER_RULES.beaconHP, capture: 0, defend: 0 },
    wavePoint,
    waves: 0,
    waveAt: Infinity,
    navigation: createBridgeSteering(),
  };
  for (let i = 0; i < 3; i++) {
    const p = freePosition(s, world, spawn, COMMANDER_RULES.machineRadius);
    if (!p) throw Error("Three existing full-radius drones do not fit");
    s.units.push(actor(s, "machine", p));
  }
  for (let i = 0; i < 2; i++) {
    const p = freePosition(s, world, { x: objective.x + 3 + i, z: objective.z + 2 }, 0.4);
    if (!p) throw Error("Commander defenders do not fit");
    s.opponents.push(actor(s, "biological", p));
  }
  return s;
}
export function selectCommander(s, ids) {
  if (s.result || !Array.isArray(ids)) return false;
  const valid = [...new Set(ids)].filter((id) => s.units.some((e) => e.id === id && live(e)));
  s.selected = valid;
  return valid.length > 0;
}
export function orderCommander(s, world, request) {
  if (s.result || !request || !["move", "attack", "defend", "deploy"].includes(request.type))
    return { ok: false, reason: "Match or order unavailable" };
  if (request.type === "deploy") {
    if (s.units.filter(live).length >= COMMANDER_RULES.unitCap) return { ok: false, reason: "Three-unit cap reached" };
    if (s.reserve < COMMANDER_RULES.deployCost) return { ok: false, reason: "Reserve exhausted" };
    const p = freePosition(s, world, s.spawn, COMMANDER_RULES.machineRadius);
    if (!p) return { ok: false, reason: "Deployment point occupied" };
    const e = actor(s, "machine", p);
    s.units.push(e);
    s.reserve -= COMMANDER_RULES.deployCost;
    s.selected = [e.id];
    s.lastOrder = { id: s.nextOrder++, type: "deploy", unitIds: [e.id], time: s.time };
    return { ok: true, ...s.lastOrder };
  }
  const units = s.selected.map((id) => s.units.find((e) => e.id === id && live(e))).filter(Boolean);
  if (!units.length) return { ok: false, reason: "Select a machine first" };
  let target = null;
  if (request.type === "attack") {
    target = s.opponents.find((e) => e.id === request.targetId && e.team === "biological" && live(e));
    if (!target) return { ok: false, reason: "Choose a living biological opponent" };
  }
  if (
    request.type === "move" &&
    (!point(request.point) || !world.geometry.clear(request.point, COMMANDER_RULES.machineRadius))
  )
    return { ok: false, reason: "Destination is outside the clear road" };
  const destinations = [];
  if (request.type === "move")
    for (const e of units) {
      const occupied = [
        ...all(s)
          .filter((a) => live(a) && !units.includes(a))
          .map((a) => ({ pos: a.pos, radius: a.radius })),
        ...destinations.map((pos) => ({ pos, radius: COMMANDER_RULES.machineRadius })),
      ];
      let chosen = null;
      for (let ring = 0; ring <= 6 && !chosen; ring++)
        for (let i = 0; i < (ring ? 16 : 1) && !chosen; i++) {
          const a = (i * Math.PI) / 8,
            p = { x: request.point.x + Math.cos(a) * ring * 0.6, z: request.point.z + Math.sin(a) * ring * 0.6 };
          if (
            world.geometry.clear(p, e.radius) &&
            !occupied.some((v) => distance(p, v.pos) < e.radius + v.radius + 0.08)
          ) {
            const route = s.navigation.steer({ world, actor: e, goal: p, time: s.time, leash: Infinity });
            if (bodyLineClear(world.geometry, e.pos, route, e.radius) && world.lineClear(e.pos, route)) chosen = p;
          }
        }
      if (!chosen) return { ok: false, reason: "No body-clear route for the selected formation" };
      destinations.push(chosen);
    }
  for (let i = 0; i < units.length; i++) {
    const e = units[i];
    e.attack = null;
    e.droneState.warning = null;
    e.order =
      request.type === "move"
        ? { type: "move", point: destinations[i] }
        : request.type === "attack"
          ? { type: "attack", targetId: target.id }
          : { type: "defend", point: copy(e.pos) };
  }
  s.lastOrder = {
    id: s.nextOrder++,
    type: request.type,
    unitIds: units.map((e) => e.id),
    ...(target ? { targetId: target.id } : {}),
    ...(request.type === "move" ? { point: copy(request.point), destinations } : {}),
    time: s.time,
  };
  s.events.push({ type: "order", ...s.lastOrder });
  return { ok: true, ...s.lastOrder };
}
export function commanderDamage(s, attacker, target, amount) {
  if (
    s.result ||
    !all(s).includes(attacker) ||
    !all(s).includes(target) ||
    !attacker ||
    !target ||
    !live(attacker) ||
    !live(target) ||
    attacker.team === target.team ||
    !["machine", "biological"].includes(attacker.team) ||
    !["machine", "biological"].includes(target.team) ||
    !Number.isFinite(amount) ||
    amount <= 0
  )
    return false;
  const paid = Math.min(target.hp, amount);
  target.hp -= paid;
  target.flashUntil = s.time + 0.12;
  target.response = { clip: target.hp > 0 ? "Hit" : "Death", start: s.time, ticks: target.hp > 0 ? 12 : 144 };
  s.events.push({
    type: "hit",
    actor: target,
    attackerId: attacker.id,
    amount: paid,
    position: copy(target.pos),
    impactDirection: copy(attacker.facing),
    weapon: attacker.team === "machine" ? "bolt" : "knife",
  });
  if (target.hp <= 0) {
    target.attack = null;
    target.swing = null;
    target.droneState.warning = null;
    s.selected = s.selected.filter((id) => id !== target.id);
    s.events.push({ type: "death", actor: target });
  }
  return true;
}
function moveActor(s, world, e, goal, dt) {
  const waypoint = s.navigation.steer({ world, actor: e, goal, time: s.time, leash: Infinity }),
    dx = waypoint.x - e.pos.x,
    dz = waypoint.z - e.pos.z,
    n = Math.hypot(dx, dz);
  if (n < EPS) return false;
  const travel = Math.min(n, e.moveSpeed * dt),
    axis = { x: dx / n, z: dz / n },
    side = e.id % 2 ? 1 : -1;
  for (const angle of [0, (side * Math.PI) / 4, (-side * Math.PI) / 4, (side * Math.PI) / 2, (-side * Math.PI) / 2]) {
    const c = Math.cos(angle),
      sn = Math.sin(angle),
      dir = { x: axis.x * c - axis.z * sn, z: axis.x * sn + axis.z * c },
      next = world.move(e.pos, { x: dir.x * travel, z: dir.z * travel }, e.radius);
    if (
      distance(next, e.pos) < travel * 0.25 ||
      !world.geometry.clear(next, e.radius) ||
      !world.lineClear(e.pos, next) ||
      all(s).some((a) => a !== e && live(a) && distance(next, a.pos) < e.radius + a.radius + 0.015)
    )
      continue;
    e.facing = dir;
    e.pos = next;
    return true;
  }
  return false;
}
function nearest(e, targets) {
  return targets.filter(live).sort((a, b) => distance(e.pos, a.pos) - distance(e.pos, b.pos) || a.id - b.id)[0] ?? null;
}
function finish(s, result, reason) {
  if (s.result) return;
  s.result = { kind: result, reason, time: s.time };
  s.phase = "result";
  s.selected = [];
  s.bolts = [];
  for (const e of all(s)) {
    e.attack = null;
    e.swing = null;
    e.droneState.warning = null;
  }
  s.events.push({ type: "result", ...s.result });
}
function stepMachine(s, world, e, dt) {
  e.alerted = e.order.type !== "move";
  if (e.attack) {
    const a = e.attack;
    if (s.time + EPS < a.releaseAt) return;
    e.attack = null;
    e.droneState.warning = null;
    e.ready = s.time + COMMANDER_RULES.recovery;
    e.droneState.phase = "recover";
    e.droneState.readyAt = e.ready;
    const target = s.opponents.find((v) => v.id === a.targetId && live(v));
    if (!target || !world.lineClear(a.origin, target.pos)) return;
    s.bolts.push({
      id: "commander-" + s.nextBolt++,
      attackerId: e.id,
      team: e.team,
      pos: copy(a.origin),
      dir: copy(a.direction),
      height: droneHoverHeight(s.time),
      born: s.time,
      expires: s.time + COMMANDER_RULES.range / COMMANDER_RULES.boltSpeed,
      speed: COMMANDER_RULES.boltSpeed,
      amount: COMMANDER_RULES.damage,
    });
    return;
  }
  if (e.order.type === "move") {
    if (distance(e.pos, e.order.point) > 0.25) {
      moveActor(s, world, e, e.order.point, dt);
      e.droneState.phase = "patrol";
      return;
    }
    e.order = { type: "defend", point: copy(e.pos) };
  }
  let target =
    e.order.type === "attack" ? s.opponents.find((a) => a.id === e.order.targetId && live(a)) : nearest(e, s.opponents);
  if (!target) {
    if (e.order.type === "attack") e.order = { type: "defend", point: copy(e.pos) };
    return;
  }
  const d = distance(e.pos, target.pos);
  if (d > COMMANDER_RULES.range || !world.lineClear(e.pos, target.pos)) {
    if (e.order.type === "attack") moveActor(s, world, e, target.pos, dt);
    return;
  }
  const dx = target.pos.x - e.pos.x,
    dz = target.pos.z - e.pos.z,
    n = Math.hypot(dx, dz);
  if (n < EPS || s.time + EPS < e.ready) return;
  e.facing = { x: dx / n, z: dz / n };
  e.attack = {
    targetId: target.id,
    releaseAt: s.time + COMMANDER_RULES.windup,
    origin: copy(e.pos),
    direction: copy(e.facing),
  };
  e.droneState.warning = { start: s.time };
  e.droneState.phase = "warning";
}
function stepBiological(s, world, e, dt) {
  if (e.attack) {
    const a = e.attack;
    if (s.time + EPS < a.releaseAt) return;
    e.attack = null;
    e.ready = s.time + COMMANDER_RULES.meleeRecovery;
    const target = a.targetId === 0 ? s.objective : s.units.find((v) => v.id === a.targetId && live(v));
    if (
      target &&
      distance(e.pos, target.pos) <= COMMANDER_RULES.meleeRange + EPS &&
      world.lineClear(e.pos, target.pos)
    ) {
      if (a.targetId === 0) {
        s.objective.hp = Math.max(0, s.objective.hp - COMMANDER_RULES.biologicalDamage);
        s.events.push({ type: "beacon-hit", amount: COMMANDER_RULES.biologicalDamage });
      } else commanderDamage(s, e, target, COMMANDER_RULES.biologicalDamage);
    }
    return;
  }
  if (e.swing && s.time >= e.swing.end) e.swing = null;
  const enemy = nearest(e, s.units),
    target = enemy && distance(e.pos, enemy.pos) < 8 ? enemy : s.objective,
    targetId = target === s.objective ? 0 : target.id;
  if (distance(e.pos, target.pos) > COMMANDER_RULES.meleeRange) {
    moveActor(s, world, e, target.pos, dt);
    return;
  }
  if (s.time + EPS < e.ready || !world.lineClear(e.pos, target.pos)) return;
  const dx = target.pos.x - e.pos.x,
    dz = target.pos.z - e.pos.z,
    n = Math.hypot(dx, dz) || 1;
  e.facing = { x: dx / n, z: dz / n };
  e.attackTarget = targetId;
  e.attack = { targetId, releaseAt: s.time + COMMANDER_RULES.meleeWindup };
  e.swing = { clip: "Attack", native: true, start: s.time, end: s.time + COMMANDER_RULES.meleeWindup + 0.35 };
}
export function stepCommander(s, world, dt = 1 / 60) {
  if (!Number.isFinite(dt) || Math.abs(dt - 1 / 60) > EPS) throw Error("Commander requires fixed60Hz");
  if (s.result) return;
  s.events = [];
  s.time += dt;
  s.tick++;
  for (const e of s.units.filter(live)) stepMachine(s, world, e, dt);
  for (const e of s.opponents.filter(live)) stepBiological(s, world, e, dt);
  for (const b of s.bolts) {
    if (s.time > b.expires) {
      b.dead = true;
      continue;
    }
    const attacker = s.units.find((e) => e.id === b.attackerId),
      trace = tracePistol(
        b.pos,
        b.dir,
        all(s).filter((e) => e.id !== b.attackerId),
        (a, c) => world.lineClear(a, c),
        { range: b.speed * dt },
      );
    if (!trace) {
      b.dead = true;
      continue;
    }
    b.pos = trace.end;
    if (trace.targetId != null) {
      const target = all(s).find((e) => e.id === trace.targetId);
      if (attacker) commanderDamage(s, attacker, target, b.amount);
      b.dead = true;
    } else if (distance(trace.origin, trace.end) < b.speed * dt - EPS) b.dead = true;
  }
  s.bolts = s.bolts.filter((b) => !b.dead);
  const machines = s.units.filter(live),
    biological = s.opponents.filter(live),
    near = (a) => distance(a.pos, s.objective.pos) <= COMMANDER_RULES.captureRadius;
  if (s.phase === "capture") {
    if (machines.some(near) && !biological.some(near))
      s.objective.capture = Math.min(COMMANDER_RULES.captureSeconds, s.objective.capture + dt);
    if (s.objective.capture + EPS >= COMMANDER_RULES.captureSeconds) {
      s.phase = "defend";
      s.waveAt = s.time + 5;
      s.events.push({ type: "captured" });
    }
  } else if (s.phase === "defend") {
    s.objective.defend += dt;
    if (s.waves < 2 && s.time + EPS >= s.waveAt) {
      for (let i = 0; i < 2; i++) {
        const p = freePosition(s, world, s.wavePoint, 0.4);
        if (p) s.opponents.push(actor(s, "biological", p));
      }
      s.waves++;
      s.waveAt = s.time + 10;
      s.events.push({ type: "wave", number: s.waves });
    }
    if (s.objective.hp > 0 && s.objective.defend + EPS >= COMMANDER_RULES.defendSeconds)
      finish(s, "success", "Checkpoint captured and defended");
  }
  if (s.objective.hp <= 0) finish(s, "loss", "Checkpoint destroyed");
  else if (s.time + EPS >= COMMANDER_RULES.matchSeconds) finish(s, "loss", "Time expired");
  else if (!machines.length && s.reserve < COMMANDER_RULES.deployCost)
    finish(s, "loss", "Squad and replacement reserve exhausted");
}
export function commanderSnapshot(s) {
  return {
    mode: "commander",
    time: s.time,
    tick: s.tick,
    phase: s.phase,
    result: s.result ? { ...s.result } : null,
    reserve: s.reserve,
    cap: COMMANDER_RULES.unitCap,
    deployCost: COMMANDER_RULES.deployCost,
    selected: [...s.selected],
    lastOrder: s.lastOrder ? structuredClone(s.lastOrder) : null,
    spawn: copy(s.spawn),
    objective: structuredClone(s.objective),
    units: s.units.map((e) => ({
      id: e.id,
      rig: e.rig,
      team: e.team,
      hp: e.hp,
      maxHP: e.maxHP,
      pos: copy(e.pos),
      radius: e.radius,
      order: structuredClone(e.order),
    })),
    opponents: s.opponents.map((e) => ({
      id: e.id,
      rig: e.rig,
      team: e.team,
      hp: e.hp,
      maxHP: e.maxHP,
      pos: copy(e.pos),
    })),
    bolts: s.bolts.length,
    waves: s.waves,
  };
}
