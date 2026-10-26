import { GAME_DATA } from "./engine/game-data.js";
// Presentation only. Caller keeps gameplay/finisher dt unchanged and owns transforms.
// Kick, hold and decay numbers: data/visual.json `combatImpact`.
const IMPACT = GAME_DATA.visual.combatImpact;
const finite = (value) => (Number.isFinite(value) ? value : 0);
const seconds = (value) => Math.max(0, finite(value));
const strength = (value) => (value === undefined ? 1 : Math.max(0, Math.min(1, finite(value))));
function direction(x, y) {
  x = finite(x);
  y = finite(y);
  const max = Math.max(Math.abs(x), Math.abs(y));
  if (!max) return [0, 0];
  x /= max;
  y /= max;
  const length = Math.hypot(x, y);
  return [x / length, y / length];
}
const decay = (value, dt, rate) => {
  const next = value * Math.exp(-dt * rate);
  return Math.abs(next) < IMPACT.settleBelow ? 0 : next;
};
function settings({ mode = "high", reducedMotion = false } = {}) {
  let requested = mode,
    reduced = !!reducedMotion;
  const effective = () => (requested === "off" ? "off" : requested === "high" && !reduced ? "high" : "low");
  return {
    mode: effective,
    configure(next = {}) {
      if (next.mode !== undefined) requested = next.mode;
      if (next.reducedMotion !== undefined) reduced = !!next.reducedMotion;
    },
    energy: () => (effective() === "off" ? 0 : effective() === "low" ? IMPACT.lowEnergy : 1),
  };
}

export function createCombatImpact(options) {
  const config = settings(options);
  let shot = 0,
    hold = 0,
    cameraX = 0,
    cameraY = 0,
    cameraAge = 0,
    pistol = true;
  function reset() {
    shot = hold = cameraX = cameraY = cameraAge = 0;
    pistol = true;
  }
  function snapshot() {
    const wave = Math.cos(cameraAge * IMPACT.waveRate);
    return { mode: config.mode(), shot, hold, cameraX: cameraX * wave, cameraY: cameraY * wave };
  }
  return {
    // x/y: screen-right/screen-down direction, explicitly projected by caller.
    event({ type, x = 0, y = 0, pistol: isPistol = true, strength: value } = {}) {
      if (!["shot", "hit", "death"].includes(type)) return false;
      const amount = strength(value);
      if (!amount) return false;
      if (type === "shot") {
        pistol = !!isPistol;
        shot = config.energy() * amount;
      } else if (config.mode() === "high") hold = Math.max(hold, type === "death" ? IMPACT.holdSeconds.death : isPistol ? IMPACT.holdSeconds.pistol : IMPACT.holdSeconds.other);
      if (config.mode() === "high") {
        const [dx, dy] = direction(x, y);
        const kick = (type === "death" ? IMPACT.kick.death : type === "hit" ? IMPACT.kick.hit : IMPACT.kick.shot) * amount;
        // Same sign for shot and hit: opposing impulses cancelled the donor cue.
        cameraX -= dx * kick;
        cameraY -= dy * kick;
        const length = Math.hypot(cameraX, cameraY);
        if (length > IMPACT.kick.max) {
          cameraX *= IMPACT.kick.max / length;
          cameraY *= IMPACT.kick.max / length;
        }
        cameraAge = 0;
      }
      return true;
    },
    update(dt, { paused = false } = {}) {
      if (!paused) {
        dt = seconds(dt);
        const visualDt = Math.max(0, dt - hold);
        hold = Math.max(0, hold - dt);
        shot = decay(shot, visualDt, pistol ? IMPACT.decayRate.shotPistol : IMPACT.decayRate.shotOther);
        cameraX = decay(cameraX, dt, IMPACT.decayRate.camera);
        cameraY = decay(cameraY, dt, IMPACT.decayRate.camera);
        // Once settled, avoid unbounded phase or Infinity for extreme finite dt.
        cameraAge = cameraX || cameraY ? (cameraAge + dt) % ((2 * Math.PI) / IMPACT.waveRate) : 0;
      }
      return snapshot();
    },
    configure(next) {
      config.configure(next);
      reset();
    },
    reset,
  };
}

export function createHitReaction(options) {
  const config = settings(options);
  let energy = 0,
    hold = 0,
    x = 0,
    z = 0,
    killed = false;
  function reset() {
    energy = hold = x = z = 0;
    killed = false;
  }
  return {
    // x/z: domain ground direction. WebUI maps it once in its victim composer.
    hit({ x: dx = 0, z: dz = 0, killed: lethal = false, strength: value } = {}) {
      const amount = strength(value);
      if (!amount) return false;
      [x, z] = direction(dx, dz);
      killed = !!lethal;
      energy = config.energy() * amount;
      hold = config.mode() === "high" ? (killed ? IMPACT.reactionHoldSeconds.killed : IMPACT.reactionHoldSeconds.hit) : 0;
      return true;
    },
    update(dt, { paused = false } = {}) {
      if (!paused) {
        dt = seconds(dt);
        const visualDt = Math.max(0, dt - hold);
        hold = Math.max(0, hold - dt);
        energy = decay(energy, visualDt, killed ? IMPACT.decayRate.reactionKilled : IMPACT.decayRate.reaction);
      }
      return { mode: config.mode(), energy, hold, x, z, killed };
    },
    configure(next) {
      config.configure(next);
      reset();
    },
    reset,
  };
}
