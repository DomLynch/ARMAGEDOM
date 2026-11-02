import { KNIFE_MOVES, KNIFE_STAMINA_COSTS, KNIFE_RULES } from "../donor/knife.js";
import { knifePaths } from "../donor/knife-paths.js";
import cleaverPaths from "../donor/cleaver-paths.json" with { type: "json" };
import { CLEAVER_ITEM_ID, UNIQUE_REWARDS } from "./unique-reward-runtime.js";
import { GAME_DATA } from "./game-data.js";
const freeze = (value) => {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
// The numbers live in Web/src/data/weapons.json `melee` (read through game-data.js); this file derives the rest from the knife.
const { boneSaw: BONE_SAW, cleaver: CLEAVER } = GAME_DATA.weapons.melee;
const cleaverLow = freeze(
  Object.fromEntries(
    Object.entries(CLEAVER.lowMoves).map(([rig, row]) => [rig, { ...row, range: KNIFE_MOVES.light_right.range }]),
  ),
);
// The same source age drives both measured blade samples and the displayed pose.
export function retimedMeleeAge(age, timing, source) {
  const w = timing.windup,
    a = timing.active,
    r = timing.recovery;
  if (
    !Number.isFinite(age) ||
    ![w, a, r, source.windup, source.active, source.recovery].every((n) => Number.isFinite(n) && n > 0)
  )
    throw Error("Invalid melee retiming");
  const t = Math.max(0, Math.min(w + a + r, age));
  return t < w
    ? (t / w) * source.windup
    : t < w + a
      ? source.windup + ((t - w) / a) * source.active
      : source.windup + source.active + ((t - w - a) / r) * source.recovery;
}
function reach(rows, move) {
  return Math.max(
    ...rows
      .slice(move.windupTicks, move.windupTicks + move.activeTicks)
      .flatMap((r) => [Math.hypot(r[0], r[2]), Math.hypot(r[3], r[5])]),
  );
}
export const CLEAVER_MOVES = freeze(
  Object.fromEntries(
    Object.entries(KNIFE_MOVES).map(([id, base]) => {
      if (!CLEAVER.moves[id]) return [id, base];
      const { damage, stamina, windupTicks, activeTicks, recoveryTicks, staggerTicks } = CLEAVER.moves[id];
      return [
        id,
        {
          ...base,
          damage,
          stamina,
          windupTicks,
          activeTicks,
          recoveryTicks,
          windup: windupTicks / 60,
          active: activeTicks / 60,
          recovery: recoveryTicks / 60,
          stagger: staggerTicks / 60,
          audioWeight: "heavy",
          sourceTiming: { windup: base.windupTicks, active: base.activeTicks, recovery: base.recoveryTicks },
          stepIn:
            (base.stepIn * (base.windupTicks - KNIFE_RULES.stepInFrom - 1)) /
            (windupTicks - KNIFE_RULES.stepInFrom - 1),
          range: base.range + Math.max(0, reach(cleaverPaths.hero[id], base) - reach(knifePaths.hero[id], base)),
        },
      ];
    }),
  ),
);
const contactPaths = freeze(
  Object.fromEntries(
    Object.entries(cleaverPaths.hero).map(([id, rows]) => {
      const move = CLEAVER_MOVES[id],
        timing = { windup: move.windupTicks, active: move.activeTicks, recovery: move.recoveryTicks };
      return [
        id,
        Array.from({ length: timing.windup + timing.active + timing.recovery + 1 }, (_, age) => {
          const at = retimedMeleeAge(age, timing, move.sourceTiming),
            index = Math.floor(at),
            next = rows[Math.min(index + 1, rows.length - 1)];
          return rows[index].map((value, i) => value + (next[i] - value) * (at - index));
        }),
      ];
    }),
  ),
);
const surgeonMoves = freeze(
  Object.fromEntries(
    Object.entries(KNIFE_MOVES).map(([id, base]) => [
      id,
      BONE_SAW.moves[id] ? { ...base, ...BONE_SAW.moves[id] } : base,
    ]),
  ),
);
export const MELEE_VARIANTS = freeze({
  "surgeons-knife-v1": {
    itemId: "surgeons-knife-v1",
    name: BONE_SAW.name,
    moves: surgeonMoves,
    costs: { ...KNIFE_STAMINA_COSTS, ...BONE_SAW.costs },
    modelRef: null,
    modelVariantId: BONE_SAW.modelVariantId,
    contact: BONE_SAW.contact,
    contactPaths: null,
    clipOverrides: null,
  },
  knife: {
    itemId: "knife",
    name: "Knife",
    moves: KNIFE_MOVES,
    costs: KNIFE_STAMINA_COSTS,
    contactPaths: null,
    clipOverrides: null,
  },
  [CLEAVER_ITEM_ID]: {
    ...UNIQUE_REWARDS[CLEAVER_ITEM_ID],
    moves: CLEAVER_MOVES,
    costs: CLEAVER.costs,
    contact: CLEAVER.contact,
    contactPaths,
    targeting: CLEAVER.targeting,
    lowMoves: cleaverLow,
    clipOverrides: CLEAVER.clipOverrides,
  },
});

function checkedPose(pose) {
  if (
    !pose ||
    typeof pose.clip !== "string" ||
    !pose.clip ||
    !["windupTicks", "activeTicks", "recoveryTicks"].every((k) => Number.isSafeInteger(pose[k]) && pose[k] > 0) ||
    !Number.isFinite(pose.range) ||
    pose.range <= 0
  )
    throw Error("Invalid melee contact pose");
  return pose.windupTicks + pose.activeTicks + pose.recoveryTicks;
}
// A weapon selects existing pose data; damage, energy and ordinary action cadence
// remain the selected weapon move's authority; its low pose is retimed with contact.
export function posedMeleeMove(base, action, pose) {
  const total = checkedPose(pose);
  if (!["slash", "stab", "heavy", "special"].includes(action)) return base;
  return {
    ...base,
    clip: pose.clip,
    path: null,
    ratLow: true,
    sourceContact: pose.windupTicks / total,
    native: false,
    contactPose: pose,
    ...(action === "slash" ? { moveId: pose.slashMoveId, range: pose.range, stepIn: 0, knockback: 0 } : {}),
  };
}
export function meleeContactPosePhase(swing) {
  const pose = swing?.def?.contactPose,
    total = checkedPose(pose),
    t = swing.timing,
    age = swing.ageTicks;
  if (
    swing.clip !== pose.clip ||
    swing.native !== false ||
    !t ||
    !["windup", "active", "recovery"].every((k) => Number.isFinite(t[k]) && t[k] > 0) ||
    !Number.isFinite(age)
  )
    throw Error("Invalid retimed melee contact pose");
  const start = pose.windupTicks / total,
    last = (pose.windupTicks + pose.activeTicks - 1) / total,
    end = (pose.windupTicks + pose.activeTicks) / total,
    phase =
      age < t.windup
        ? (age / t.windup) * start
        : age < t.windup + t.active
          ? t.active === 1
            ? start
            : start + ((age - t.windup) / (t.active - 1)) * (last - start)
          : end + ((age - t.windup - t.active) / t.recovery) * (1 - end);
  return Math.max(0, Math.min(1, phase));
}
