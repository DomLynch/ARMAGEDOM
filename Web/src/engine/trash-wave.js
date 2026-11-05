import { GAME_DATA } from "./game-data.js";
import { webText } from "./web-text.js";
import { hollowActor } from "./area-residents.js";
import { safehouseSite, safehouseTouches } from "./safehouse.js";
import { activeDay, seededRandom } from "./spawn-variation.js";
import { applyStarRow, starsEnabled, STAR_VARIANTS } from "./star-variants.js";
import {
  TRASH_WAVE,
  wavesEnabled,
  waveTier,
  liveCap,
  groupAmount,
  isBossWave,
  liveWaveMobs,
} from "./trash-wave-core.js";

export {
  TRASH_WAVE,
  wavesEnabled,
  groupAmount,
  isBossWave,
  liveWaveMobs,
  liveCap,
  waveTier,
} from "./trash-wave-core.js";
export { onWaveKill } from "./trash-wave-rewards.js";

// TIMED TRASH-MOB WAVES (data/trashWave.json). Opt-in: with the flag off (the default) nothing here creates state or touches an actor.
// On: a wave clock sends packs of plain hollow humans in from just outside the camera view; they run at the player at once, are run-scoped
// (gone when the area changes, the player dies or the run ends, never respawned) and cost no placement key. State is `g.trashWave` on the
// live game only: never saved, never sent. Rewards and coin drops are in trash-wave-rewards.js.
const TURN = Math.PI + Math.PI;
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// Removes every wave mob (living or dead) from the live lists AND from every parked area record, then drops the state. Wave drops lying
// about go too. Safe to call with no state.
export function clearTrashWave(g) {
  const keep = (e) => e.waveMob !== true;
  g.enemies = g.enemies.filter(keep);
  if (g.corpses) g.corpses = g.corpses.filter(keep);
  for (const record of Object.values(g.areaFights ?? {})) {
    record.enemies = record.enemies.filter(keep);
    if (record.corpses) record.corpses = record.corpses.filter(keep);
  }
  if (g.killDrops) g.killDrops.list = g.killDrops.list.filter((d) => d.wave !== true);
  g.trashWave = null;
}

// A free cell for a body: far enough from the player, off camera, on clear ground, not an exit, not the safehouse, not on a living body.
// `services.pointOnScreen(position, margin)` is the render service the trap crates use; headless there is no camera, so a fixed radius stands in.
function spotFree(g, p, rules, services) {
  const s = rules.spawn,
    from = dist(p, g.player.pos);
  if (from < s.minPlayerMetres) return false;
  if (services.pointOnScreen ? services.pointOnScreen(p, s.viewMargin) : from < s.headlessViewMetres) return false;
  if (g.world.geometry && !g.world.geometry.clear(p, s.bodyRadius)) return false;
  if (g.world.travelAt?.(p) || safehouseTouches(g, p, s.safehouseRadius)) return false;
  for (let i = 0; i < g.enemies.length; i++) {
    const e = g.enemies[i];
    if (e.hp > 0 && dist(p, e.pos) < (e.radius ?? s.bodyRadius) + s.bodyRadius + s.occupiedGap) return false;
  }
  return true;
}

// A pack leader's cell: the tries sweep the whole circle from the pack's own even start angle (plus jitter), each at a random radius in the
// ring band; the first free cell wins. Null after `tries` misses: the pack waits for the next tick.
function ringSpot(g, rules, services, rand, startTurns) {
  const s = rules.spawn;
  for (let t = 0; t < s.tries; t++) {
    const angle = TURN * (startTurns + t / s.tries + (rand() - rand()) * s.angleJitterTurns),
      radius = s.ringInnerMetres + rand() * (s.ringOuterMetres - s.ringInnerMetres),
      p = { x: g.player.pos.x + Math.cos(angle) * radius, z: g.player.pos.z + Math.sin(angle) * radius };
    if (spotFree(g, p, rules, services)) return p;
  }
  return null;
}
// A follower's cell: within followerRadius of the pack's anchor (the leader's spawn cell).
function nearSpot(g, anchor, rules, services, rand) {
  const s = rules.spawn;
  for (let t = 0; t < s.tries; t++) {
    const angle = rand() * TURN,
      radius = rand() * s.followerRadius,
      p = { x: anchor.x + Math.cos(angle) * radius, z: anchor.z + Math.sin(angle) * radius };
    if (spotFree(g, p, rules, services)) return p;
  }
  return null;
}

// One plain hollow human (the opening group's factory: 40 HP, hollow speed, melee knife), set to hunt the player at once and to hold its
// attacks for graceSeconds. No placement key, so no award, respawn or loot ledger entry; `waveMob` marks it for the run-scoped clean-up.
function makeMob(g, kind, position, waveId, rand, rules) {
  const sizes = GAME_DATA.creatures.mobSize.factors,
    row = rules.mobs[kind],
    e = hollowActor(g, position, 0, sizes[Math.floor(rand() * sizes.length)]),
    hp = Math.max(1, Math.round(e.maxHP * row.healthScale));
  Object.assign(e, {
    waveMob: true,
    waveId,
    elite: kind === "elite",
    areaId: g.world.areaId,
    hp,
    maxHP: hp,
    moveSpeed: e.moveSpeed * row.speedScale,
    home: { ...position },
    patrol: [{ ...position }, { ...position }],
    patrolIndex: 0,
    alerted: true,
    returning: false,
    residentIntent: rules.mobs.pursuit,
    ready: g.time + rules.spawn.graceSeconds,
    bornAt: g.time,
    waveAx: position.x, // where the stuck check last saw it make progress
    waveAz: position.z,
    waveAt: g.time,
  });
  const star = kind === "elite" && STAR_VARIANTS.stars.find((r) => r.stars === row.stars);
  return star && starsEnabled() ? applyStarRow(e, star) : e;
}

// The packs of one wave: elites first (a pack of one each), then the trash split into packs of packMin..packMax. Each queue entry is one
// mob to place; a pack's later entries are followers that spawn beside the leader.
function planWave(state, tier, wave, rand, rules) {
  const s = rules.spawn,
    packs = [];
  for (const kind of ["elite", "trash"])
    for (const group of rules.groups) {
      if (group.kind !== kind) continue;
      let left = groupAmount(group, tier, wave);
      while (left > 0) {
        const drawn = s.packMin + Math.floor(rand() * (s.packMax - s.packMin + 1)), // a pack of packMin..packMax
          size = kind === "elite" ? 1 : left <= s.packMax ? left : Math.min(drawn, left - s.packMin); // never leave a runt behind
        packs.push({ kind, size, anchor: null });
        left -= size;
      }
    }
  packs.forEach((pack, index) => {
    for (let i = 0; i < pack.size; i++)
      state.queue.push({ wave, kind: pack.kind, pack, leader: i === 0, turns: index / packs.length });
  });
  return packs.some((p) => p.kind === "elite");
}

function startWave(g, state, tier, rules) {
  const wave = ++state.wave,
    seed = [activeDay() ?? rules.seed.fallbackDay, rules.seed.salt, wave].join(rules.seed.separator);
  state.rand = seededRandom(seed);
  state.lastWaveAt = g.time;
  state.clock = rules.clockSeconds;
  const elite = planWave(state, tier, wave, state.rand, rules),
    boss = isBossWave(wave, rules);
  state.breatherPending = elite;
  for (const key of Object.keys(state.tally)) if (Number(key) < wave - 1) delete state.tally[key];
  g.events.push({ type: "trash-wave-start", wave, size: state.queue.length, elite, boss });
  if (boss) g.events.push({ type: "trash-wave-boss", wave });
  g.message = webText(boss ? "wave.boss" : elite ? "wave.elite" : "wave.announce", { wave, score: state.score });
  g.messageUntil = g.time + rules.messageSeconds;
}

// Spawns queued mobs, at most spawn.perFrame a step and never past the tier's live cap. A mob whose search fails (30 tries) stays at the head
// of the queue and is tried again after retrySeconds; after giveUpSeconds without a free cell it is dropped, so one walled-in spot cannot
// hold the whole wave (and the clock) for ever. A follower whose leader was dropped searches the ring itself.
function spawnQueued(g, state, live, cap, rules, services) {
  const s = rules.spawn;
  let made = 0;
  while (state.queue.length && made < s.perFrame && live + made < cap && g.time >= state.nextTry) {
    const entry = state.queue[0],
      alone = entry.leader || !entry.pack.anchor,
      at = alone
        ? ringSpot(g, rules, services, state.rand, entry.turns)
        : nearSpot(g, entry.pack.anchor, rules, services, state.rand);
    if (!at) {
      state.nextTry = g.time + s.retrySeconds;
      entry.since ??= g.time;
      if (g.time - entry.since >= s.giveUpSeconds) state.queue.shift();
      break;
    }
    if (entry.leader) entry.pack.anchor = at;
    g.enemies.push(makeMob(g, entry.kind, at, entry.wave, state.rand, rules));
    state.queue.shift();
    made++;
  }
  return made;
}

// Counts the living wave mobs and notes any that is stuck: it has not moved stuckProgressMetres in stuckSeconds, is not in melee with the
// player (farther than stuckMinMetres) and is off camera. There is no nav mesh, so a mob can stall behind a building; such a mob is removed
// without a kill so it cannot hold the live cap or the paused clock for ever, and nothing pops out of view.
function census(g, state, rules, services) {
  const s = rules.spawn;
  let live = 0,
    stale = false;
  for (let i = 0; i < g.enemies.length; i++) {
    const e = g.enemies[i];
    if (e.waveMob !== true || e.hp <= 0) continue;
    live++;
    if (Math.hypot(e.pos.x - e.waveAx, e.pos.z - e.waveAz) >= s.stuckProgressMetres) {
      e.waveAx = e.pos.x;
      e.waveAz = e.pos.z;
      e.waveAt = g.time;
    } else if (
      g.time - e.waveAt >= s.stuckSeconds &&
      dist(e.pos, g.player.pos) > s.stuckMinMetres &&
      !services.pointOnScreen?.(e.pos, 0)
    ) {
      e.waveStale = true;
      stale = true;
    }
  }
  if (!stale) return live;
  g.enemies = g.enemies.filter((e) => e.waveStale !== true);
  return liveWaveMobs(g.enemies);
}

function newState(g, rules) {
  return {
    areaId: g.world.areaId,
    wave: 0,
    clock: rules.firstWaveSeconds,
    lastWaveAt: g.time,
    queue: [],
    nextTry: 0,
    rand: null,
    breatherPending: false,
    breatherUntil: 0,
    tally: {},
    score: 0,
    cleared: 0,
    kills: 0,
    lastDropAt: -Infinity,
  };
}

// One simulation step, called beside stepMarkedHunters. `services.pointOnScreen` is the render service (absent headless).
// `rules` and `search` are for tests. With waves off this returns before touching the game.
export function stepTrashWave(g, dt, services = {}, rules = TRASH_WAVE, search = undefined) {
  if (!wavesEnabled(rules, search)) return;
  let state = g.trashWave;
  const area = g.world.areaId;
  // A finished run, a dead player, an ended apocalypse run or an excluded area: no waves, and what is left is removed.
  if (g.finished || g.player.hp <= 0 || g.run?.outcome || rules.excludedAreas.includes(area)) {
    if (state) clearTrashWave(g);
    return;
  }
  if (state && state.areaId !== area) {
    clearTrashWave(g);
    state = null;
  }
  state ??= g.trashWave = newState(g, rules);
  if (safehouseSite(g.world)?.wholeArea || safehouseTouches(g, g.player.pos, g.player.radius)) return; // the safehouse pauses the waves
  const tier = waveTier(services.quality), // services.quality is a test hook; the page uses the shared QUALITY
    live = census(g, state, rules, services),
    made = state.queue.length ? spawnQueued(g, state, live, liveCap(tier, rules), rules, services) : 0;
  if (state.queue.length || made) return; // a wave is still arriving: the clock starts again once it is all out
  const pace = rules.pacing;
  if (state.breatherPending && live === 0) {
    state.breatherPending = false;
    state.breatherUntil = g.time + pace.breatherSeconds;
  }
  if (g.time < state.breatherUntil) return;
  if (live <= pace.pauseAboveLive) state.clock -= dt; // the clock stops while the street is crowded
  const early =
    state.wave > 0 &&
    !state.breatherPending &&
    live <= pace.earlyAtMostLive &&
    g.time - state.lastWaveAt >= pace.earlyMinGapSeconds;
  if (state.clock <= 0 || early) startWave(g, state, tier, rules);
}
