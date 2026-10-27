import { GAME_DATA, fillText } from "./game-data.js";
import { radialBlastHits } from "./radial-blast.js";
// Booby-trapped crates (data/trapCrates.json). Walking into reach opens one: better loot than a normal pickup, then a grenade-style
// fuse runs with a beep cue, then the blast hits the player through the normal hit path, so a dodge roll's invulnerable window
// avoids it. A spent crate comes back after the respawn time, once it is off screen. Per-run state is `g.trapCrates`, keyed by
// crate id; it is not saved (a reload re-arms every crate), and the blast never touches enemies, so it needs no kill credit.
const DATA = GAME_DATA.trapCrates;
const BLAST = GAME_DATA.weapons.ranged[DATA.blast.profile].payload;
const PLAYER_VICTIM = "player";
export const TRAP_CRATE_TEXT = DATA.text;
export const trapCrateList = (areaId) => DATA.placements[areaId] ?? [];
// The loot adapter. Each effect returns what it granted. world/area-pickups owns the shared medkit and ammo effects; once it
// merges, these two functions call its effect functions instead (same inputs, same return) and nothing else here changes.
export function grantTrapCrateLoot(g, loot = DATA.loot) {
  const p = g.player,
    hp = Math.max(0, Math.min(p.maxHP - p.hp, p.maxHP * loot.healFraction));
  p.hp += hp;
  const cap = GAME_DATA.supplies.rules.reserveCap;
  const rounds = loot.refillReserve && g.pistol?.collected ? Math.max(0, cap - g.pistol.reserve) : 0;
  if (rounds) g.pistol.reserve += rounds;
  return { hp: Math.ceil(hp), rounds };
}
const ready = (g) => {
  const p = g.player;
  return p.hp > 0 && !g.finished && !p.swing && g.time >= p.hurtUntil && g.time >= p.dodgeUntil;
};
// Fuse beeps speed up from `first` seconds apart to `last` seconds apart as the fuse burns down.
export const nextBeepDelay = (burned, data = DATA) =>
  data.beepSeconds.first + (data.beepSeconds.last - data.beepSeconds.first) * Math.min(1, burned / data.fuseSeconds);
function open(g, crate, state, areaId) {
  const loot = grantTrapCrateLoot(g);
  state.phase = "fusing";
  state.areaId = areaId;
  state.openedAt = g.time;
  state.fuseEnd = g.time + DATA.fuseSeconds;
  state.nextBeep = g.time;
  g.message =
    loot.hp || loot.rounds ? fillText(DATA.text.opened, { hp: loot.hp, rounds: loot.rounds }) : DATA.text.openedNoLoot;
  g.messageUntil = g.time + DATA.fuseSeconds + 1;
  g.events.push({ type: "trap-crate-open", id: crate.id, position: { x: crate.x, z: crate.z }, ...loot });
}
function explode(g, crate, state, areaId, hitPlayer) {
  const position = { x: crate.x, z: crate.z },
    p = g.player;
  state.phase = "spent";
  state.respawnAt = g.time + DATA.respawnSeconds;
  state.blastAt = g.time;
  g.events.push({ type: "trap-crate-blast", id: crate.id, position, radius: BLAST.radius });
  const hits = radialBlastHits(
    position,
    areaId,
    [
      {
        victimId: PLAYER_VICTIM,
        areaId,
        position: { x: p.pos.x, z: p.pos.z },
        hp: p.hp,
        eligible: g.world.lineClear(position, p.pos),
      },
    ],
    BLAST,
  );
  for (const hit of hits) hitPlayer(g, { amount: hit.damage * DATA.blast.playerDamageScale, origin: position });
}
// One game step. `hitPlayer(g, { amount, origin })` is combat.js receiveHit; `pointOnScreen(position, margin)` is the render
// service (absent in headless runs, where a spent crate may re-arm at once).
export function stepTrapCrates(g, hitPlayer, services = {}) {
  const areaId = g.world.areaId,
    states = (g.trapCrates ??= {});
  for (const [id, state] of Object.entries(states))
    // Leaving the area defuses a lit fuse: the crate is spent and respawns on the usual timer.
    if (state.phase === "fusing" && state.areaId !== areaId)
      Object.assign(states[id], { phase: "spent", respawnAt: g.time + DATA.respawnSeconds });
  if (g.finished) return;
  const p = g.player;
  for (const crate of trapCrateList(areaId)) {
    const state = (states[crate.id] ??= { phase: "armed" });
    if (state.phase === "armed") {
      if (
        ready(g) &&
        Math.hypot(p.pos.x - crate.x, p.pos.z - crate.z) <= DATA.openRadius &&
        g.world.lineClear(p.pos, { x: crate.x, z: crate.z })
      )
        open(g, crate, state, areaId);
    } else if (state.phase === "fusing") {
      if (g.time + 1e-9 >= state.fuseEnd) explode(g, crate, state, areaId, hitPlayer);
      else if (g.time >= state.nextBeep) {
        g.events.push({ type: "trap-crate-beep", id: crate.id, position: { x: crate.x, z: crate.z } });
        state.nextBeep = g.time + nextBeepDelay(g.time - state.openedAt);
      }
    } else if (g.time >= state.respawnAt && !services.pointOnScreen?.({ x: crate.x, z: crate.z }, DATA.offscreenMargin))
      state.phase = "armed";
  }
}
