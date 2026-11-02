// Boss convergence on a point of interest (the airdrop crate, a body bag). The boss hook (combat.js residentPatrol) asks once per boss per
// step: a boss that is not already fighting the player walks to the point and waits beside it. `target` is { at, pull } (the point and the
// data row with engageRadius, leashPadding, arriveRadius) or null when nothing is calling. Returns true when it handled the boss's idle
// step. `move` is combat's own enemy mover, so bosses walk the way they always do.
import { distance } from "./shared-checks.js";

export function converge(g, e, dt, move, target) {
  if (!target || !e.bossProfile || e.hp <= 0) {
    if (e.stockIntent) [e.residentIntent, e.stockIntent] = [e.stockIntent, undefined]; // the point is gone: the boss's own leash is back
    return false;
  }
  const { at, pull } = target;
  // A boss only wakes for a player within its home leash; the point may lie beyond it, so stretch the leash to cover the point.
  if (!e.stockIntent) e.stockIntent = e.residentIntent;
  const reach = distance(e.home ?? e.pos, at) + pull.leashPadding;
  if (e.residentIntent && e.residentIntent.homeLeash < reach) e.residentIntent = Object.freeze({ ...e.stockIntent, homeLeash: reach });
  // A boss already chasing the player keeps at it inside engageRadius; an idle one answers the point unless it can see the player
  // from close enough to wake (the same test the boss uses to wake, so it never stalls beside a wall it cannot wake through).
  const apart = distance(e.pos, g.player.pos);
  if (e.alerted ? apart <= pull.engageRadius : apart <= e.bossProfile.wakeDistance && g.world.lineClear(e.pos, g.player.pos)) return false;
  e.alerted = false;
  e.returning = false;
  const gap = distance(e.pos, at);
  if (gap > pull.arriveRadius) move(g, e, { x: (at.x - e.pos.x) / gap, z: (at.z - e.pos.z) / gap }, e.moveSpeed, dt);
  return true;
}
