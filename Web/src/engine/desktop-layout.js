// Desktop layout: a window with a mouse (fine pointer) and room for it gets body.desktop-ui, which style.css uses to drop the thumb
// controls, show the weapon bar and the key hints, and scale the HUD with the window height (--ui-scale). The numbers are in
// data/inputKeys.json `layout`. Touch devices never get the class; a first touch on a hybrid screen adds body.touch, which wins in CSS.
import { GAME_DATA } from "./game-data.js";
import { keyHints } from "./input-keymap.js";

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// The HUD scale for a window: its height over the base height, kept between the data's min and max.
export const uiScale = (height, layout = GAME_DATA.inputKeys.layout) =>
  clamp(height / layout.baseHeightPx, layout.minScale, layout.maxScale);

export const isDesktopUi = (width, finePointer, layout = GAME_DATA.inputKeys.layout) => finePointer && width >= layout.minWidthPx;

// Sets the class and the scale for the current window. Called at boot and on every resize.
export function applyDesktopLayout(win = globalThis.window) {
  const body = win?.document?.body,
    root = win?.document?.documentElement;
  if (!body || !root) return false;
  const on = isDesktopUi(win.innerWidth, !!win.matchMedia?.("(pointer: fine)")?.matches);
  body.classList.toggle("desktop-ui", on);
  root.style.setProperty("--ui-scale", on ? String(uiScale(win.innerHeight)) : "1");
  return on;
}

// The key-hint chips (#key-hints): one <span><kbd>keys</kbd> label</span> per hint row, text from the data. Rebuilt only when the rows change.
export function fillKeyHints(container, hints = keyHints()) {
  const doc = container?.ownerDocument ?? globalThis.document;
  if (!container?.replaceChildren || !doc?.createElement) return;
  container.replaceChildren(
    ...hints.map(({ label, keys }) => {
      const chip = doc.createElement("span"),
        key = doc.createElement("kbd");
      key.textContent = keys;
      chip.append(key, doc.createTextNode(` ${label}`));
      return chip;
    }),
  );
}
