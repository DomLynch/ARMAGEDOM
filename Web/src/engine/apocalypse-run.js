import { GAME_DATA, fillText } from "./game-data.js";
import { webText } from "./web-text.js";
import { activeDay, seededRandom } from "./spawn-variation.js";
import { safehouseTouches, safehouseProtected } from "./safehouse.js";

// APOCALYPSE RUN (data/apocalypseRun.json): an opt-in run of three timed stages on the existing zones (scavenge, AI invasion, boss or escape).
// This is the director. It reads the game clock, announces each stage, fires the stage's raids through the post-boss raid (the raid row's own
// cap, postBossRaid.maxSimultaneous, still bounds every marked hunter at once), scales the heat gain (heat.js asks runHeatScale) and ends
// the run on one of four conditions: escaped, boss killed, died, time out. The seed picks one row of each variants list.
// State is `g.run` on the live game only: never saved, never sent. The sandbox is the default; a run starts only on an explicit start.
const RUN = GAME_DATA.apocalypseRun;
const TURN = Math.PI + Math.PI;

// The page's start and off switches, worked out once per rules row. `search` is for tests.
const pageFlags = new WeakMap();
function flags(rules, search) {
  const read = (query) => {
    const params = new URLSearchParams(query);
    return {
      off: params.get(rules.offSwitch.param) === rules.offSwitch.value,
      start: params.get(rules.startSwitch.param) === rules.startSwitch.value,
      noExtract: params.get(rules.extraction.offSwitch.param) === rules.extraction.offSwitch.value,
    };
  };
  if (search !== undefined) return read(search);
  if (!pageFlags.has(rules)) pageFlags.set(rules, read(globalThis.location?.search ?? ""));
  return pageFlags.get(rules);
}
export const runEnabled = (rules = RUN, search = undefined) => rules.enabled && !flags(rules, search).off;
// The escape is a hold-out unless the row or ?noextract=1 switches it back to the instant exit.
export const extractionEnabled = (rules = RUN, search = undefined) => rules.extraction.enabled && !flags(rules, search).noExtract;

const stageStart = (rules, index) => rules.stages.slice(0, index).reduce((sum, s) => sum + s.seconds, 0);
export const runTotalSeconds = (rules = RUN) => stageStart(rules, rules.stages.length);
// The stage the run clock `t` is in, or -1 once every stage is over.
function stageAt(rules, t) {
  let end = 0;
  for (let i = 0; i < rules.stages.length; i++) {
    end += rules.stages[i].seconds;
    if (t < end) return i;
  }
  return -1;
}
// m:ss, whole seconds rounded up so a countdown never shows 0:00 early.
export function clock(seconds) {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(100 + (whole % 60)).slice(1)}`;
}

function rollPicks(rules, seed) {
  const random = seededRandom(seed);
  return Object.fromEntries(Object.entries(rules.variants).map(([kind, rows]) => [kind, rows[Math.floor(random() * rows.length)]]));
}

export function canStartRun(g, rules = RUN, search = undefined) {
  return (
    runEnabled(rules, search) && g.world.areaId === rules.startZone && (!g.run || g.run.dismissed) && g.player.hp > 0 && !g.finished
  );
}

// Begins a run now: the seed is the day (or the fallback) plus the run count, so a second run differs from the first.
// The count and the ?run=1 auto-start belong to the page load, not the game: a Retry builds a new game object, and the next run must still
// get a fresh seed and ?run=1 must not start again. `count` is for tests.
export const runSession = { count: 0, autoDone: false };
export function startRun(g, rules = RUN, search = undefined, count = undefined) {
  if (!canStartRun(g, rules, search)) return false;
  runSession.count = count ?? runSession.count + 1;
  const seed = [activeDay() ?? rules.seed.fallbackDay, rules.seed.salt, runSession.count].join(rules.seed.separator);
  g.run = {
    seed,
    picks: rollPicks(rules, seed),
    startAt: g.time,
    kills0: g.kills ?? 0,
    heatPeak: 0,
    stage: -1,
    fired: [],
    bannerUntil: 0,
    outcome: null,
    result: null,
    dismissed: false,
    finale: null,
    boss: null,
    armed: false,
    hold: null,
    extracted: null,
    clockAt: g.time,
  };
  return true;
}

// The held extraction's bonus: the base scaled by the last curve row the heat peak reaches. A score only: never cash, never saved.
const extractionBonus = (rules, heatPeak) => {
  const { base, curve } = rules.extraction.bonus;
  return Math.round(base * curve.findLast((row) => heatPeak >= row.minHeatPeak).scale);
};

function finish(g, outcome, rules, bonus = 0) {
  const r = g.run;
  r.outcome = outcome;
  r.hold = null;
  r.result = {
    outcome,
    kills: (g.kills ?? 0) - r.kills0,
    seconds: Math.min(g.time - r.startAt, runTotalSeconds(rules)),
    heatPeak: r.heatPeak,
    ...(bonus > 0 ? { bonus } : {}),
  };
  if (r.boss?.runHome) r.boss.home = r.boss.runHome; // the summoned boss goes back to its own leash
  g.raid = null; // the run's raid ends with the run
  g.enemies = g.enemies.filter((e) => !e.raidHunter);
}

function armRaid(g, rules) {
  const a = g.run.picks.assault,
    base = GAME_DATA.postBossRaid;
  g.raid = {
    startAt: g.time,
    endAt: g.time + a.durationSeconds,
    spawned: 0,
    live: 0,
    nextAt: g.time,
    areaId: g.world.areaId,
    // maxSimultaneous stays the post-boss raid's own: the run never raises the cap on marked hunters.
    row: { ...base, hunterCount: a.hunterCount, durationSeconds: a.durationSeconds, delaySeconds: 0, targetZones: rules.raidZones },
  };
  g.message = webText("raid.armed");
  g.messageUntil = g.time + base.messageSeconds;
}

// The boss walks to the player's side: it is moved to a clear, visible spot at the data's distance and woken.
function summonBoss(g, boss, rules) {
  const random = seededRandom([g.run.seed, "boss"].join(rules.seed.separator)),
    world = g.world,
    from = g.player.pos;
  for (let i = 0; i < rules.boss.attempts; i++) {
    const angle = random() * TURN,
      spot = { x: from.x + Math.cos(angle) * rules.boss.spawnDistance, z: from.z + Math.sin(angle) * rules.boss.spawnDistance };
    if (!world.geometry?.clear(spot, boss.radius) || !world.lineClear(from, spot) || world.travelAt?.(spot)) continue;
    boss.runHome ??= boss.home; // kept so the run's end can put it back
    boss.pos = spot;
    boss.home = { ...spot };
    break;
  }
  boss.runBoss = true;
  boss.alerted = true;
  boss.returning = false;
}

function say(g, text) {
  g.message = text;
  g.messageUntil = g.time + GAME_DATA.postBossRaid.messageSeconds;
}

// Entering the last stage settles the finale: a boss row needs a living boss in the player's area, otherwise it is the escape row.
function prepareFinale(g, rules) {
  const r = g.run,
    row = r.picks.finale,
    boss = row.kind === "boss" ? g.enemies.find((e) => e.bossProfile && e.hp > 0) : null;
  r.finale = { id: row.id, kind: boss ? "boss" : "escape", fallback: row.kind === "boss" && !boss };
  if (boss) {
    r.boss = boss;
    summonBoss(g, boss, rules);
    say(g, rules.boss.arrived);
  } else say(g, rules.escape.arrived);
}

// How far the player is, in metres, from the nearest exit of this area that leads to `toArea` (Infinity when there is none). The same
// clamp-to-the-exit-box measure as the route hint (world.js exitHint).
const linkLists = new WeakMap(); // registry -> "area>toArea" -> its links: the step runs at 60 Hz and the registry never changes
function exitLinks(world, toArea) {
  const registry = world.registry;
  if (!registry) return [];
  const key = `${world.areaId}>${toArea}`;
  let lists = linkLists.get(registry);
  if (!lists) linkLists.set(registry, (lists = new Map()));
  if (!lists.has(key)) lists.set(key, registry.links(world.areaId).filter((link) => link.to === toArea));
  return lists.get(key);
}
function exitGap(world, position, toArea) {
  const links = exitLinks(world, toArea),
    point = links.length ? world.geometry.point(position) : null;
  let best = Infinity;
  for (const link of links) {
    const c = link.condition,
      ground = world.geometry.ground({
        x: Math.min(Math.max(point.x, c.xMin ?? 0), c.xMax ?? 1),
        y: Math.min(Math.max(point.y, c.yMin ?? 0), c.yMax ?? 1),
      });
    best = Math.min(best, Math.hypot(position.x - ground.x, position.z - ground.z));
  }
  return best;
}

// The hold-out in the FIELD, beside the exit that leads back to the safehouse (the safehouse itself bars every hostile, so nothing
// could come for a hold there). The spot is set where the player stands within mouthRange of that exit, in a raid zone; a flare marks it,
// the run raid is called and the area boss is pulled to it. Staying within holdRadius fills the hold, leaving drains it, and a drained
// hold (or another area) drops the spot. A full hold opens the extraction: taking the exit home then ends the run with the bonus.
function stepHold(g, rules, dt) {
  const r = g.run,
    x = rules.extraction,
    areaId = g.world.areaId;
  if (r.extracted) return;
  if (!r.hold) {
    if (!rules.raidZones.includes(areaId) || safehouseProtected(g)) return;
    const gap = exitGap(g.world, g.player.pos, rules.startZone);
    if (gap > x.mouthRange) return;
    if (gap < x.mouthMin) {
      // Too close to the exit: the hunt's entry points keep a minimum distance, so nothing could come. Say so, not every frame.
      if (g.time >= (r.stepHintAt ?? 0)) {
        r.stepHintAt = g.time + x.hintSeconds;
        say(g, webText("extraction.step"));
      }
      return;
    }
    r.hold = { areaId, at: { ...g.player.pos }, hold: 0, progress: 0, hud: "" };
    if (!g.raid || g.raid.endAt - g.time < x.raidMinSeconds) armRaid(g, rules); // a raid nearly over would leave the hold unopposed
    say(g, webText(r.holdsStarted ? "extraction.begin" : "extraction.beginFirst")); // the first hold of a run says how to hold
    r.holdsStarted = (r.holdsStarted ?? 0) + 1;
    return;
  }
  const h = r.hold,
    near = areaId === h.areaId && Math.hypot(g.player.pos.x - h.at.x, g.player.pos.z - h.at.z) <= x.holdRadius;
  h.hold = near ? h.hold + dt : Math.max(0, h.hold - x.holdDecayPerSecond * dt);
  h.progress = Math.min(1, h.hold / x.holdSeconds);
  if (h.progress >= 1) {
    r.extracted = { bonus: extractionBonus(rules, r.heatPeak) };
    r.hold = null;
    say(g, webText("extraction.ready"));
  } else if (areaId !== h.areaId || (!near && h.hold === 0)) {
    r.hold = null;
    say(g, webText("extraction.broken"));
  } else h.hud = webText("extraction.hud", { percent: Math.round(h.progress * 100) });
}

// The point the hold-out calls hunters and bosses to (engine/airdrop.js airdropPull), or null. It outranks the airdrop and the body
// bag for as long as the hold lasts, and only in the area it was set in.
export const extractionTarget = (g, rules = RUN) =>
  g.run?.hold && g.run.hold.areaId === g.world?.areaId ? { at: g.run.hold.at, pull: rules.extraction.pull } : null;

function fireRaids(g, rules, index, t) {
  const stage = rules.stages[index],
    from = stageStart(rules, index);
  stage.raids.forEach((trigger, i) => {
    const key = `${stage.id}:${i}`;
    if (t < from + trigger.atSeconds || g.run.fired.includes(key) || g.raid) return;
    g.run.fired.push(key);
    armRaid(g, rules);
  });
}

// After each simulation step (loop.js, beside the post-boss raid): start, stage changes, raids, and the end conditions.
export function stepApocalypseRun(g, rules = RUN, search = undefined) {
  if (!runEnabled(rules, search)) {
    g.run = null;
    return;
  }
  const r = g.run;
  if (!r) {
    if (flags(rules, search).start && !runSession.autoDone && g.world.areaId === rules.startZone) {
      runSession.autoDone = true; // ?run=1 starts one run per page load, the first time the player stands in the start zone
      startRun(g, rules, search);
    }
    return;
  }
  if (r.outcome) return;
  r.heatPeak = Math.max(r.heatPeak, g.heat?.count ?? 0);
  if (g.player.hp <= 0) return finish(g, "died", rules);
  if (r.boss && r.boss.hp <= 0) return finish(g, "boss", rules);
  const t = g.time - r.startAt,
    index = stageAt(rules, t);
  if (index < 0) return finish(g, "timeout", rules);
  if (index !== r.stage) {
    r.stage = index;
    r.bannerUntil = g.time + rules.bannerSeconds;
    if (index === rules.stages.length - 1) prepareFinale(g, rules);
  }
  const dt = Math.max(0, g.time - r.clockAt);
  r.clockAt = g.time;
  if (r.finale?.kind === "escape") {
    // The safehouse counts only after the player has been out of it during the finale.
    const touching = safehouseTouches(g, g.player.pos, g.player.radius);
    if (!touching) r.armed = true;
    if (!extractionEnabled(rules, search)) {
      if (touching && r.armed) return finish(g, "escaped", rules);
    } else {
      stepHold(g, rules, dt);
      if (touching && r.extracted) return finish(g, "escaped", rules, r.extracted.bonus);
    }
  }
  fireRaids(g, rules, index, t);
}

// The heat gain multiplier of the current stage and hazard; 1 outside a run (heat.js).
// `valuable` marks a stash, crate or boss gain, which the row's scaleValuables may leave at its normal size.
export function runHeatScale(g, rules = RUN, valuable = false) {
  const r = g.run;
  if (!r || r.outcome || r.stage < 0 || (valuable && !rules.scaleValuables)) return 1;
  return rules.stages[r.stage].heatScale * r.picks.hazard.heatScale * (r.hold ? rules.extraction.heatScale : 1);
}

const live = (g) => (g.run && !g.run.outcome && g.run.stage >= 0 ? g.run : null);

// The stage timer line (stage name, time left in the stage, the hazard), or "" outside a run.
export function runTimerLine(g, rules = RUN) {
  const r = live(g);
  if (!r) return "";
  const stage = rules.stages[r.stage],
    left = stageStart(rules, r.stage) + stage.seconds - (g.time - r.startAt);
  return fillText(rules.text.timer, { stage: stage.banner, time: clock(left) }) + fillText(rules.text.hazard, { label: r.picks.hazard.label });
}

// The stage's objective line (the area objective line shows it instead of the area's own), or "" outside a run.
export function runObjective(g, rules = RUN) {
  const r = live(g);
  if (!r) return "";
  const stage = rules.stages[r.stage];
  if (stage.objectiveFrom !== "finale" || !r.finale) return r.picks[stage.objectiveFrom].objective;
  return r.finale.fallback ? rules.variants.finale.find((row) => row.kind === "escape").objective : r.picks.finale.objective;
}

// The stage banner while it is up: { title, line }, or null.
export function runBanner(g, rules = RUN) {
  const r = live(g);
  return r && g.time < r.bannerUntil ? { title: rules.stages[r.stage].banner, line: rules.stages[r.stage].bannerLine } : null;
}

// The results rows once the run has ended and until the player continues: [{ label, value }], or null.
export function runResults(g, rules = RUN) {
  const r = g.run;
  if (!r?.result || r.dismissed) return null;
  const x = r.result;
  const rows = [
    { label: rules.text.rowOutcome, value: rules.outcomes[x.outcome] },
    { label: rules.text.rowKills, value: String(x.kills) },
    { label: rules.text.rowTime, value: clock(x.seconds) },
    { label: rules.text.rowHeat, value: String(x.heatPeak) },
  ];
  if (x.bonus) rows.push({ label: webText("extraction.rowBonus"), value: String(x.bonus) });
  return rows;
}

export function dismissRun(g) {
  if (g.run?.outcome) g.run.dismissed = true;
}
