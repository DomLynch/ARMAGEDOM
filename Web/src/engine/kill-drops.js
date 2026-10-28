import { GAME_DATA, fillText } from "./game-data.js";
import { grantCash, claimCash } from "./world-pickups-core.js";
import { starDropTier } from "./star-variants.js";
// Coins an enemy leaves when it dies (data/killDrops.json). Rules only: which tier a kill is, the cash it rolls, walk-over pickup,
// the carry-cap refusal and the claim noted for the server. Nothing here is drawn (engine/kill-drops-view.js) or saved: drops live on
// the run (`g.killDrops`) and are gone when the area changes. Off until `enabled` is true (the server must accept the `kill:*` sources).
// Each function takes the rules as its last argument so a test can pass an enabled copy of the frozen data.
export const KILL_DROPS = GAME_DATA.killDrops;
export const killDropsOn = (rules = KILL_DROPS) => rules.enabled === true;
export const tierOf = (e, rules = KILL_DROPS) =>
  starDropTier(e, e.bossProfile ? "boss" : (rules.rigTiers[e.rig] ?? rules.defaultTier), Object.keys(rules.tiers));
// A repeatable whole number in [min, max] from the kill's own labels and the run's counters, so one run state always rolls the same sum.
export function rollKillCash(g, tier, key, rules = KILL_DROPS) {
  const { seed, prime, modulus } = rules.roll,
    { min, max } = rules.tiers[tier],
    text = `${tier}|${key}|${g.kills ?? 0}|${Math.floor((g.time ?? 0) * 60)}`;
  let h = seed;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), prime) >>> 0;
  return min + Math.floor((h / modulus) * (max - min + 1));
}
export function killDropState(g) {
  return (g.killDrops ??= { list: [], serial: 0, notice: 0 });
}
// After each step: every enemy that died in that step's events leaves one drop where it fell. A marked hunter pays its bounty instead.
export function leaveKillDrops(g, rules = KILL_DROPS) {
  if (!killDropsOn(rules)) return 0;
  const state = killDropState(g);
  let left = 0;
  for (const ev of g.events ?? []) {
    const e = ev.type === "death" ? ev.actor : null;
    if (!e?.pos || e.markedHunter || e === g.player) continue;
    const tier = tierOf(e, rules);
    state.list.push({
      id: ++state.serial,
      areaId: g.world.areaId,
      tier,
      x: e.pos.x,
      z: e.pos.z,
      amount: rollKillCash(g, tier, e.placementKey ?? e.id ?? "", rules),
      until: g.time + rules.despawnSeconds,
    });
    left++;
  }
  // Oldest first out, so a crowd never leaves more than maxDrops lying about.
  while (state.list.length > rules.maxDrops) state.list.shift();
  return left;
}
// One fixed step: drop the expired and other-area rows, then take any the player stands on. A full wallet leaves the coins lying there.
export function stepKillDrops(g, rules = KILL_DROPS) {
  if (!killDropsOn(rules) || !g.killDrops) return;
  const state = g.killDrops,
    p = g.player,
    area = g.world.areaId,
    can = p.hp > 0 && !g.finished;
  state.list = state.list.filter((d) => d.areaId === area && g.time < d.until);
  if (!can) return;
  state.list = state.list.filter((d) => {
    if (Math.hypot(d.x - p.pos.x, d.z - p.pos.z) > rules.pickupRadius) return true;
    const amount = grantCash(g, d.amount);
    if (amount <= 0) {
      if (g.time >= state.notice) {
        state.notice = g.time + rules.refusalRepeatSeconds;
        g.message = rules.text.full;
        g.messageUntil = g.time + rules.noticeSeconds;
      }
      return true;
    }
    claimCash(g, rules.tiers[d.tier].source, amount, { x: d.x, z: d.z });
    g.message = fillText(rules.text.picked, { amount });
    g.messageUntil = g.time + rules.noticeSeconds;
    return false;
  });
}
