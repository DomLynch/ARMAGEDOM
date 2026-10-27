import { GAME_DATA } from "./game-data.js";
import { webText } from "./web-text.js";
import { applyAirdropOutcome } from "./airdrop-effects.js";

// The supply airdrop (data/airdrop.json): every few minutes in a combat area a plane passes and drops a crate with a red flare somewhere
// the player can walk to. Bosses of the area walk to the crate, and holding still beside it opens it for a loot bundle and a small chance of
// a golden weapon. State lives on `g.airdrop` (the view reads it, nothing is saved); this file owns the timeline, the landing spot, the
// boss pull and the opening. Phases: idle -> plane (crate not yet released) -> falling -> landed -> idle.
const TURN = Math.PI + Math.PI,
  // ?airdrop=0 switches the feature off for one page load (the feature itself is on by default).
  SWITCHED_OFF = new URLSearchParams(globalThis.location?.search ?? "").get("airdrop") === "0",
  distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z),
  chance = (g) => (g.random ?? Math.random)(),
  between = (g, low, high) => low + (high - low) * chance(g),
  enabledIn = (areaId) =>
    !SWITCHED_OFF && GAME_DATA.airdrop.enabled && typeof areaId === "string" && !GAME_DATA.airdrop.excludedAreas.includes(areaId);

const toast = (g, text) => {
  g.message = text;
  g.messageUntil = g.time + GAME_DATA.airdrop.schedule.toastSeconds;
};

// A spot the player can walk to in a straight line, clear of walls, and not on or beside an exit trigger.
export function pickLanding(g) {
  const { landing } = GAME_DATA.airdrop,
    world = g.world,
    from = g.player.pos,
    onExit = (p) => !!world.travelAt?.(p);
  if (!world.geometry?.clear) return null;
  const bosses = (g.enemies ?? []).filter((e) => e.bossProfile && e.hp > 0);
  let fallback = null;
  for (let tries = 0; tries < landing.attempts; tries++) {
    const angle = chance(g) * TURN,
      reach = between(g, landing.minDistance, landing.maxDistance),
      spot = { x: from.x + Math.cos(angle) * reach, z: from.z + Math.sin(angle) * reach };
    if (!world.geometry.clear(spot, landing.bodyRadius) || !world.lineClear(from, spot) || onExit(spot)) continue;
    let nearExit = false;
    for (let i = 0; i < landing.exitSamples && !nearExit; i++) {
      const turn = (i / landing.exitSamples) * TURN;
      nearExit = onExit({ x: spot.x + Math.cos(turn) * landing.exitClearance, z: spot.z + Math.sin(turn) * landing.exitClearance });
    }
    if (nearExit) continue;
    // Bosses walk straight to the crate, so a spot every living boss can see is better than one a wall hides; take the first
    // such spot, or else the first spot the player alone can reach.
    if (bosses.every((boss) => world.lineClear(boss.pos, spot))) return spot;
    fallback ??= spot;
  }
  return fallback;
}

function launch(g, a, spot) {
  const { plane, crate, schedule } = GAME_DATA.airdrop,
    heading = chance(g) * TURN,
    dir = { x: Math.cos(heading), z: Math.sin(heading) };
  Object.assign(a, {
    phase: "plane",
    crate: spot,
    startAt: g.time,
    from: { x: spot.x - dir.x * plane.halfSpan, z: spot.z - dir.z * plane.halfSpan },
    to: { x: spot.x + dir.x * plane.halfSpan, z: spot.z + dir.z * plane.halfSpan },
    dropAt: g.time + plane.seconds * plane.dropFraction,
    hold: 0,
    nextAt: g.time + schedule.intervalSeconds,
  });
  a.landAt = a.dropAt + crate.fallSeconds;
  toast(g, webText("airdrop.incoming"));
}

// Applies the bundle, then rolls the bonus table once. Returns the toast text.
function open(g) {
  const { loot } = GAME_DATA.airdrop;
  let cash = 0;
  for (const row of loot.bundle) {
    const result = applyAirdropOutcome(g, row);
    if (row.id === "cash") cash = result || 0;
  }
  let roll = chance(g) * loot.bonus.reduce((sum, row) => sum + row.weight, 0),
    golden = false;
  for (const row of loot.bonus) {
    roll -= row.weight;
    if (roll >= 0) continue;
    golden = row.id !== "none" && !!applyAirdropOutcome(g, row);
    break;
  }
  return webText(golden ? "airdrop.openedGolden" : "airdrop.opened", { cash });
}

function hudLine(g, a) {
  if (a.phase === "falling") return webText("airdrop.hudFalling");
  if (a.phase !== "landed") return "";
  const progress = a.hold / GAME_DATA.airdrop.crate.holdSeconds;
  return progress > 0
    ? webText("airdrop.hudOpening", { percent: Math.round(progress * 100) })
    : webText("airdrop.hud", { distance: Math.round(distance(g.player.pos, a.crate)) });
}

export function stepAirdrop(g, dt) {
  const areaId = g.world?.areaId;
  if (!enabledIn(areaId)) {
    g.airdrop = null;
    return;
  }
  const { schedule, crate } = GAME_DATA.airdrop;
  // A new area (or a first look) starts a fresh clock; a crate left behind in the old area is simply gone.
  let a = g.airdrop;
  if (!a || a.areaId !== areaId) {
    const wait = between(g, schedule.firstDelayMin, schedule.firstDelayMax);
    a = g.airdrop = { areaId, phase: "idle", nextAt: g.time + wait, hud: "" };
  }
  if (a.phase === "idle" && g.time >= a.nextAt) {
    const spot = pickLanding(g);
    if (spot) launch(g, a, spot);
    else a.nextAt = g.time + schedule.retrySeconds;
  }
  if (a.phase === "plane" && g.time >= a.dropAt) a.phase = "falling";
  if (a.phase === "falling" && g.time >= a.landAt) {
    a.phase = "landed";
    a.expiresAt = g.time + crate.lifetimeSeconds;
  }
  if (a.phase === "landed") {
    const near = g.player.hp > 0 && distance(g.player.pos, a.crate) <= crate.openRadius;
    a.hold = near ? a.hold + dt : Math.max(0, a.hold - crate.holdDecayPerSecond * dt);
    if (a.hold >= crate.holdSeconds) {
      toast(g, open(g));
      a.phase = "idle";
    } else if (g.time >= a.expiresAt) {
      toast(g, webText("airdrop.lost"));
      a.phase = "idle";
    }
  }
  a.hud = hudLine(g, a);
}

// The boss hook (combat.js residentPatrol): a boss that is not already fighting the player walks to the crate and waits beside it.
// Returns true when it handled the boss's idle step. `move` is combat's own enemy mover, so bosses walk the way they always do.
export function airdropPull(g, e, dt, move) {
  const a = g.airdrop,
    pull = GAME_DATA.airdrop.convergence;
  if (!pull.enabled || !a || !e.bossProfile || e.hp <= 0 || (a.phase !== "falling" && a.phase !== "landed")) return false;
  // A boss already chasing the player keeps at it inside engageRadius; an idle one answers the crate unless the player is close enough to wake it.
  if (distance(e.pos, g.player.pos) <= (e.alerted ? pull.engageRadius : e.bossProfile.wakeDistance)) return false;
  e.alerted = false;
  e.returning = false;
  const gap = distance(e.pos, a.crate);
  if (gap > pull.arriveRadius) move(g, e, { x: (a.crate.x - e.pos.x) / gap, z: (a.crate.z - e.pos.z) / gap }, e.moveSpeed, dt);
  return true;
}
