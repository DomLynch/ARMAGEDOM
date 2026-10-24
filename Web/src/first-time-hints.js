// First-time hints (first-time-hints.json): each row shows once, for a few seconds, on the
// existing notice line. "Seen" ids live in their own localStorage key, never in the run save.
import table from "./first-time-hints.json" with { type: "json" };

export const HINT_STORAGE_KEY = "armagedom.firstTimeHints.v1";
export const HINT_SECONDS = 5;
const PISTOL_REACH = 1.3;

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const alive = (e) => e.hp > 0;

// One check per `when` key; each answers "is this lesson relevant right now?".
const checks = {
  enemyWithin: (meters, { g }) =>
    g.enemies.some((e) => alive(e) && !e.bossProfile && distance(e.pos, g.player.pos) <= meters),
  tookHit: (_, { tookHit }) => tookHit,
  pistolPickup: (_, { g }) => {
    const pistol = g.pistol;
    return (
      !!pistol &&
      !pistol.collected &&
      (g.world?.areaId ?? "westminster") === pistol.pickupAreaId &&
      distance(g.player.pos, pistol.pickupPos) <= PISTOL_REACH
    );
  },
  nearExit: (_, { g }) => !!g.world?.exitHint?.(g.player.pos),
  bossWithin: ({ name, meters }, { g }) =>
    g.enemies.some((e) => alive(e) && e.bossProfile?.name === name && distance(e.pos, g.player.pos) <= meters),
};

export function validateHintTable(rows) {
  const ids = new Set();
  for (const row of rows) {
    const keys = Object.keys(row.when ?? {});
    if (typeof row.id !== "string" || ids.has(row.id)) throw Error("Invalid or duplicate hint id");
    if (typeof row.text !== "string" || !row.text || row.text.length > 80) throw Error("Invalid hint text: " + row.id);
    if (keys.length !== 1 || !Object.hasOwn(checks, keys[0])) throw Error("Unknown hint trigger: " + row.id);
    ids.add(row.id);
  }
  return rows;
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function createFirstTimeHints({ storage = browserStorage(), rows = table } = {}) {
  validateHintTable(rows);
  const seen = new Set();
  try {
    const stored = JSON.parse(storage?.getItem(HINT_STORAGE_KEY) ?? "[]");
    if (Array.isArray(stored)) for (const id of stored) if (typeof id === "string") seen.add(id);
  } catch {
    /* Unreadable or unavailable storage only means hints may show again. */
  }
  let tookHit = false;
  let active = null;
  let lastTime = 0;
  function remember(id) {
    seen.add(id);
    try {
      storage?.setItem(HINT_STORAGE_KEY, JSON.stringify([...seen]));
    } catch {
      /* Hints still show once per page load without storage. */
    }
  }
  return {
    // The existing game event stream: a "hit" whose actor is the player is the first hit taken.
    observe(g) {
      for (const event of g.events ?? []) if (event.type === "hit" && event.actor === g.player) tookHit = true;
    },
    // Text for the notice line, or "". Starts the next unseen relevant row when none is showing.
    // A live game message owns the line, so a hint neither starts nor runs down underneath it.
    current(g) {
      const elapsed = Math.min(Math.max(g.time - lastTime, 0), 1);
      lastTime = g.time;
      if (g.finished || g.player.hp <= 0 || g.time < (g.messageUntil ?? 0)) return "";
      if (active) {
        active.left -= elapsed;
        if (active.left > 0) return active.text;
        active = null;
      }
      for (const row of rows) {
        if (seen.has(row.id)) continue;
        const [[key, argument]] = Object.entries(row.when);
        if (!checks[key](argument, { g, tookHit })) continue;
        remember(row.id);
        active = { text: row.text, left: HINT_SECONDS };
        return row.text;
      }
      return "";
    },
  };
}
