import { GAME_DATA } from "./game-data.js";
import { canStartRun, startRun, dismissRun, runTimerLine, runBanner, runResults } from "./apocalypse-run.js";
import { webText } from "./web-text.js";

// The apocalypse run's screen parts (data/apocalypseRun.json text): the small stage timer, the stage banner, the hub's start button in the
// menu and the end-of-run results card. Plain DOM nodes that index.html carries; the director (apocalypse-run.js) owns every rule.
const RUN = GAME_DATA.apocalypseRun;
const paint = (node, value) => {
  if (node && node.textContent !== value) node.textContent = value;
};
const show = (node, on) => {
  if (node && node.hidden === on) node.hidden = !on;
};

export function createRunHudView(s) {
  const nodes = new Map(),
    el = (id) => {
      if (!nodes.has(id)) nodes.set(id, document.getElementById(id)); // the page's nodes never change: look each up once
      return nodes.get(id);
    },
    listeners = [],
    listen = (node, handler) => {
      if (!node) return;
      node.addEventListener("click", handler);
      listeners.push(() => node.removeEventListener("click", handler));
    };
  let rowsKey = null,
    idle = false,
    ringSized = false;
  // The extraction zone's big progress ring (data/apocalypseRun.json extraction.view.hud): shown while the zone stands, it fills while the
  // player is in the circle. Sizes and colours are set once from the row.
  function paintRing(g) {
    const ring = el("extraction-ring"),
      look = RUN.extraction.view.hud;
    if (!ring) return;
    const hold = g.run.hold && g.run.hold.areaId === g.world?.areaId ? g.run.hold : null;
    show(ring, !!hold && !s.traveling);
    if (!hold) return;
    const track = el("extraction-ring-track"),
      fill = el("extraction-ring-fill");
    if (!ringSized) {
      ringSized = true;
      const stroke = (look.strokePx / look.sizePx) * 100,
        radius = 50 - stroke / 2;
      ring.style.top = `${look.topPercent}%`;
      ring.style.fontSize = `${look.textPx}px`;
      el("extraction-ring-percent").style.fontSize = `${look.textPx * 1.6}px`;
      for (const svg of ring.getElementsByTagName("svg")) {
        svg.setAttribute("width", look.sizePx);
        svg.setAttribute("height", look.sizePx);
      }
      for (const circle of [track, fill]) {
        circle.setAttribute("r", radius);
        circle.setAttribute("stroke-width", stroke);
      }
      track.setAttribute("stroke", `#${look.trackColour}`);
      fill.setAttribute("stroke-dasharray", 2 * Math.PI * radius);
      fill.dataset.circumference = 2 * Math.PI * radius;
    }
    fill.setAttribute("stroke", `#${look.fillColour}`);
    fill.setAttribute("stroke-dashoffset", Number(fill.dataset.circumference) * (1 - hold.progress));
    paint(el("extraction-ring-percent"), `${Math.round(hold.progress * 100)}%`);
    paint(el("extraction-ring-text"), webText("extraction.ringLabel"));
  }
  function update() {
    const g = s.game;
    if (!g || s.contextLost) return;
    // No run (or a dismissed one): the timer, banner and results are hidden once, then only the hub's start button is checked.
    if (!g.run || g.run.dismissed) {
      if (!idle) {
        idle = true;
        rowsKey = null;
        for (const id of ["run-hud", "run-banner", "run-results", "extraction-ring"]) show(el(id), false);
      }
      const canStart = canStartRun(g, RUN);
      if (canStart || el("run-panel")?.hidden === false) {
        paint(el("run-start"), RUN.text.startButton);
        paint(el("run-start-hint"), RUN.text.startHint);
      }
      show(el("run-panel"), canStart);
      return;
    }
    idle = false;
    const timer = runTimerLine(g, RUN),
      banner = runBanner(g, RUN),
      rows = runResults(g, RUN);
    paint(el("run-hud"), timer);
    show(el("run-hud"), !!timer && !s.traveling);
    paint(el("run-banner-title"), banner?.title ?? "");
    paint(el("run-banner-line"), banner?.line ?? "");
    show(el("run-banner"), !!banner && !s.traveling);
    paintRing(g);
    const canStart = canStartRun(g, RUN);
    paint(el("run-start"), RUN.text.startButton);
    paint(el("run-start-hint"), RUN.text.startHint);
    show(el("run-panel"), canStart);
    show(el("run-results"), !!rows);
    if (!rows) {
      rowsKey = null;
      return;
    }
    el("ending").hidden = true; // the results card stands in front of the death card; Continue brings the death card back
    const key = rows.map((r) => r.value).join("|");
    if (key === rowsKey) return;
    rowsKey = key;
    paint(el("run-results-title"), RUN.text.resultsTitle);
    paint(el("run-continue"), RUN.text.continue);
    const list = el("run-results-rows");
    list.replaceChildren(
      ...rows.map((r) => {
        const row = document.createElement("div"),
          label = document.createElement("span"),
          value = document.createElement("strong");
        label.textContent = r.label;
        value.textContent = r.value;
        row.append(label, value);
        return row;
      }),
    );
  }
  listen(el("run-start"), () => {
    const g = s.game;
    if (!g || !startRun(g, RUN)) return;
    const menu = el("menu");
    if (menu.open) menu.close();
    update();
  });
  listen(el("run-continue"), () => {
    if (s.game) dismissRun(s.game);
    update();
  });
  return {
    update,
    dispose() {
      for (const remove of listeners.splice(0)) remove();
    },
  };
}
