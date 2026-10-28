// Viral death cam, the capture half (Lead, 28 Oct). A rolling in-memory ring of SMALL frames: a few times a second the game canvas is
// copied (one GPU drawImage) into a pooled 2D canvas; no video encoder runs during play. When a shareable moment fires (the player's
// death, a boss kill, a big blast, a close escape) its last buffer.seconds of frames are frozen by reference, and the encoder
// (share-encode.js) turns them into a file only if the player taps SHARE. Nothing is uploaded or saved. Rows: data/shareClip.json.
// Off switch: ?noshare=1. The quality tier row decides the sampling rate; fps 0 (low) keeps no ring at all, only a still on the moment.
import { GAME_DATA } from "./game-data.js";
import { QUALITY } from "./quality-tier.js";

export const shareEnabled = (rows, search = globalThis.location?.search ?? "") =>
  new URLSearchParams(search).get(rows.flagParam) === rows.offValue ? false : rows.defaultOn;

// The centre crop of a source canvas to the clip's aspect ratio, in source pixels.
export function cropRect(width, height, aspect) {
  if (width / height > aspect) {
    const w = Math.round(height * aspect);
    return { x: (width - w) >> 1, y: 0, w, h: height };
  }
  const h = Math.round(width / aspect);
  return { x: 0, y: (height - h) >> 1, w: width, h };
}

// Does this event fire the moment row? `game.player` is the one body the death and close-call rows are about.
function matches(row, event, game) {
  if (row.trigger === "playerDeath") return event.type === "death" && event.actor === game.player;
  if (row.trigger === "flaggedDeath")
    return event.type === "death" && event.actor !== game.player && row.flags.some((flag) => !!event.actor?.[flag]);
  if (row.trigger === "blast") return row.events.includes(event.type) && (event.radius ?? 0) >= row.minRadius;
  return false;
}

export function createShareClip({
  rows = GAME_DATA.shareClip,
  search = globalThis.location?.search ?? "",
  tier = () => QUALITY.row().name,
  makeCanvas = () => globalThis.document.createElement("canvas"),
} = {}) {
  const on = shareEnabled(rows, search),
    aspect = rows.buffer.width / rows.buffer.height,
    windowMs = rows.buffer.seconds * 1000,
    keepMs = windowMs + 1000 * Math.max(...rows.moments.map((m) => m.tailSeconds)),
    closeRow = rows.moments.find((m) => m.trigger === "closeCall"),
    cooldowns = new Map(),
    listeners = new Set(),
    pool = [];
  let clock = 0,
    lastSample = -Infinity,
    ring = [],
    pending = [],
    frozen = false,
    closeAt = null,
    player = null,
    death = null,
    best = null;

  const canvasOf = (width, height) => {
    const canvas = makeCanvas();
    canvas.width = width;
    canvas.height = height;
    return canvas;
  };
  const takeFrame = () => pool.pop() ?? { canvas: canvasOf(rows.buffer.width, rows.buffer.height), t: 0, holds: 0 };
  const hold = (frame) => {
    frame.holds++;
  };
  const drop = (frame) => {
    if (--frame.holds > 0) return;
    if (pool.length < Math.ceil((keepMs / 1000) * Math.max(...Object.values(rows.tiers).map((t) => t.fps)))) pool.push(frame);
  };
  const drawInto = (canvas, source) => {
    if (!source?.width || !source?.height) return false;
    const r = cropRect(source.width, source.height, aspect);
    canvas.getContext("2d").drawImage(source, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
    return true;
  };
  const release = (clip) => {
    for (const frame of clip?.frames ?? []) drop(frame);
  };
  const emptyRing = () => {
    for (const frame of ring) drop(frame);
    ring = [];
  };

  function fire(row) {
    const free = cooldowns.get(row.id) ?? -Infinity;
    if (clock < free || pending.some((p) => p.row.id === row.id)) return;
    cooldowns.set(row.id, clock + row.cooldownSeconds * 1000);
    pending.push({ row, dueAt: clock + row.tailSeconds * 1000 });
  }

  // A moment's tail is over: freeze its window by reference, take one larger still of the screen as it is now.
  function settle(source) {
    const due = pending.filter((p) => p.dueAt <= clock).sort((a, b) => a.dueAt - b.dueAt);
    if (!due.length) return;
    pending = pending.filter((p) => !due.includes(p));
    // Every window is cut from the ring BEFORE a death empties it, so a boss kill in the same step keeps its frames.
    const made = due.map(({ row, dueAt }) => {
      const frames = ring.filter((f) => f.t > dueAt - windowMs && f.t <= dueAt),
        still = canvasOf(rows.still.width, rows.still.height);
      if (!drawInto(still, source) && frames.length) drawInto(still, frames.at(-1).canvas);
      frames.forEach(hold);
      const span = frames.length > 1 ? frames.at(-1).t - frames[0].t : 0;
      return { row, clip: { id: row.id, priority: row.priority, frames, still, fps: span ? ((frames.length - 1) * 1000) / span : 0, at: dueAt } };
    });
    for (const { row, clip } of made) {
      if (row.trigger === "playerDeath") {
        release(death);
        death = clip;
        frozen = true;
      } else if (!best || row.priority >= best.priority) {
        release(best);
        best = clip;
      } else release(clip);
      for (const fn of listeners) fn(clip);
    }
    if (frozen) {
      emptyRing();
      pending = []; // a moment still waiting its tail would be cut from an empty ring
    }
  }

  return {
    enabled: on,
    // After each simulation step: the step's events. Moments fire here; they settle a tail later (capture).
    observe(events, game) {
      if (!on || frozen) return;
      player = game.player;
      for (const event of events) {
        for (const row of rows.moments) if (matches(row, event, game)) fire(row);
        if (closeRow && event.type === "hit" && event.actor === player && closeAt === null) {
          const left = player.hp / player.maxHP;
          if (left > 0 && left <= closeRow.hpFraction) closeAt = clock;
        }
      }
    },
    // Right after the WebGL render, in the same task (the drawing buffer is valid only then); `seconds` is the frame's play time.
    capture(source, seconds) {
      if (!on) return;
      clock += Math.min(seconds, rows.buffer.gapSeconds) * 1000;
      if (closeAt !== null && closeRow) {
        if (player.hp <= 0) closeAt = null;
        else if (clock - closeAt >= closeRow.surviveSeconds * 1000) {
          closeAt = null;
          fire(closeRow);
        }
      }
      const fps = rows.tiers[tier()]?.fps ?? 0;
      if (!fps) emptyRing();
      else if (!frozen && clock - lastSample >= 1000 / fps) {
        const frame = takeFrame();
        if (drawInto(frame.canvas, source)) {
          lastSample = clock;
          frame.t = clock;
          frame.holds = 1;
          ring.push(frame);
        } else pool.push(frame);
        while (ring.length && clock - ring[0].t > keepMs) drop(ring.shift());
      }
      settle(source);
    },
    // Forget everything: a new life, an area change, a hidden tab. The pool keeps its canvases for the next run.
    reset() {
      emptyRing();
      release(death);
      release(best);
      death = best = player = closeAt = null;
      pending = [];
      cooldowns.clear();
      frozen = false;
      lastSample = -Infinity;
    },
    // A hidden tab or a stall: older frames no longer join the next ones into one continuous clip.
    gap() {
      emptyRing();
      closeAt = null;
    },
    clips: () => ({ death, best }),
    // The tiers' hold on memory, for tests and the phone console.
    size: () => ({ ring: ring.length, pool: pool.length, pending: pending.length, frozen }),
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
