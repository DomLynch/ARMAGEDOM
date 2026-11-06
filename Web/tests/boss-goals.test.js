import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Boss unlock goals (data/bossGoals.json), ?bossgoals=1 on. The page switch is read once per page from the address, so it is set before
// the engine loads; tests/boss-goals-off.test.js covers the off switch in its own process.
globalThis.location = { search: "?bossgoals=1" };
const { createGame, stepGame } = await import("../src/combat.js");
const { createAreaRegistry } = await import("../src/area-registry.js");
const { createGeometry } = await import("../src/world-geometry.js");
const { validateAreaMetadata } = await import("../src/engine/area-content.js");
const { createRunPersistence } = await import("../src/engine/run-core.js");
const { travelTo } = await import("../src/travel.js");
const { GAME_DATA } = await import("../src/engine/game-data.js");
const { validateBossGoals } = await import("../src/engine/game-data-boss-goals.js");
const { webText } = await import("../src/engine/web-text.js");
const core = await import("../src/engine/boss-goal-core.js");
const { stepBossGoals } = await import("../src/engine/boss-goals.js");
const { createBossGoalView } = await import("../src/engine/boss-goal-view.js");

const RULES = GAME_DATA.bossGoals;
const read = (path) => JSON.parse(fs.readFileSync(new URL("../public/" + path, import.meta.url)));
const registry = createAreaRegistry({ manifest: read("world/manifest.json") });
const layout = (id) => read(registry.asset(registry.get(id).layoutRef).path);
const options = {
  pilot: "donor-knife",
  pistol: true,
  supplies: true,
  vest: true,
  areaResidents: true,
  animalVariants: true,
  encounter: {
    id: "hollow-scavengers",
    character: { rig: "hollow-scavenger", weapon: "knife", contactRig: "hero", bodyScale: 1 },
  },
};
const KEY = "boss-veteran-v1";

function fixture(area = "area8") {
  const data = validateAreaMetadata(read("world/area-content.json"), registry);
  let g,
    geometry = createGeometry(layout(area));
  const world = {
    areaId: area,
    registry,
    spawn: geometry.ground(registry.get(area).entry),
    layout: { characterScale: 1.265 },
    geometry,
    bossData: data.bossData,
    progressionData: data.progression,
    expeditionData: data.expedition,
    uniqueRewardData: data.uniqueRewardData,
    populationData: data.populationData,
    residentPlacements: data.residents,
    lootRules: data.lootRules,
    lineClear: () => true,
    move: (p, d) => ({ x: p.x + d.x, z: p.z + d.z }),
    travelAt: () => null,
    async loadArea(id, entry) {
      this.areaId = id;
      geometry = createGeometry(layout(id));
      this.geometry = geometry;
      return geometry.ground(entry ?? registry.get(id).entry);
    },
  };
  const fresh = () => createGame(world, { ...options, residentPlacements: data.residents });
  g = fresh();
  const p = createRunPersistence({
    getRun: () => g,
    setRun: (next) => (g = next),
    createFreshRun: fresh,
    storage: { getItem: () => null, setItem: () => {} },
  });
  return {
    get g() {
      return g;
    },
    world,
    data,
    p,
  };
}
// A real pistol kill at range, then the loop's goal step, so the genuine death event reaches the counter.
function kill(f, enemy) {
  const g = f.g;
  enemy.hp = 1;
  g.player.pos = { x: enemy.pos.x, z: enemy.pos.z - 10 };
  g.player.facing = { x: 0, z: 1 };
  Object.assign(g.pistol, { collected: true, equipped: true, magazine: 6, nextFireAt: g.time });
  stepGame(g, { actions: ["fire"], manualPistolAim: true, aim: { x: 0, z: 1 } });
  assert.ok(!g.enemies.includes(enemy), "the shot must kill " + enemy.placementKey);
  stepBossGoals(g);
}
const ordinary = (g) => g.enemies.filter((e) => !e.bossProfile);

test("the shipped data validates and matches the content: real boss keys, real text, goals a no-waves run can meet", () => {
  const content = read("world/area-content.json");
  const bosses = content.bosses.placements;
  assert.deepEqual(RULES.goals.map((r) => r.placementKey).sort(), bosses.map((p) => p.key).sort());
  for (const row of RULES.goals) {
    const place = bosses.find((p) => p.key === row.placementKey);
    assert.equal(row.id, place.profileRef, row.id + " is named for its boss profile");
    assert.ok(row.counts.includes("resident"), row.id + " must count residents so a run without waves can fill it");
    for (const part of ["hud", "arrive"])
      assert.ok(webText(`bossGoal.${row.id}.${part}`).length > 0, row.id + " " + part);
    // Every other placed resident of the area could be killed once: the goal must be met inside that number.
    const area = content.population.areas[place.areaId],
      others = area.activePlacementIds.filter((k) => k !== place.key && !k.includes("drone")).length;
    assert.ok(row.kills >= 1 && row.kills <= others, `${row.id}: ${row.kills} kills against ${others} residents`);
  }
  assert.equal(RULES.bossGoalsEnabledDefault, true, "on by default");
  validateBossGoals(structuredClone(RULES));
});

test("the validator rejects a bad row, an unknown kind, a duplicate and an unknown field", () => {
  const bad = (change) => {
    const d = structuredClone(RULES);
    change(d);
    assert.throws(() => validateBossGoals(d));
  };
  bad((d) => (d.goals[0].kills = 0));
  bad((d) => (d.goals[0].kills = 61));
  bad((d) => (d.goals[0].counts = []));
  bad((d) => (d.goals[0].counts = ["resident", "resident"]));
  bad((d) => (d.goals[0].counts = ["boss"]));
  bad((d) => (d.goals[1].placementKey = d.goals[0].placementKey));
  bad((d) => (d.goals[1].id = d.goals[0].id));
  bad((d) => (d.goals[0].placementKey = "Bad Key"));
  bad((d) => (d.goals[0].extra = 1));
  bad((d) => (d.extra = 1));
  bad((d) => (d.goals = []));
  bad((d) => (d.enabled = "yes"));
  bad((d) => (d.startSwitch.value = ""));
  bad((d) => (d.summon.attempts = 0));
  bad((d) => (d.flourish.seconds = 0));
});

test("the switch, the lock and the kill kinds", () => {
  assert.equal(core.bossGoalsEnabled(RULES, ""), true, "on by default");
  assert.equal(core.bossGoalsEnabled(RULES, "?nobossgoals=1"), false);
  assert.equal(core.bossGoalsEnabled({ ...RULES, bossGoalsEnabledDefault: false }, ""), false);
  assert.equal(core.bossGoalsEnabled({ ...RULES, bossGoalsEnabledDefault: false }, "?bossgoals=0"), false);
  assert.equal(core.bossGoalsEnabled(RULES, "?bossgoals=1"), true);
  assert.equal(core.bossGoalsEnabled({ ...RULES, enabled: false }, "?bossgoals=1"), false);
  assert.equal(core.bossGoalsEnabled(RULES), true, "this process carries ?bossgoals=1");
  assert.equal(core.bossGoalLocks({}, KEY, RULES, "?nobossgoals=1"), false);
  assert.equal(core.bossGoalLocks({}, KEY, RULES, "?bossgoals=1"), true);
  assert.equal(core.bossGoalLocks({ bossGoals: { done: { [KEY]: true } } }, KEY, RULES, "?bossgoals=1"), false);
  assert.equal(
    core.bossGoalLocks({}, "westminster-roamer-1", RULES, "?bossgoals=1"),
    false,
    "only boss placements are goals",
  );
  assert.equal(core.killTag({ placementKey: "x" }), "resident");
  assert.equal(core.killTag({ waveMob: true }), "wave");
  assert.equal(core.killTag({ placementKey: "x", markedHunter: true }), "hunter");
  assert.equal(core.killTag({ raidHunter: true }), "hunter");
  assert.equal(core.killTag({ placementKey: KEY, bossProfile: {} }), null, "a boss never feeds a goal");
  assert.equal(core.killTag(undefined), null);
  const row = { counts: ["resident", "wave"] };
  assert.equal(core.countsFor(row, { waveMob: true }), true);
  assert.equal(core.countsFor(row, { markedHunter: true }), false);
});

test("the boss is not placed while its goal is open", () => {
  const f = fixture();
  assert.equal(ordinary(f.g).length, 9);
  assert.ok(!f.g.enemies.some((e) => e.placementKey === KEY), "no boss in the area yet");
  assert.ok(!f.g.enemies.some((e) => e.bossProfile));
});

test("kills fill the counter, the last one brings the boss in once, with its announcement", () => {
  const f = fixture(),
    need = RULES.goals.find((r) => r.placementKey === KEY).kills;
  for (let n = 1; n < need; n++) {
    kill(f, ordinary(f.g)[0]);
    assert.equal(core.activeGoal(f.g).progress, n);
    assert.ok(!f.g.enemies.some((e) => e.bossProfile), "still locked at " + n);
  }
  assert.equal(f.g.bossGoals.done[KEY], undefined);
  kill(f, ordinary(f.g)[0]);
  const boss = f.g.enemies.find((e) => e.placementKey === KEY);
  assert.ok(boss && boss.bossProfile && boss.hp === boss.maxHP, "the boss steps in at full health");
  assert.equal(f.g.bossGoals.done[KEY], true);
  assert.equal(boss.alerted, true);
  const away = Math.hypot(boss.pos.x - f.g.player.pos.x, boss.pos.z - f.g.player.pos.z);
  assert.ok(Math.abs(away - RULES.summon.distance) < 1e-6, "it stands the summon distance from the player");
  assert.deepEqual(boss.home, boss.pos);
  assert.equal(f.g.message, webText("bossGoal.veteran.arrive"));
  assert.equal(f.g.messageUntil, f.g.time + RULES.flourish.messageSeconds);
  assert.equal(f.g.bossGoals.flourish.until, f.g.time + RULES.flourish.seconds);
  assert.equal(f.g.events.filter((e) => e.type === "boss-goal-complete" && e.placementKey === KEY).length, 1);
  assert.equal(core.activeGoal(f.g).done, true);
  // Stepping on, and more kills, never bring a second boss.
  for (let i = 0; i < 3; i++) stepBossGoals(f.g);
  kill(f, ordinary(f.g)[0]);
  assert.equal(f.g.enemies.filter((e) => e.bossProfile).length, 1);
});

test("a boss never counts, and a kill counts only for the goal of the area it was made in", () => {
  const f = fixture(),
    g = f.g;
  stepBossGoals(g); // state exists
  const push = (actor) => {
    g.events = [{ type: "death", actor }];
    stepBossGoals(g);
  };
  push({ placementKey: "x", bossProfile: {} });
  assert.equal(g.bossGoals.progress[KEY], undefined, "a boss kill is not a count");
  push({ placementKey: "y", markedHunter: true }); // the veteran counts hunters
  assert.equal(core.activeGoal(g).progress, 1);
  g.world.areaId = "lambeth"; // the surgeon's area: the surgeon's goal counts what is killed there, the veteran's stays put
  push({ placementKey: "z", markedHunter: true }); // the surgeon does not count hunters
  assert.equal(g.bossGoals.progress["boss-surgeon-v1"], undefined);
  push({ placementKey: "z" });
  assert.equal(g.bossGoals.progress["boss-surgeon-v1"], 1);
  assert.equal(g.bossGoals.progress[KEY], 1);
  g.world.areaId = "central-hub"; // no boss here: nothing is counted
  push({ placementKey: "w" });
  assert.equal(core.activeGoal(g), null);
  assert.equal(g.bossGoals.progress[KEY], 1);
});

test("a death event is counted once however often the step reads it", () => {
  const f = fixture(),
    g = f.g;
  stepBossGoals(g);
  g.events = [{ type: "death", actor: { placementKey: "x" } }];
  for (let i = 0; i < 5; i++) stepBossGoals(g);
  assert.equal(g.bossGoals.progress[KEY], 1);
});

test("a boss already beaten in the run gets no goal and is not brought in", () => {
  const f = fixture();
  const row = { areaId: "area8", placementKey: KEY, weaponId: f.g.progression.awards[0]?.weaponId ?? "knife" };
  f.g.progression = f.g.progressionModel.award(f.g.progression, [row]).state;
  assert.equal(core.activeGoal(f.g), null);
  assert.equal(stepBossGoals(f.g), null);
});

test("the boss stays after the player leaves and returns, and is the one parked", async () => {
  const f = fixture(),
    need = RULES.goals.find((r) => r.placementKey === KEY).kills;
  for (let n = 0; n < need; n++) kill(f, ordinary(f.g)[0]);
  assert.ok(f.g.enemies.some((e) => e.placementKey === KEY));
  await travelTo(f.g, { areaId: "central-hub" });
  await travelTo(f.g, { areaId: "area8" });
  assert.equal(f.g.enemies.filter((e) => e.placementKey === KEY).length, 1);
});

test("the view shows the ring while the goal is open and the banner while the flourish lasts", () => {
  const nodes = {};
  const node = () => ({
    hidden: true,
    textContent: "",
    style: {
      setProperty(k, v) {
        this[k] = v;
      },
    },
  });
  for (const id of ["boss-goal", "boss-goal-text", "boss-goal-count", "boss-goal-flash", "boss-goal-flash-title"])
    nodes[id] = node();
  const view = createBossGoalView({ doc: { getElementById: (id) => nodes[id] }, rules: RULES, search: "?bossgoals=1" });
  const f = fixture();
  view.frame(f.g);
  assert.equal(nodes["boss-goal"].hidden, false);
  assert.equal(nodes["boss-goal-count"].textContent, `0 / ${RULES.goals.find((r) => r.placementKey === KEY).kills}`);
  assert.equal(nodes["boss-goal-text"].textContent, webText("bossGoal.veteran.hud"));
  assert.equal(nodes["boss-goal-flash"].hidden, true);
  const need = RULES.goals.find((r) => r.placementKey === KEY).kills;
  for (let n = 0; n < need; n++) kill(f, ordinary(f.g)[0]);
  view.frame(f.g);
  assert.equal(nodes["boss-goal"].hidden, true, "the ring is gone once the boss is out");
  assert.equal(nodes["boss-goal-flash"].hidden, false);
  assert.equal(nodes["boss-goal-flash-title"].textContent, webText("bossGoal.veteran.arrive"));
  f.g.time += RULES.flourish.seconds + 0.1;
  view.frame(f.g);
  assert.equal(nodes["boss-goal-flash"].hidden, true);
  view.frame(f.g, true);
  assert.equal(nodes["boss-goal"].hidden, true, "hidden while travelling");
});
