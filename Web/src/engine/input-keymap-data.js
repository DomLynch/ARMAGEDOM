// Validator for Web/src/data/inputKeys.json (the desktop key and mouse bindings), called from engine/game-data.js. It must not import
// game-data.js (that would be a cycle); engine/input-keymap.js reads the validated row.
import { closed } from "./content-schema.js";

// Held while down: the four move directions and sprint. Pressed once: the attack and defence kinds the sim already knows.
export const HELD_ACTION = /^(move(Up|Down|Left|Right)|sprint)$/;
export const PRESS_ACTION = /^(dodge|stab|heavy|special|guard)$/;
export const WEAPON_SLOT = /^weapon([1-9])$/;
export const WEAPON_STEP = /^weapon(Next|Prev)$/;
const OTHER_ACTION = /^(menu|pickup|retry)$/;
const MOUSE_KIND = /^(slash|fire|dodge|stab|heavy|special|guard)$/;
const CODE = /^[A-Za-z][A-Za-z0-9]*$/;

const fail = (why) => {
  throw TypeError(`Invalid game data inputKeys: ${why}`);
};
const known = (a) => [HELD_ACTION, PRESS_ACTION, WEAPON_SLOT, WEAPON_STEP, OTHER_ACTION].some((pattern) => pattern.test(a));

export function validateInputKeys(d) {
  closed(d, ["schema_version", "keys", "mouseButtons", "mouse", "wheelStepMs", "partJoin", "keyNames", "mouseNames", "hints"]);
  const seen = new Map();
  for (const [action, codes] of Object.entries(d.keys)) {
    if (!known(action)) fail(`${action} is not an input action`);
    if (!Array.isArray(codes) || !codes.length || !codes.every((c) => CODE.test(c))) fail(`${action} needs a list of key codes`);
    // Retry is the one action that shares a key: it only fires on the ending card, where the stab key has no other job.
    if (action === "retry") continue;
    for (const code of codes) {
      if (seen.has(code)) fail(`${code} is bound to both ${seen.get(code)} and ${action}`);
      seen.set(code, action);
    }
  }
  if (!Array.isArray(d.mouseButtons) || !d.mouseButtons.every((b) => typeof b === "string" && d.mouse[b])) fail("mouseButtons must name mouse rows");
  for (const [name, row] of Object.entries(d.mouse)) {
    closed(row, ["melee", "gun"]);
    if (!MOUSE_KIND.test(row.melee) || !MOUSE_KIND.test(row.gun)) fail(`mouse.${name} has an unknown action`);
  }
  if (!Number.isFinite(d.wheelStepMs) || d.wheelStepMs < 0) fail("wheelStepMs must be a number from 0");
  if (typeof d.partJoin !== "string") fail("partJoin must be a string");
  for (const hint of d.hints) {
    closed(hint, ["text", "keys", "join"], ["mouse"]);
    for (const action of hint.keys) if (!d.keys[action]) fail(`hint ${hint.text} names an unbound action ${action}`);
    for (const name of hint.mouse ?? []) if (!(name in d.mouseNames)) fail(`hint ${hint.text} names an unknown mouse part ${name}`);
  }
}
