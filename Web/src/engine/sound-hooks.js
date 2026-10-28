import { GAME_DATA } from "./game-data.js";

// data/soundHooks.json -> cues. Pure: events in, a short list of cue plans out; donor-audio.js turns a plan into oscillators and noise.
// The loop hands in the events of one frame (both sides of each step, see engine/loop.js) with the player and a clock in seconds.
// A row is matched on its event type and its `match` keys; target (player, boss, enemy) and lethal are derived from the event's actor.
// Limits come from the rows: a per-row gap and voice count, the mix's total voice count and per-batch cap, and priority decides who is
// dropped when the mix is full. Distance fades a cue to mix.farGain at hearingRange and silences it beyond.
export const soundHooksEnabled = (data = GAME_DATA.soundHooks, search = globalThis.location?.search ?? "") =>
  new URLSearchParams(search).get(data.flagParam) === data.offValue ? false : data.defaultOn;

const targetOf = (actor, player) => (!actor ? "none" : actor === player ? "player" : actor.bossProfile ? "boss" : "enemy");
const field = (event, key, player) =>
  key === "target" ? targetOf(event.actor, player) : key === "lethal" ? !!event.actor && event.actor.hp <= 0 : event[key];
const same = (want, got) => (Array.isArray(want) ? want.includes(got) : want === got);
export const rowMatches = (row, event, player) =>
  row.enabled &&
  row.event === event.type &&
  !(event.type === "hit" && (event.blocked || !(event.amount > 0))) &&
  Object.entries(row.match ?? {}).every(([key, want]) => same(want, field(event, key, player)));

const distanceGain = (mix, range, event, player) => {
  const at = event.position ?? event.actor?.pos;
  if (!at || !player?.pos) return 1;
  const share = Math.hypot(at.x - player.pos.x, at.z - player.pos.z) / range;
  return share >= 1 ? 0 : 1 - (1 - mix.farGain) * share;
};

export function createSoundHooks({ data = GAME_DATA.soundHooks, random = Math.random } = {}) {
  const byEvent = new Map(),
    lastAt = new Map(), // row id -> clock of its last cue
    live = []; // { id, until } of cues still sounding
  for (const row of data.rows)
    if (row.enabled) byEvent.set(row.event, [...(byEvent.get(row.event) ?? []), row]);
  return {
    // events: one frame's events; player: the player actor (distance and target); time: a clock in seconds.
    plan(events, { player, time }) {
      const found = [];
      for (const event of events)
        for (const row of byEvent.get(event.type) ?? [])
          if (rowMatches(row, event, player)) found.push({ row, event });
      if (!found.length) return [];
      for (let i = live.length - 1; i >= 0; i--) if (live[i].until <= time) live.splice(i, 1);
      found.sort((a, b) => b.row.priority - a.row.priority);
      const out = [];
      for (const { row, event } of found) {
        if (out.length >= data.mix.maxPerBatch || live.length >= data.mix.maxVoices) break;
        if (time - (lastAt.get(row.id) ?? -Infinity) < row.minGapSeconds) continue;
        if (live.filter((v) => v.id === row.id).length >= row.voices) continue;
        const near = row.distance ? distanceGain(data.mix, data.mix.hearingRange, event, player) : 1;
        if (near <= 0) continue;
        const pitch = 1 + (random() * 2 - 1) * row.pitchVariance; // tuning-ok: unit random to -1..1
        lastAt.set(row.id, time);
        live.push({ id: row.id, until: time + Math.max(row.tone?.seconds ?? 0, row.noise?.seconds ?? 0) });
        out.push({ id: row.id, gain: row.gain * near, pitch, tone: row.tone, noise: row.noise });
      }
      return out;
    },
    reset() {
      lastAt.clear();
      live.length = 0;
    },
  };
}

// Burning loop level: how many flamed actors (living or corpses) are in earshot, capped at the burn presentation's own actor cap.
export function burnLevel(game, burn = GAME_DATA.soundHooks.burn, cap = GAME_DATA.burnPresentation.maxActors) {
  if (!burn.enabled || !game?.player?.pos) return 0;
  let n = 0;
  for (const list of [game.enemies, game.corpses])
    for (const e of list ?? [])
      if (
        e.flameBurnUntil > game.time &&
        Math.hypot(e.pos.x - game.player.pos.x, e.pos.z - game.player.pos.z) <= burn.hearingRange
      )
        n++;
  return Math.min(n, cap);
}
