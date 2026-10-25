// First-time hints (first-time-hints.json): each row shows once, for a few seconds, on the
// existing notice line. "Seen" ids live in their own localStorage key, never in the run save.
import table from "./first-time-hints.json" with { type: "json" };

export const HINT_STORAGE_KEY = "armagedom.firstTimeHints.v1";
export const HINT_SECONDS = 5;
const PISTOL_REACH = 1.3;

const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const alive = (e) => e.hp > 0;
// The Ember Matron's drop is the Ember Projector boss-equipment pickup: pending, in its source area, on the ground.
const flameDropWithin = (g, meters) => {
  const data = g.world?.bossEquipmentData?.emberProjector,
    state = g.bossEquipment?.emberProjector;
  return (
    state?.status === "pending" &&
    g.world.areaId === data.source.areaId &&
    distance(g.player.pos, state.dropPosition) <= meters
  );
};

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
  flameEquipped: (_, { g }) => !!g.flame?.equipped,
  // The Ember Matron's drop is on the ground within reach.
  flameDropPickup: (_, { g }) => flameDropWithin(g, PISTOL_REACH),
  bossWithin: ({ name, meters }, { g }) =>
    g.enemies.some((e) => alive(e) && e.bossProfile?.name === name && distance(e.pos, g.player.pos) <= meters),
};

// Optional `stays` on a row (same shape as `when`): while it holds the hint stays up with no 5 s countdown, and it
// ends the moment it stops holding. Rows without it run for HINT_SECONDS.
const stays = {
  // The starting pistol is still on the ground and within `meters` of the player.
  pistolUncollectedWithin: (meters, { g }) => {
    const pistol = g.pistol;
    return (
      !!pistol &&
      !pistol.collected &&
      (g.world?.areaId ?? "westminster") === pistol.pickupAreaId &&
      distance(g.player.pos, pistol.pickupPos) <= meters
    );
  },
  flameDropUncollectedWithin: (meters, { g }) => flameDropWithin(g, meters),
};

export function validateHintTable(rows) {
  const ids = new Set();
  for (const row of rows) {
    const keys = Object.keys(row.when ?? {}),
      stayKeys = Object.keys(row.stays ?? {});
    if (stayKeys.length > 1 || (stayKeys.length && !Object.hasOwn(stays, stayKeys[0])))
      throw Error("Unknown hint stay condition: " + row.id);
    if (row.overMessage !== undefined && typeof row.overMessage !== "boolean")
      throw Error("Invalid overMessage: " + row.id);
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
  let resume = null;
  let over = false;
  const show = (hint) => {
    over = hint.overMessage;
    return hint.text;
  };
  function remember(id) {
    seen.add(id);
    try {
      storage?.setItem(HINT_STORAGE_KEY, JSON.stringify([...seen]));
    } catch {
      /* Hints still show once per page load without storage. */
    }
  }
  // A timed row is seen the moment it starts; a persistent (`stays`) row only once it has ended, so a parked one
  // that is somehow lost still comes back while its condition holds.
  const start = (row) => {
    if (!row.stays) remember(row.id);
    active = { id: row.id, text: row.text, left: HINT_SECONDS, stays: row.stays, overMessage: !!row.overMessage };
    return active;
  };
  const finish = (hint) => {
    if (hint.stays) remember(hint.id);
  };
  return {
    // The existing game event stream: a "hit" whose actor is the player is the first hit taken.
    observe(g) {
      for (const event of g.events ?? []) if (event.type === "hit" && event.actor === g.player) tookHit = true;
    },
    // Text for the notice line, or "". Starts the next unseen relevant row when none is showing.
    // True while the text returned by current() is a row marked `overMessage` (survival first), which the notice
    // line must show even over a live game message.
    get overMessage() {
      return over;
    },
    // A live game message owns the line, so a hint neither starts nor runs down underneath it; only an
    // `overMessage` row may start or keep running while one is showing.
    current(g) {
      const elapsed = Math.min(Math.max(g.time - lastTime, 0), 1);
      lastTime = g.time;
      over = false;
      if (g.finished || g.player.hp <= 0) return "";
      const messageShowing = g.time < (g.messageUntil ?? 0),
        fires = (row) => {
          const [[key, argument]] = Object.entries(row.when);
          return checks[key](argument, { g, tookHit });
        };
      // Survival first: an unseen `overMessage` row that fires now takes the line from an ordinary hint, which
      // resumes (a timed one with the time it had left) once the survival tip is done.
      if (active && !active.overMessage) {
        const urgent = rows.find((row) => row.overMessage && !seen.has(row.id) && fires(row));
        if (urgent) {
          // Park the hint once (never over one already parked) and start the urgent row itself, not the
          // first unseen row in table order.
          resume ??= active;
          return show(start(urgent));
        }
      }
      let spent = elapsed;
      while (active) {
        if (messageShowing && !active.overMessage) return "";
        const [stay] = Object.entries(active.stays ?? {});
        if (stay) {
          if (stays[stay[0]](stay[1], { g })) return show(active);
        } else {
          active.left -= spent;
          if (active.left > 0) return show(active);
        }
        finish(active);
        active = resume;
        resume = null;
        spent = 0;
      }
      for (const row of rows) {
        if (seen.has(row.id) || (messageShowing && !row.overMessage) || !fires(row)) continue;
        return show(start(row));
      }
      return "";
    },
  };
}
