// Desktop keyboard and mouse bindings. The data is Web/src/data/inputKeys.json (rebind by editing it; engine/input-keymap-data.js
// validates it). This module answers "which action is this key or mouse button" for input.js and "what do the key hints say" for the
// HUD and the Controls card.
import { GAME_DATA } from "./game-data.js";
import { webText } from "./web-text.js";
import { WEAPON_SLOT, WEAPON_STEP } from "./input-keymap-data.js";

export function buildKeyMap(data = GAME_DATA.inputKeys) {
  const byCode = new Map(),
    retry = new Set(data.keys.retry ?? []);
  for (const [action, codes] of Object.entries(data.keys)) if (action !== "retry") for (const code of codes) byCode.set(code, action);
  return {
    wheelStepMs: data.wheelStepMs,
    actionFor: (code) => byCode.get(code) ?? null,
    codesFor: (action) => data.keys[action] ?? [],
    isRetry: (code) => retry.has(code),
    mouseName: (button) => data.mouseButtons[button] ?? null,
    // The sim action a mouse button starts: a gun in hand swaps the melee kind for its own (fire, reload).
    mouseKind: (button, gun) => {
      const row = data.mouse[data.mouseButtons[button]];
      return row ? (gun ? row.gun : row.melee) : null;
    },
    weaponSlot: (action) => Number(action.match(WEAPON_SLOT)?.[1]) || null,
    weaponStep: (action) => {
      const step = action.match(WEAPON_STEP)?.[1];
      return step ? (step === "Next" ? 1 : -1) : null;
    },
  };
}

const keyName = (code, names) => names[code] ?? code.replace(/^(Key|Digit)/, "");

// One "W/A/S/D Move · Space Dodge roll ..." line for the Controls card.
export const keyHintLine = (hints = keyHints()) =>
  webText("hud.keys.controlsDesktop", {
    hints: hints.map(({ label, keys }) => webText("hud.keys.hint", { keys, label })).join(webText("hud.keys.hintSeparator")),
  });

// The key-hint lines the HUD and the Controls card show: [{ label, keys }] in data order, label text from webText.json.
export function keyHints(data = GAME_DATA.inputKeys) {
  return data.hints.map((hint) => {
    const keys = hint.keys.map((action) => keyName(data.keys[action][0], data.keyNames)).join(hint.join);
    const mouse = (hint.mouse ?? []).map((name) => data.mouseNames[name]);
    return { label: webText(hint.text), keys: [...(keys ? [keys] : []), ...mouse].join(data.partJoin) };
  });
}
