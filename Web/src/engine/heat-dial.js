import { GAME_DATA } from "./game-data.js";
import { heatShown, heatTier } from "./heat.js";
import { signalCss } from "./colour-blind.js";
import { webText } from "./web-text.js";
// The heat dial (data/heatDial.json): a small readout under the run lines in the top-left HUD column. A line of text, "HEAT 7/15 · Hunted",
// over a thin bar that fills with the heat count; a tick marks each tier's threshold (the tier rows of data/heat.json) and the fill takes
// the tier's colour (heatDial.json colours.tiers, through the colour-blind palette). Hidden at zero heat, while travelling, once the run
// is over, and with ?nodial=1. The newest mark's fade (heat.js heatShown) dims the fill through the last seconds before a mark drops, and a
// tier-up pulses the whole dial once for `pulse.seconds` of game time (no animation under prefers-reduced-motion: hud-options.css keeps a
// static highlight instead). Reads heat only; it changes nothing in the simulation. The bar is a fixed set of nodes and a style is written
// only when its value changed, so a steady frame allocates nothing beyond one key string.
const DIAL = GAME_DATA.heatDial;
const HEAT = GAME_DATA.heat;

// The URL parameter named in the data (offSwitch.param) set to offSwitch.value hides the dial.
export const heatDialOn = (rules = DIAL, search = globalThis.location?.search ?? "") =>
  rules.enabled && new URLSearchParams(search).get(rules.offSwitch.param) !== rules.offSwitch.value;

// What the dial shows for a game: null when it is hidden (no heat, or heat off), else { count, max, percent, tier, dim }.
// tier is the 1-based number of the highest reached tier row (0 below the first), dim the fill opacity of the newest mark.
export function dialState(g, heat = HEAT, rules = DIAL) {
  const shown = g ? heatShown(g, heat) : null;
  if (!shown) return null;
  const tier = heatTier(g, heat),
    index = tier ? heat.pressure.tiers.indexOf(tier) + 1 : 0;
  return {
    count: shown.count,
    max: heat.maxHeat,
    percent: Math.round((shown.count / heat.maxHeat) * rules.percentOf),
    tier: index,
    dim: Math.round(shown.lastAlpha * rules.percentOf) / rules.percentOf,
  };
}

// The text line: the count over the cap, then the tier's name once a tier is reached.
export const dialLine = (state) =>
  state.tier
    ? webText("heatDial.lineTier", { count: state.count, max: state.max, tier: webText(`heatDial.tier.${state.tier}`) })
    : webText("heatDial.line", { count: state.count, max: state.max });

// The fill colour of a tier (the last colour row serves any tier past the list).
export function tierColour(tier, rules = DIAL) {
  const at = Math.min(rules.colours.tiers.length, Math.max(1, tier));
  return signalCss(`heatDial.tier${at}`, rules.colours.tiers[at - 1]);
}

// s: the session (game, traveling, contextLost). options: doc, rules, heat, search (tests).
export function createHeatDial(s, options = {}) {
  const rules = options.rules ?? DIAL,
    heat = options.heat ?? HEAT,
    doc = options.doc ?? globalThis.document,
    column = doc?.getElementById?.("hud-top");
  if (!column || !heatDialOn(rules, options.search)) return { update() {}, dispose() {} };
  const root = doc.createElement("div"),
    text = doc.createElement("span"),
    bar = doc.createElement("span"),
    fill = doc.createElement("span");
  root.id = "heat-dial";
  root.className = "heat-dial";
  root.hidden = true;
  root.setAttribute("role", "status");
  root.setAttribute("aria-live", "off");
  text.className = "heat-dial-text";
  bar.className = "heat-dial-bar";
  fill.className = "heat-dial-fill";
  Object.assign(root.style, {
    width: `${rules.widthPx}px`,
    marginTop: `${rules.topMarginPx}px`,
    gap: `${rules.gapPx}px`,
  });
  Object.assign(text.style, { fontSize: `${rules.textPx}px`, color: rules.colours.text });
  Object.assign(bar.style, { height: `${rules.barHeightPx}px`, background: rules.colours.back });
  root.style.setProperty("--heat-pulse-seconds", `${rules.pulse.seconds}s`);
  root.style.setProperty("--heat-pulse-scale", String(rules.pulse.scale));
  bar.append(fill);
  // A tick at each tier threshold above the first heat mark (the first tier usually starts at 1, where a tick would sit on the bar's edge).
  for (const tier of heat.pressure.tiers) {
    if (tier.minHeat <= 1) continue;
    const tick = doc.createElement("i");
    tick.className = "heat-dial-tick";
    Object.assign(tick.style, {
      left: `${Math.round((tier.minHeat / heat.maxHeat) * rules.percentOf)}%`,
      width: `${rules.tickWidthPx}px`,
      background: rules.colours.tick,
    });
    bar.append(tick);
  }
  root.append(text, bar);
  const anchor = doc.getElementById?.("run-hud");
  if (anchor?.after) anchor.after(root);
  else column.append(root);
  let key = "",
    tierSeen = 0,
    pulseUntil = -Infinity,
    pulsing = false,
    shown = false,
    colour = "";
  const hide = () => {
    tierSeen = 0;
    pulseUntil = -Infinity; // a new run restarts the clock: a stale deadline must not keep the next dial pulsing
    if (pulsing) {
      pulsing = false;
      root.classList.remove("heat-dial-pulse");
    }
    if (shown) {
      shown = false;
      root.hidden = true;
    }
  };

  function update() {
    const g = s.game;
    if (!g || s.contextLost || s.traveling || g.finished || !(g.player?.hp > 0)) return hide();
    const state = dialState(g, heat, rules);
    if (!state) return hide();
    if (state.tier > tierSeen) pulseUntil = g.time + rules.pulse.seconds;
    tierSeen = state.tier;
    const paint = tierColour(state.tier, rules),
      next = `${state.count} ${state.tier} ${state.dim} ${paint}`;
    if (next !== key) {
      key = next;
      const line = dialLine(state);
      text.textContent = line;
      root.setAttribute("aria-label", line);
      fill.style.width = `${state.percent}%`;
      fill.style.opacity = String(state.dim);
      if (paint !== colour) fill.style.background = colour = paint;
    }
    const pulse = g.time < pulseUntil;
    if (pulse !== pulsing) {
      pulsing = pulse;
      root.classList.toggle("heat-dial-pulse", pulse);
    }
    if (!shown) {
      shown = true;
      root.hidden = false;
    }
  }

  return {
    update,
    dispose() {
      root.remove();
    },
  };
}
