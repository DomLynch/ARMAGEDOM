import { GAME_DATA } from "./game-data.js";
import { addSettingSelect } from "./setting-select.js";
// Colour-blind palettes (data/colourBlind.json). The signal colours the game already keeps as data (enemy health bars, threat arrows,
// damage numbers, the hurt vignette, item rarity, the heat dial) are read through the lookups below instead of straight from their own
// files: a slot name such as "enemyBars.fill" plus the colour the file holds. In the Off mode, or for a slot the chosen palette does not
// list, the file's own colour comes back untouched (same string or array), so Off changes nothing at all. A palette lists only the slots
// that need to move; test/colour-blind.test.js simulates the three deficiencies over every palette and checks the colours stay apart.
// The choice is stored per device (localStorage, every access in try/catch) and read lazily, so a test or a locked-down browser just gets Off.
const DATA = GAME_DATA.colourBlind;
const memo = new WeakMap(); // data -> Map("mode|slot" -> derived value); a derived value never changes for a given data object
const state = { mode: null };
const toRgb = (hex) => hex.match(/../g).map((pair) => Number(`0x${pair}`));

function stored(data, win) {
  try {
    const saved = win.localStorage?.getItem(data.storageKey);
    return data.modes.some((m) => m.id === saved) ? saved : data.default;
  } catch {
    return data.default;
  }
}

// The current mode id. With the feature turned off in the data it is always Off.
export function colourBlindMode(data = DATA, win = globalThis) {
  if (!data.enabled) return data.default;
  if (data !== DATA) return stored(data, win);
  state.mode ??= stored(data, win);
  return state.mode;
}

// Test hook and the menu: moves the mode without touching storage unless asked.
export function setColourBlindMode(next, { data = DATA, save = false, win = globalThis } = {}) {
  if (!data.modes.some((m) => m.id === next)) return false;
  if (data === DATA) state.mode = next;
  if (save)
    try {
      win.localStorage?.setItem(data.storageKey, next);
    } catch {}
  return true;
}

export function resetColourBlind() {
  state.mode = null;
}

function derived(data, mode, slot, make) {
  let table = memo.get(data);
  if (!table) memo.set(data, (table = new Map()));
  const key = `${mode}|${slot}`;
  if (!table.has(key)) table.set(key, make());
  return table.get(key);
}

// The palette's colour for a slot (hex string, or a list of them), or undefined when Off or the palette leaves the slot alone.
export function paletteColour(slot, mode = colourBlindMode(), data = DATA) {
  return data.modes.find((m) => m.id === mode)?.slots[slot];
}

// Six hex digits without a #, for files that keep colours that way (threat arrows, loot rarity).
export const signalHex = (slot, base, mode = colourBlindMode(), data = DATA) => paletteColour(slot, mode, data) ?? base;

// A CSS colour: "#rrggbb" from the palette, else the file's own string.
export function signalCss(slot, base, mode = colourBlindMode(), data = DATA) {
  const hex = paletteColour(slot, mode, data);
  return hex === undefined ? base : derived(data, mode, slot, () => `#${hex}`);
}

// [r, g, b] (0-255): the palette's colour, else the file's own array.
export function signalRgb(slot, base, mode = colourBlindMode(), data = DATA) {
  const hex = paletteColour(slot, mode, data);
  return hex === undefined ? base : derived(data, mode, slot, () => toRgb(hex));
}

// A list of [r, g, b] (the damage number ramp). A palette list of a different length than the file's is ignored.
export function signalRgbList(slot, base, mode = colourBlindMode(), data = DATA) {
  const hexes = paletteColour(slot, mode, data);
  return hexes === undefined || hexes.length !== base.length ? base : derived(data, mode, slot, () => hexes.map(toRgb));
}

// The menu row: label and options from the data, the choice stored on change. `listen` is the session's owner registry.
export function createColourBlind({ data = DATA, doc = globalThis.document, win = globalThis, listen } = {}) {
  if (!data.enabled) return { mode: data.default, setMode: () => false, dispose() {} };
  const row = addSettingSelect(doc, {
    id: "colour-blind",
    label: data.text.label,
    options: data.modes.map((m) => ({ value: m.id, text: data.text.modes[m.id] })),
    value: colourBlindMode(data, win),
    onChange: (next) => api.setMode(next),
    listen,
  });
  const api = {
    get mode() {
      return colourBlindMode(data, win);
    },
    setMode(next) {
      if (!setColourBlindMode(next, { data, save: true, win })) return false;
      row?.set(next);
      return true;
    },
    dispose() {
      row?.remove();
    },
  };
  return api;
}
