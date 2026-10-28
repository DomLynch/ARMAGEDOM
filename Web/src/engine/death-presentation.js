// Boss and marked-hunter death presentation: a brief slow-motion plus a small camera push-in toward the dying body, then an ease back.
// Pure curve (presentationAt) + a tiny runtime. Rows: data/deathPresentation.json. Off switch: ?deathcam=0. Trash mobs are never eligible.
// Time: the loop scales the frame's elapsed seconds once (simulation, ragdoll and effects all see the same scaled dt); the camera and the
// curve's own clock use real seconds, so the slow window is bounded in wall time.
import { GAME_DATA } from "./game-data.js";

const ease = (x) => x * x * (3 - 2 * x); // smoothstep, monotone on [0,1]
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const IDLE = Object.freeze({ timeScale: 1, zoomMul: 1, weight: 0, active: false });

export const deathcamEnabled = (row, search = globalThis.location?.search ?? "") => {
  const v = new URLSearchParams(search).get(row.flagParam);
  return v === row.offValue ? false : row.defaultOn;
};
// Kinds the row names: an entity is eligible when any named field is truthy (markedHunter, bossProfile).
export const eligible = (row, entity) => !!entity && row.eligibleFlags.some((f) => !!entity[f]);
// Curve at `age` real seconds after the death. Slow-mo holds for slowSeconds, then eases back to exactly 1 over easeBackSeconds.
// The push-in ramps in over pushInSeconds, holds, and eases out over the same ease-back window; weight is the 0..1 push share.
export function presentationAt(row, age) {
  if (!(age >= 0) || age >= row.slowSeconds + row.easeBackSeconds) return IDLE;
  const back = clamp01((age - row.slowSeconds) / row.easeBackSeconds),
    inn = clamp01(age / row.pushInSeconds),
    weight = ease(inn) * (1 - ease(back));
  return {
    timeScale: age < row.slowSeconds ? row.timeScale : row.timeScale + (1 - row.timeScale) * ease(back),
    zoomMul: 1 + (row.zoomPushPct / 100) * weight,
    weight,
    active: true,
  };
}
// Runtime: observe(events) on each simulation step, tick(realSeconds) once per frame. `focus` is the body's ground point.
export function createDeathPresentation(row = GAME_DATA.deathPresentation, enabled = deathcamEnabled(row)) {
  // `since` = real seconds since the last effect started (Infinity = none yet). A death inside the cooldown never restarts the effect,
  // and the active seconds of one window are capped by maxTotalSlowSeconds, so chained deaths cannot hold the game in slow-mo.
  let age = -1,
    focus = null,
    since = Infinity;
  const reset = () => {
    age = -1;
    focus = null;
    since = Infinity;
  };
  return {
    observe(events) {
      if (!enabled || age >= 0 || since < row.retriggerCooldownSeconds) return;
      for (const e of events)
        if (e.type === "death" && eligible(row, e.actor)) {
          age = 0;
          since = 0;
          focus = { x: e.actor.pos.x, z: e.actor.pos.z };
          return;
        }
    },
    tick(realSeconds) {
      if (realSeconds > row.dtSpikeSeconds) reset(); // a stall / tab return: never replay the slow window afterwards
      const dt = Math.max(0, realSeconds);
      if (since !== Infinity) since += dt;
      if (age < 0) return IDLE;
      age += dt;
      const p = presentationAt(row, Math.min(age, row.maxTotalSlowSeconds));
      if (!p.active || age >= row.maxTotalSlowSeconds) {
        age = -1;
        focus = null;
        return IDLE;
      }
      return { ...p, focus, share: row.focusShare * p.weight };
    },
    // Effect to idle, scale exactly 1, camera focus cleared; also forgets the cooldown (player death, travel, hidden, session reset).
    reset,
    active: () => age >= 0,
  };
}
