import { GAME_DATA } from "./game-data.js";
import { arcKind } from "./telegraph-shape.js";

// Attack telegraphs (data/telegraph.json): which enemy attacks are winding up right now, where they will land and how far along the
// wind-up is. Presentation only: it reads the run and never changes it, and the shape of each record is the number the damage check
// uses, so what the player sees filling is what hurts. The view (engine/telegraph-view.js) draws the records.
//   melee swing   an enemy `swing` in its wind-up (and its short active window, held full): a cone of the move's reach (range times
//                 the body's combat scale, like the hit check; the animals' mouth contact reach) and arc, a circle for a full turn.
//   flame         a boss or salamander `bossWeapon` still in its warning: a cone of the profile's range and coneDegrees.
//   bone saw      a surgeon `sawPhase` in its wind-up: a cone of the saw's range and coneDegrees.
//   boss ranged   a `bossRanged` warning: the shotgun's pellet fan (range, twice the spread), the rocket's flight line (range long,
//                 as wide as its blast).
//   area hazard   a poison patch still in its warning: a circle of the patch radius.
const TELEGRAPH = GAME_DATA.telegraph;
const SECONDS_PER_TICK = 1 / 60;

// The URL parameter named in the data (offSwitch.param) set to offSwitch.value turns every telegraph off.
export const telegraphOn = (rules = TELEGRAPH, search = globalThis.location?.search ?? "") =>
  rules.enabled && new URLSearchParams(search).get(rules.offSwitch.param) !== rules.offSwitch.value;

// How far a wind-up has come, 0 at its start to 1 when the hit lands. A wind-up of no length is already complete.
export const telegraphProgress = (elapsed, windup) => (windup > 0 ? Math.min(1, Math.max(0, elapsed / windup)) : 1);

// An empty set of records for `capacity` telegraphs. The records are reused every frame, so a steady frame allocates nothing.
export function createTelegraphSet(capacity = TELEGRAPH.maxVisible) {
  const rows = Array.from({ length: capacity }, () => ({
    owner: 0,
    source: "",
    kind: "cone",
    x: 0,
    z: 0,
    dx: 0,
    dz: 1,
    reach: 0,
    arc: 0,
    width: 0,
    progress: 0,
    distance: 0,
    placed: false,
  }));
  return { rows, count: 0, capacity };
}

// A record for the next telegraph, or null when the set is full of nearer ones. When full, the farthest record is replaced by a nearer one.
function claim(set, owner, source, distance) {
  let index = set.count;
  if (index < set.capacity) set.count++;
  else {
    index = 0;
    for (let i = 1; i < set.count; i++) if (set.rows[i].distance > set.rows[index].distance) index = i;
    if (set.rows[index].distance <= distance) return null;
  }
  const row = set.rows[index];
  row.owner = owner;
  row.source = source;
  row.distance = distance;
  return row;
}
function put(row, kind, x, z, dir, reach, arc, width, progress) {
  row.kind = kind;
  row.x = x;
  row.z = z;
  row.dx = dir.x;
  row.dz = dir.z;
  row.reach = reach;
  row.arc = arc;
  row.width = width;
  row.progress = progress;
}

// The reach a swing really covers. Animals bite through their mouth contact (the reach the effects line already shows); a body with a
// weapon reaches `range` scaled by its combat scale, which is the distance the hit check tests.
function swingReach(e, def) {
  if (e.contactGoalReach && (def.ratBite || def.ratLow)) return e.contactGoalReach;
  return def.range * (def.ratBite || def.ratLow ? 1 : (e.combatScale ?? 1));
}

// Fills `set` with the telegraphs on screen this frame (nearest to the player first to be kept when there are more than `capacity`).
// g: the game; rules: telegraph.json; data: { rangedRules, rangedFan } the boss ranged weapons.json rows and fan data.
export function collectTelegraphs(
  g,
  set,
  data = { rangedRules: GAME_DATA.weapons.bossRanged, rangedFan: GAME_DATA.bossRangedExtra },
) {
  set.count = 0;
  const p = g?.player;
  if (!p || p.hp <= 0 || g.finished) return set;
  const time = g.time;
  for (const e of g.enemies) {
    if (!(e.hp > 0) || e.hostile === false) continue;
    const distance = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z),
      swing = e.swing,
      def = swing?.def;
    if (def?.windupTicks > 0 && def.range > 0) {
      const windup = def.windupTicks * SECONDS_PER_TICK,
        elapsed = time - swing.start;
      if (elapsed < windup + (def.activeTicks ?? 0) * SECONDS_PER_TICK) {
        const arc = def.arc ?? 90,
          row = claim(set, e.id, "swing", distance);
        if (row)
          put(
            row,
            arcKind(arc),
            e.pos.x,
            e.pos.z,
            swing.dir,
            swingReach(e, def),
            arc,
            0,
            telegraphProgress(elapsed, windup),
          );
      }
    }
    const flame = e.bossWeapon;
    if (flame?.phase === "warning") {
      const profile = flame.profile ?? e.bossProfile?.weapon,
        windup = profile?.windupTicks,
        row = Number.isFinite(g.tick) && windup > 0 ? claim(set, e.id, "flame", distance) : null;
      if (row)
        put(
          row,
          "cone",
          e.pos.x,
          e.pos.z,
          flame.direction,
          profile.range,
          profile.coneDegrees,
          0,
          telegraphProgress(g.tick - flame.startTick, windup),
        );
    }
    const saw = e.sawPhase,
      sawProfile = e.bossProfile?.weapon;
    if (saw?.phase === "windup" && sawProfile?.kind === "saw") {
      const windup = sawProfile.windupTicks * SECONDS_PER_TICK,
        row = claim(set, e.id, "saw", distance);
      if (row)
        put(
          row,
          "cone",
          e.pos.x,
          e.pos.z,
          e.facing,
          sawProfile.range,
          sawProfile.coneDegrees,
          0,
          telegraphProgress(windup - (saw.until - time), windup),
        );
    }
    const ranged = e.bossRanged,
      rule = ranged ? data.rangedRules[e.rig] : null;
    if (ranged?.phase === "warning" && rule) {
      const row = claim(set, e.id, "ranged", distance);
      if (row) {
        const progress = telegraphProgress(time - ranged.start, ranged.releaseAt - ranged.start);
        if (rule.kind === "shotgun")
          put(
            row,
            "cone",
            e.pos.x,
            e.pos.z,
            ranged.bearing,
            rule.range,
            data.rangedFan.shotgun.spreadDegrees + data.rangedFan.shotgun.spreadDegrees,
            0,
            progress,
          );
        else put(row, "line", e.pos.x, e.pos.z, ranged.bearing, rule.range, 0, rule.radius + rule.radius, progress);
      }
    }
  }
  for (const h of g.areaHazards ?? []) {
    if (!(time < h.startsAt) || h.areaId !== g.world?.areaId) continue;
    const owner = g.enemies.find((e) => e.id === h.ownerId && e.hp > 0),
      warning = owner?.bossProfile?.hazard?.warning;
    if (!(warning > 0)) continue;
    const row = claim(set, h.ownerId, "hazard", Math.hypot(h.position.x - p.pos.x, h.position.z - p.pos.z));
    if (row)
      put(
        row,
        "circle",
        h.position.x,
        h.position.z,
        owner.facing,
        h.radius,
        TELEGRAPH.fullArcDegrees,
        0,
        telegraphProgress(warning - (h.startsAt - time), warning),
      );
  }
  return set;
}

// The scale the filling inner shape has at `progress`: it grows from the origin and is the whole shape when the hit lands. A line grows
// along its length only. `minGrowth` keeps the first frame from being an empty point.
export function growth(progress, rules = TELEGRAPH) {
  return rules.minGrowth + (1 - rules.minGrowth) * Math.min(1, Math.max(0, progress));
}

// Opacity at `progress` between a start and an end value (the data's fill and edge rows); reduced motion shows `still` all the way.
export function opacityAt(progress, start, end, still = null) {
  return still ?? start + (end - start) * Math.min(1, Math.max(0, progress));
}
