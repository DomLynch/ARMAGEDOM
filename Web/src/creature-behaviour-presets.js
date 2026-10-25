import { GAME_DATA } from "./engine/game-data.js";
// Per-resident parameter preparation only. No AI clock, targeting or movement.
// The presets and which one each recipe uses live in Web/src/data/creatures.json `behaviours` (read through game-data.js).
export const CREATURE_BEHAVIOURS = GAME_DATA.creatures.behaviours.presets;
export const RECIPE_BEHAVIOURS = GAME_DATA.creatures.behaviours.recipeBehaviours;
export function resolveCreatureBehaviour(name, foundation) {
  const p = Object.hasOwn(CREATURE_BEHAVIOURS, name) ? CREATURE_BEHAVIOURS[name] : null;
  if (!p) throw Error("Unknown creature behaviour");
  const moveSpeed = foundation?.moveSpeed * p.speedFactor,
    recoveryDelay = (foundation?.recoveryDelay ?? 0) + p.recoveryAdd;
  if (
    !Number.isFinite(moveSpeed) ||
    moveSpeed < 0.1 ||
    moveSpeed > 6 ||
    !Number.isFinite(recoveryDelay) ||
    recoveryDelay < 0 ||
    recoveryDelay > 5
  )
    throw Error("Invalid creature behaviour tuning");
  if (
    p.attackPattern &&
    (foundation.weapon !== "knife" ||
      !Array.isArray(foundation.supportedActions) ||
      !p.attackPattern.every((action) => foundation.supportedActions.includes(action)))
  )
    throw Error("Unsupported native attack pattern");
  return Object.freeze({
    moveSpeed,
    recoveryDelay,
    ...(p.attackPattern ? { attackPattern: Object.freeze([...p.attackPattern]) } : {}),
  });
}
