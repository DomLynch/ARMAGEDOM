import { GAME_DATA } from "./game-data.js";

// Boss taunts (data/bossTaunts.json): short text lines on the HUD message line, presentation only. The loop calls observe(game, events)
// after each step. A boss is told apart by its id; each kind (spawn, aggro, hurt, death) fires once per boss. A fired line waits in one
// slot and is written to game.message only when no message is live (a "Switched to X." or a pickup line is never covered), at most one per
// minGapSeconds; a higher kind replaces a lower one waiting, and a line that waited longer than waitSeconds is dropped.
export const tauntsEnabled = (data = GAME_DATA.bossTaunts, search = globalThis.location?.search ?? "") =>
  new URLSearchParams(search).get(data.flagParam) === data.offValue ? false : data.defaultOn;

export function createBossTaunts({ data = GAME_DATA.bossTaunts, random = Math.random } = {}) {
  const seen = new Map(); // boss id -> kinds already fired
  let pending = null,
    lastShown = -Infinity;
  const fire = (boss, kind, time) => {
    const done = seen.get(boss.id) ?? new Set(),
      lines = data.bosses[boss.bossName]?.[kind];
    seen.set(boss.id, done);
    if (done.has(kind) || !lines) return;
    done.add(kind);
    if (pending && data.kindPriority[pending.kind] >= data.kindPriority[kind]) return;
    pending = { kind, text: lines[Math.floor(random() * lines.length)], since: time };
  };
  return {
    observe(game, events = []) {
      const time = game.time,
        p = game.player?.pos;
      for (const boss of game.enemies ?? []) {
        if (!boss.bossProfile || !(boss.hp > 0)) continue;
        if (p && Math.hypot(boss.pos.x - p.x, boss.pos.z - p.z) <= data.spawnRange) fire(boss, "spawn", time);
        if (boss.alerted) fire(boss, "aggro", time);
        if (boss.hp <= boss.maxHP * data.hurtShare) fire(boss, "hurt", time);
      }
      for (const e of events) if (e.type === "boss-defeated" && e.actor?.bossProfile) fire(e.actor, "death", time);
      if (!pending) return;
      if (time - pending.since > data.waitSeconds) pending = null;
      else if (time >= (game.messageUntil ?? 0) && time - lastShown >= data.minGapSeconds) {
        game.message = pending.text;
        game.messageUntil = time + data.showSeconds;
        lastShown = time;
        pending = null;
      }
    },
    reset() {
      seen.clear();
      pending = null;
      lastShown = -Infinity;
    },
  };
}
