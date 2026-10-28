import { GAME_DATA } from "./game-data.js";
import { canStartRun, startRun, dismissRun, runTimerLine, runBanner, runResults } from "./apocalypse-run.js";

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
  const el = (id) => document.getElementById(id),
    listeners = [],
    listen = (node, handler) => {
      if (!node) return;
      node.addEventListener("click", handler);
      listeners.push(() => node.removeEventListener("click", handler));
    };
  let rowsKey = null;
  function update() {
    const g = s.game;
    if (!g || s.contextLost) return;
    const timer = runTimerLine(g, RUN),
      banner = runBanner(g, RUN),
      rows = runResults(g, RUN);
    paint(el("run-hud"), timer);
    show(el("run-hud"), !!timer && !s.traveling);
    paint(el("run-banner-title"), banner?.title ?? "");
    paint(el("run-banner-line"), banner?.line ?? "");
    show(el("run-banner"), !!banner && !s.traveling);
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
