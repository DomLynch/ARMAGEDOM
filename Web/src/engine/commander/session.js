import {
  createCommanderMatch,
  commanderSnapshot,
  COMMANDER_RULES,
  selectCommander,
  orderCommander,
  stepCommander,
} from "./match.js";
import { createCommanderView } from "./view.js";
import { GAME_DATA } from "../game-data.js";

export function createCommanderSession({ canvas, baseUrl, onMenu = () => {} }) {
  const pacing = GAME_DATA.commanderSession; // data/commanderSession.json
  let view,
    match,
    loaded = false,
    loading = false,
    disposed = false,
    paused = false,
    retrying = false,
    focusLost = false,
    command = "move",
    accumulator = 0,
    lastFrame = 0,
    pointer = null,
    notice = "",
    noticeUntil = 0;
  const loadingController = new AbortController();
  const listeners = [],
    pendingEvents = [],
    hud = document.getElementById("commander-hud"),
    entry = document.getElementById("entry"),
    result = document.getElementById("commander-result");
  const byId = (id) => document.getElementById(id),
    listen = (target, type, fn, options) => {
      target.addEventListener(type, fn, options);
      listeners.push(() => target.removeEventListener(type, fn, options));
    };
  function clearPointer() {
    if (pointer && canvas.hasPointerCapture?.(pointer.id)) canvas.releasePointerCapture(pointer.id);
    pointer = null;
  }
  function tell(message) {
    notice = message;
    noticeUntil = (match?.time ?? 0) + 4;
  }
  function snapshot() {
    return {
      mode: "commander",
      loaded,
      loading,
      paused,
      disposed,
      retrying,
      pointers: pointer ? 1 : 0,
      command,
      ...(match ? commanderSnapshot(match) : {}),
      ...(view && match ? { view: view.diagnostics(match) } : {}),
    };
  }
  function updateHUD() {
    if (!match) return;
    const state = commanderSnapshot(match),
      r = COMMANDER_RULES;
    byId("commander-objective").textContent =
      state.phase === "capture"
        ? `Capture checkpoint · ${state.objective.capture.toFixed(1)} / ${r.captureSeconds}s`
        : `Defend checkpoint · ${Math.min(r.defendSeconds, state.objective.defend).toFixed(1)} / ${r.defendSeconds}s`;
    byId("commander-integrity").textContent =
      `Checkpoint ${state.objective.hp} / ${r.beaconHP} · ${Math.max(0, Math.ceil(r.matchSeconds - state.time))}s`;
    byId("commander-reserve").textContent =
      `Machines ${state.units.filter((e) => e.hp > 0).length} / ${r.unitCap} · Reserve ${state.reserve}`;
    byId("commander-notice").textContent =
      notice && match.time <= noticeUntil
        ? notice
        : paused
          ? "Paused"
          : state.selected.length
            ? `${state.selected.length} selected · ${command === "attack" ? "tap a biological opponent" : "tap clear road to move"}`
            : "Select a drone or choose All";
    const list = byId("commander-units");
    for (const e of state.units) {
      let button = list.querySelector(`[data-unit="${e.id}"]`);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.dataset.unit = e.id;
        button.addEventListener("click", () => input({ type: "select", ids: [e.id] }));
        list.append(button);
      }
      button.textContent = `Drone ${e.id} · ${e.hp}/${e.maxHP}`;
      button.disabled = paused || !!state.result || e.hp <= 0;
      button.setAttribute("aria-pressed", String(state.selected.includes(e.id)));
    }
    byId("commander-retry").disabled = retrying;
    const unavailable = paused || retrying || !!state.result;
    for (const id of ["commander-all", "commander-move", "commander-attack", "commander-defend"])
      byId(id).disabled = unavailable;
    byId("commander-deploy").disabled =
      unavailable || state.reserve < r.deployCost || state.units.filter((e) => e.hp > 0).length >= r.unitCap;
    byId("commander-pause").textContent = paused ? "Resume" : "Pause";
    byId("commander-pause").disabled = !!state.result;
    byId("commander-move").setAttribute("aria-pressed", String(command === "move"));
    byId("commander-attack").setAttribute("aria-pressed", String(command === "attack"));
    result.hidden = !state.result;
    if (state.result) {
      byId("commander-result-title").textContent =
        state.result.kind === "success" ? "Checkpoint secured" : "Checkpoint lost";
      byId("commander-result-reason").textContent = state.result.reason;
    }
  }
  function render(dt = 0) {
    if (!loaded || disposed) return;
    view.render(match, dt, { paused, events: pendingEvents.splice(0) });
    updateHUD();
  }
  function tick() {
    if (match.result) return;
    stepCommander(match, view.world);
    pendingEvents.push(...match.events);
    if (match.result) {
      clearPointer();
      paused = false;
    }
  }
  function frame(ms) {
    if (disposed || !loaded || paused) return;
    if (!lastFrame) lastFrame = ms;
    accumulator += Math.min(pacing.maxFrameSeconds, Math.max(0, (ms - lastFrame) / 1000));
    lastFrame = ms;
    let steps = 0;
    while (accumulator >= 1 / 60 && !match.result && steps++ < pacing.maxStepsPerFrame) {
      tick();
      accumulator -= 1 / 60;
    }
    render(steps ? Math.min(pacing.maxFrameSeconds, steps / 60) : 0);
    if (match.result) {
      view.renderer.setAnimationLoop(null);
      accumulator = 0;
      lastFrame = 0;
    }
  }
  function input(request) {
    if (!loaded || disposed || paused || retrying || match.result)
      return { ok: false, reason: "Commander match unavailable" };
    let ack;
    if (request?.type === "select" || request?.type === "all") {
      const ids = request.type === "all" ? match.units.filter((e) => e.hp > 0).map((e) => e.id) : request.ids;
      ack = { ok: selectCommander(match, ids), type: "select", unitIds: [...match.selected] };
    } else if (request?.type === "command" && ["move", "attack"].includes(request.command)) {
      command = request.command;
      ack = { ok: true, type: "command", command };
    } else ack = orderCommander(match, view.world, request);
    if (!ack.ok) tell(ack.reason ?? "Select a living machine");
    else if (["move", "attack", "defend", "deploy"].includes(ack.type))
      tell(
        ack.type === "deploy"
          ? "Replacement deployed"
          : `${ack.type[0].toUpperCase() + ack.type.slice(1)} order accepted`,
      );
    render();
    return structuredClone(ack);
  }
  function pause(value = !paused) {
    if (!loaded || disposed || match.result) return;
    paused = !!value || document.hidden;
    if (!paused) focusLost = false;
    clearPointer();
    match.selected = [];
    lastFrame = 0;
    accumulator = 0;
    view.renderer.setAnimationLoop(paused ? null : frame);
    render();
  }
  async function retry() {
    if (!loaded || disposed || retrying) return false;
    retrying = true;
    clearPointer();
    view.renderer.setAnimationLoop(null);
    paused = false;
    lastFrame = 0;
    accumulator = 0;
    command = "move";
    notice = "";
    pendingEvents.length = 0;
    match = createCommanderMatch(view.world);
    byId("commander-units").replaceChildren();
    updateHUD();
    try {
      const prepared = await view.reset(match);
      if (disposed || !prepared) return false;
      render();
      view.renderer.setAnimationLoop(paused ? null : frame);
      return true;
    } finally {
      retrying = false;
      if (!disposed) updateHUD();
    }
  }
  async function start() {
    if (disposed || loading || loaded) return;
    loading = true;
    byId("enter-ai").disabled = true;
    byId("loading").textContent = "Loading Commander · Westminster…";
    try {
      const next = await createCommanderView({ canvas, baseUrl, signal: loadingController.signal });
      if (disposed || !next) {
        next?.dispose();
        return;
      }
      view = next;
      match = createCommanderMatch(view.world);
      const prepared = await view.prepare(match);
      if (disposed || !prepared) return;
      loaded = true;
      loading = false;
      paused = document.hidden || focusLost;
      document.body.classList.add("commander-mode");
      entry.hidden = true;
      byId("hud").hidden = true;
      hud.hidden = false;
      byId("commander-units").replaceChildren();
      render();
      view.renderer.setAnimationLoop(paused ? null : frame);
    } catch (error) {
      loading = false;
      if (!disposed) {
        view?.dispose();
        view = null;
        byId("loading").textContent = `Commander could not load: ${error.message}. Return to the menu and retry.`;
        byId("enter-ai").disabled = false;
      }
      throw error;
    } finally {
      loading = false;
    }
  }
  for (const [id, request] of [
    ["commander-all", { type: "all" }],
    ["commander-move", { type: "command", command: "move" }],
    ["commander-attack", { type: "command", command: "attack" }],
    ["commander-defend", { type: "defend" }],
    ["commander-deploy", { type: "deploy" }],
  ])
    listen(byId(id), "click", () => input(request));
  listen(byId("commander-pause"), "click", () => pause());
  listen(byId("commander-retry"), "click", () => {
    retry().catch((error) => tell(error.message));
  });
  for (const id of ["commander-back", "commander-result-back"]) listen(byId(id), "click", () => onMenu());
  for (const [id, dx, dy] of [
    ["commander-pan-left", -pacing.panStep, 0],
    ["commander-pan-right", pacing.panStep, 0],
  ])
    listen(byId(id), "click", () => {
      if (loaded && !disposed) {
        view.pan(dx, dy);
        render();
      }
    });
  listen(byId("commander-recentre"), "click", () => {
    if (loaded && !disposed) {
      view.recentre(match);
      render();
    }
  });
  listen(canvas, "contextmenu", (e) => e.preventDefault());
  listen(canvas, "pointerdown", (e) => {
    if (!loaded || disposed || paused || match.result || pointer || !e.isPrimary) return;
    pointer = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      drag: false,
      button: e.button,
    };
    canvas.setPointerCapture(e.pointerId);
  });
  listen(canvas, "pointermove", (e) => {
    if (!pointer || e.pointerId !== pointer.id) return;
    if (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > pacing.dragThresholdPx) pointer.drag = true;
    if (pointer.drag) {
      view.drag(e.clientX - pointer.lastX, e.clientY - pointer.lastY);
      render();
    }
    pointer.lastX = e.clientX;
    pointer.lastY = e.clientY;
  });
  listen(canvas, "pointerup", (e) => {
    if (!pointer || pointer.id !== e.pointerId) return;
    const p = pointer;
    clearPointer();
    if (p.drag || paused || match.result) return;
    const rect = canvas.getBoundingClientRect(),
      x = e.clientX - rect.left,
      y = e.clientY - rect.top,
      hit = view.pick(match, x, y);
    if (hit?.team === "machine" && p.button !== 2) {
      input({ type: "select", ids: [hit.id] });
      return;
    }
    if (hit?.team === "biological" && (command === "attack" || p.button === 2)) {
      input({ type: "attack", targetId: hit.id });
      return;
    }
    if (command === "move" || p.button === 2) {
      const point = view.ground(x, y);
      input({ type: "move", point });
    } else tell("Tap a biological opponent to attack");
  });
  listen(canvas, "pointercancel", clearPointer);
  listen(canvas, "lostpointercapture", () => {
    pointer = null;
  });
  listen(window, "resize", () => {
    if (loaded && !disposed) {
      view.resize();
      render();
    }
  });
  listen(window, "blur", () => {
    focusLost = true;
    pause(true);
  });
  listen(document, "visibilitychange", () => {
    if (document.hidden) pause(true);
  });
  listen(canvas, "webglcontextlost", (e) => {
    e.preventDefault();
    if (loaded) {
      pause(true);
      tell("Graphics interrupted · return to menu and retry");
    }
  });
  return Object.freeze({
    mode: "commander",
    start,
    input,
    snapshot,
    pause,
    retry,
    step(seconds) {
      if (!Number.isFinite(seconds) || seconds < 0 || seconds > pacing.maxApiStepSeconds) throw Error("Bounded Commander step required");
      if (!loaded || paused || disposed) return;
      for (let i = 0; i < Math.floor(seconds * 60 + 1e-8) && !match.result; i++) tick();
      render();
      if (match.result) view.renderer.setAnimationLoop(null);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      loadingController.abort();
      loaded = false;
      clearPointer();
      for (const remove of listeners) remove();
      listeners.length = 0;
      pendingEvents.length = 0;
      view?.dispose();
      view = null;
      hud.hidden = true;
      result.hidden = true;
      document.body.classList.remove("commander-mode");
    },
  });
}
