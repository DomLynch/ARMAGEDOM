import { armedBossEquipment as armed } from "./boss-equipment-fixture.js";
import { stepGame } from "../../src/combat.js";
// One grenade throw against a hostile at a set range: the shared rig for the grenade auto-target rows and the before/after table.
export function rig(gap, { speed = 0, field = "grenade" } = {}) {
  const f = armed(field),
    g = f.g,
    target = g.enemies.find((e) => e.hp > 0);
  target.ready = 1e6;
  target.moveSpeed = 0;
  target.hp = target.maxHP = 1e4;
  let player = null,
    dir = null;
  for (let i = 0; i < 72 && !player; i++) {
    const a = (i * Math.PI) / 36,
      d = { x: Math.cos(a), z: Math.sin(a) },
      row = { x: target.pos.x - d.x * gap, z: target.pos.z - d.z * gap };
    // The walk runs sideways (the worst case for a straight throw): every spot along it, warm-up included, must be open ground.
    const ends = [0, 1, 2, 3].map((k) => ({ x: target.pos.x - d.z * speed * 0.8 * k, z: target.pos.z + d.x * speed * 0.8 * k }));
    if (f.world.geometry.clear(row, 0.4) && ends.every((e) => f.world.lineClear(row, e) && f.world.geometry.clear(e, 0.4))) {
      player = row;
      dir = d;
    }
  }
  if (!player) return null;
  g.player.pos = player;
  g.player.facing = { ...dir };
  g.enemies = [target];
  const side = { x: -dir.z, z: dir.x };
  return { f, g, target, player, dir, side };
}
export const services = (f) => ({ dispatchBossEquipment: f.p.dispatchBossEquipment });
// Throws, then runs the fuse out; the target walks along `side` at `speed` m/s the whole time. Returns where it landed and the damage dealt.
export function throwAndMeasure(r, intent, { speed = 0, keepIntent = null, warm = 12 } = {}) {
  const { f, g, target, side } = r,
    hp0 = target.hp,
    s = services(f);
  let landed = null,
    blast = null;
  // The body is already walking when the player throws: the sim keeps no velocity, so the lead reads it from these steps.
  for (let i = 0; i < warm; i++) {
    target.pos.x += side.x * (speed / 60);
    target.pos.z += side.z * (speed / 60);
    stepGame(g, keepIntent ?? {}, 1 / 60, s);
  }
  target.pos.x += side.x * (speed / 60);
  target.pos.z += side.z * (speed / 60);
  stepGame(g, typeof intent === "function" ? intent() : intent, 1 / 60, s);
  const throwEvent = g.events.find((e) => e.type === "grenade-throw");
  if (throwEvent) landed = { ...throwEvent.position };
  for (let i = 0; i < 200 && !blast; i++) {
    target.pos.x += side.x * (speed / 60);
    target.pos.z += side.z * (speed / 60);
    stepGame(g, keepIntent ?? {}, 1 / 60, s);
    blast = g.events.find((e) => e.type === "grenade-blast") ?? null;
  }
  return {
    thrown: !!throwEvent,
    landed,
    blast: blast && { ...blast.position },
    missBy: blast ? Math.hypot(blast.position.x - target.pos.x, blast.position.z - target.pos.z) : null,
    damage: hp0 - target.hp,
  };
}
