import { GAME_DATA } from "./game-data.js";
import { addSettingSelect } from "./setting-select.js";
// Phone controls size (data/uiScale.json): Small / Normal / Large / Largest in the Settings menu, stored per device (localStorage, every
// access in try/catch). The loop's frame calls sync(), which writes the effective scale to a CSS variable on <html> and adds a class to <body>
// only while the scale is not 1; hud-options.css scales the move pad, the action buttons, the weapon strip and the menu button from the
// corner each one sits in (so the safe-area margins stay put) and lifts the weapon strip by the pad's growth.
// Normal is exactly 1 and adds no class, so a player who never opens the setting sees the old layout unchanged. A step above 1 is clamped
// to what fits: for the screen's orientation each `fit` row says how much room (px) the growing groups need per 1.0 of scale and how much
// stays fixed, and the scale never goes past (screen - fixed) / growing on any row, nor below 1 (a screen too small for even Normal keeps
// Normal). Small always applies. The desktop layout (body.desktop-ui without body.touch) is never scaled and the row is hidden there.
const DATA = GAME_DATA.uiScale;
const current = { scale: 1 };

// The scale actually in force right now (1 until a controller has run): the threat arrows read it to keep clear of bigger buttons.
export const uiScaleNow = () => current.scale;

export function clampScale(value, bounds = DATA.bounds) {
  return Number.isFinite(value) ? Math.min(bounds.max, Math.max(bounds.min, value)) : 1;
}

// The largest scale the screen has room for, from the fit rows of its orientation (below 1 when a row has no room even for Normal).
export function fitScale({ width, height }, data = DATA) {
  const rows = width > height ? data.fit.landscape : data.fit.portrait;
  let room = Infinity;
  for (const r of rows) room = Math.min(room, ((r.axis === "width" ? width : height) - r.fixedPx) / r.scalablePx);
  return room;
}

// The scale for a chosen step on a screen: clamped to the bounds, and when above 1 held to what fits (never under 1), rounded to roundTo.
export function effectiveScale(step, viewport, data = DATA, desktop = false) {
  if (desktop) return 1;
  const wanted = clampScale(step, data.bounds),
    scale = wanted <= 1 ? wanted : Math.max(1, Math.min(wanted, fitScale(viewport, data)));
  return Math.round(scale * data.roundTo) / data.roundTo;
}

function stored(data, win) {
  try {
    const saved = win.localStorage?.getItem(data.storageKey);
    return data.steps.some((s) => s.id === saved) ? saved : data.default;
  } catch {
    return data.default;
  }
}

export function createUiScale({ data = DATA, doc = globalThis.document, win = globalThis, listen } = {}) {
  const root = doc?.documentElement,
    body = doc?.body;
  if (!data.enabled || !root?.style || !body?.classList)
    return { sync() {}, setStep: () => false, step: data.default, dispose() {} };
  let step = stored(data, win),
    seen = "";
  const row = addSettingSelect(doc, {
    id: "ui-scale",
    label: data.text.label,
    options: data.steps.map((s) => ({ value: s.id, text: data.text.steps[s.id] })),
    value: step,
    onChange: (next) => api.setStep(next),
    listen,
  });
  function sync(force = false) {
    const desktop = body.classList.contains("desktop-ui") && !body.classList.contains("touch"),
      viewport = { width: win.innerWidth, height: win.innerHeight },
      key = `${step} ${viewport.width} ${viewport.height} ${desktop}`;
    if (key === seen && !force) return;
    seen = key;
    const scale = effectiveScale(data.steps.find((s) => s.id === step).scale, viewport, data, desktop);
    current.scale = scale;
    root.style.setProperty(data.cssVar, String(scale));
    body.classList.toggle(data.bodyClass, scale !== 1);
    if (row) row.row.hidden = desktop;
  }
  const api = {
    sync,
    get step() {
      return step;
    },
    setStep(next) {
      if (!data.steps.some((s) => s.id === next)) return false;
      step = next;
      try {
        win.localStorage?.setItem(data.storageKey, step);
      } catch {}
      row?.set(step);
      sync(true);
      return true;
    },
    dispose() {
      row?.remove();
      body.classList.remove(data.bodyClass);
      root.style.removeProperty(data.cssVar);
      current.scale = 1;
    },
  };
  sync(true);
  return api;
}
