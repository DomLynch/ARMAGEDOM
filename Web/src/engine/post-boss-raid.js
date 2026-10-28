import { GAME_DATA } from "./game-data.js";
import { webText } from "./web-text.js";

// POST-BOSS RAID (data/postBossRaid.json): killing an area boss arms ONE raid. After the delay, while the player stands in a target zone
// (the hub or a road), marked hunters arrive through the Marked hunt's own entry and spawn, a few at a time (maxSimultaneous), until
// hunterCount have come or the window closes. They chase the player like any hunter (area pursuit, as the airdrop pulls bosses), wear the
// same LOD and ragdoll budget, and travel, death or a safehouse clears them. State lives on `g.raid`; nothing is saved.
const notify = (g, text) => {
  g.message = text;
  g.messageUntil = g.time + GAME_DATA.postBossRaid.messageSeconds;
};
const alive = (g) => g.enemies.filter((e) => e.raidHunter && e.hp > 0).length;

// After each step (loop.js, beside the golden-weapon roll): every boss kill event arms at most one raid, once, however often it is read.
export function armPostBossRaid(g) {
  const row = GAME_DATA.postBossRaid;
  if (!row.enabled) return;
  const seen = (g.raidSeen ??= new WeakSet());
  for (const e of g.events ?? []) {
    if (e.type !== row.trigger.event || seen.has(e)) continue;
    seen.add(e);
    if (g.raid || row.trigger.ignoreAreas.includes(g.world.areaId)) continue;
    const startAt = g.time + row.delaySeconds;
    g.raid = { startAt, endAt: g.time + row.durationSeconds, spawned: 0, live: 0, nextAt: startAt, areaId: g.world.areaId };
    notify(g, webText("raid.armed"));
  }
}

// Each step from the Marked hunt (marked-hunters.js): `entry` picks the arrival point, `spawn` builds a hunter, `open` is false when a
// safehouse or a finished run bars every hunter.
export function stepPostBossRaid(g, spawn, entry, open) {
  const row = GAME_DATA.postBossRaid,
    s = g.raid;
  if (!s) return;
  if (!row.enabled || g.player.hp <= 0 || g.time >= s.endAt) {
    if (row.enabled && g.player.hp > 0 && s.spawned > 0) notify(g, webText("raid.over"));
    g.raid = null;
    return;
  }
  if (g.time < s.startAt) return;
  const here = alive(g);
  if (s.areaId !== g.world.areaId) {
    s.spawned -= s.live - here; // travel cleared the raiders of the old area: they come again in the next target zone
    s.areaId = g.world.areaId;
  }
  s.live = here;
  if (s.spawned >= row.hunterCount && here === 0) {
    notify(g, webText("raid.over"));
    g.raid = null;
    return;
  }
  const room = Math.min(row.maxSimultaneous - here, row.hunterCount - s.spawned);
  if (!open || !row.targetZones.includes(g.world.areaId) || room <= 0 || g.time < s.nextAt) return;
  s.nextAt = g.time + row.retrySeconds;
  const at = entry(g);
  if (!at) return;
  for (let i = 0; i < room; i++) {
    const actor = spawn(at, g.world.markedData);
    actor.raidHunter = true;
    g.enemies.push(actor);
    g.events.push({ type: "marked-hunter-arrived", actor, position: { ...at } });
  }
  if (s.spawned === 0) notify(g, webText("raid.arrived"));
  s.spawned += room;
  s.live = here + room;
}
