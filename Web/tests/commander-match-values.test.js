import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { createGeometry } from "../src/world-geometry.js";
import { createCommanderMatch, selectCommander, orderCommander, stepCommander, commanderDamage, commanderSnapshot } from "../src/engine/commander/match.js";

// Differential test: the Commander match placed, moved, hit and timed exactly as it did with the numbers inline. Each scenario is
// stepped at the fixed 60 Hz and every tick's full state is hashed. The expected digests were recorded from the code before the numbers
// moved to commander.json `match` (UPDATE_COMMANDER_MATCH_DIGEST=1 rewrites them; only for an intended gameplay change).
const layout = JSON.parse(fs.readFileSync(new URL("../public/world/westminster/layout.json", import.meta.url), "utf8")),
  digestPath = new URL("./fixtures/commander-match-values.json", import.meta.url);
const hash = (x) => createHash("sha256").update(JSON.stringify(x)).digest("hex");

function fixture() {
  const geometry = createGeometry(layout),
    world = { areaId: "westminster", geometry, move: geometry.move, lineClear: geometry.lineClear };
  return { world, s: createCommanderMatch(world) };
}
const full = (s) => ({
  snapshot: commanderSnapshot(s),
  units: s.units.map((e) => [e.id, e.pos, e.facing, e.hp, e.ready, e.flashUntil, e.response, e.swing, e.attack, e.order]),
  opponents: s.opponents.map((e) => [e.id, e.pos, e.facing, e.hp, e.ready, e.flashUntil, e.response, e.swing, e.attack, e.attackTarget]),
  bolts: s.bolts,
  waveAt: s.waveAt,
  wavePoint: s.wavePoint,
  capture: s.objective.capture,
  defend: s.objective.defend,
});
function run(f, ticks, each = () => {}) {
  const log = [];
  for (let i = 0; i < ticks && !f.s.result; i++) {
    each(i);
    stepCommander(f.s, f.world);
    log.push([f.s.events.map((e) => e.type), full(f.s)]);
  }
  return log;
}

function scenarios() {
  const out = {};
  const a = fixture();
  out.created = hash({ spawn: a.s.spawn, objective: a.s.objective, wavePoint: a.s.wavePoint, ...full(a.s) });
  out.idle = hash(run(a, 1800));

  const b = fixture();
  b.s.opponents = [];
  selectCommander(b.s, b.s.units.map((e) => e.id));
  const move = orderCommander(b.s, b.world, { type: "move", point: b.s.objective.pos });
  out.moveOrder = hash({ move, orders: b.s.units.map((e) => e.order) });
  const bLog = run(b, 6000);
  out.captureAndWaves = hash(bLog);
  out.phases = [...new Set(bLog.flatMap(([types]) => types))].sort().join();

  const c = fixture();
  selectCommander(c.s, [c.s.units[0].id, c.s.units[1].id]);
  out.attackOrder = hash(orderCommander(c.s, c.world, { type: "attack", targetId: c.s.opponents[0].id }));
  out.attackRun = hash(run(c, 1500));

  const d = fixture();
  const spread = { x: d.s.spawn.x + 2.2, z: d.s.spawn.z - 1.7 };
  selectCommander(d.s, d.s.units.map((e) => e.id));
  out.formation = hash(orderCommander(d.s, d.world, { type: "move", point: spread }));
  out.formationRun = hash(run(d, 900));

  const e = fixture();
  const [m, o] = [e.s.units[0], e.s.opponents[0]];
  out.damage = hash([commanderDamage(e.s, m, o, 6), o.hp, o.flashUntil, o.response, e.s.events.length, commanderDamage(e.s, m, o, 1000), o.hp, o.response, e.s.events.map((v) => v.type)]);

  const g = fixture();
  g.s.units.forEach((u) => (u.hp = 0));
  out.deployAndLoss = hash([
    orderCommander(g.s, g.world, { type: "deploy" }),
    g.s.units.map((u) => [u.pos, u.radius]),
    run(g, 3000).length,
    g.s.result,
  ]);
  return out;
}

test("Commander match behaviour is value-identical to the pre-data code", () => {
  const got = scenarios();
  if (process.env.UPDATE_COMMANDER_MATCH_DIGEST) fs.writeFileSync(digestPath, `${JSON.stringify(got, null, 1)}\n`);
  assert.deepEqual(got, JSON.parse(fs.readFileSync(digestPath, "utf8")));
  assert.equal(typeof got.idle, "string");
});
