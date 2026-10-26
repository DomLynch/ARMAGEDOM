import { MOVEMENT_TRACE } from "./movement-trace-data.js";
const vector = (p) => (p ? { x: p.x, z: p.z } : null);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export function movementBoundary(world, point, radius) {
  const polygons = [
    ["road", world.geometry.road],
    ...(world.geometry.blockers ?? []).map((p, i) => [world.layout.blockers[i].name, p]),
  ];
  const edges = [];
  for (const [name, poly] of polygons)
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i],
        b = poly[(i + 1) % poly.length],
        dx = b.x - a.x,
        dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      edges.push({ name, index: i, distance: Math.hypot(point.x - a.x - t * dx, point.z - a.z - t * dz) });
    }
  edges.sort((a, b) => a.distance - b.distance);
  return { clear: world.geometry.clear(point, radius), nearest: edges.slice(0, MOVEMENT_TRACE.nearestEdges) };
}
// Observes only. Never changes input, simulation, collision, storage or actors.
export function createMovementTrace(
  s,
  {
    enabled = false,
    document: doc = globalThis.document,
    window: win = globalThis.window,
    identity = null,
    capacity = MOVEMENT_TRACE.capacity,
  } = {},
) {
  if (!enabled) return null;
  const rows = [],
    listeners = [];
  let before = null,
    calls = [],
    wrappedWorld = null,
    originalMove = null,
    lastPaint = -Infinity,
    observedGame = null,
    disposed = false;
  const box = doc.createElement("div"),
    line = doc.createElement("div"),
    button = doc.createElement("button");
  box.id = "movement-support";
  box.style.cssText =
    "position:fixed;top:210px;left:8px;right:8px;z-index:1000;background:#000d;color:#fff;font:10px monospace;padding:5px;pointer-events:none";
  button.textContent = "Copy movement report";
  button.style.cssText = "pointer-events:auto;font-size:12px";
  box.append(line, button);
  doc.body.append(box);
  function push(row) {
    rows.push(row);
    if (rows.length > capacity) rows.shift();
  }
  function listen(target, type, fn) {
    target.addEventListener(type, fn, { capture: true, passive: true });
    listeners.push(() => target.removeEventListener(type, fn, { capture: true }));
  }
  function restore() {
    if (wrappedWorld?.move === observeMove) wrappedWorld.move = originalMove;
    wrappedWorld = null;
    originalMove = null;
  }
  function observeMove(p, d, r) {
    const answer = originalMove.call(this, p, d, r);
    if (p === s.game?.player.pos && calls.length < 8) {
      const desired = { x: p.x + d.x, z: p.z + d.z },
        accepted = vector(answer),
        partial = distance(desired, answer) > MOVEMENT_TRACE.answerEpsilon;
      calls.push({
        from: vector(p),
        delta: vector(d),
        desired,
        accepted,
        radius: r,
        ...(partial ? { boundary: movementBoundary(this, desired, r) } : {}),
      });
    }
    return answer;
  }
  function bind() {
    if (wrappedWorld === s.world) return;
    restore();
    if (s.world) {
      wrappedWorld = s.world;
      originalMove = wrappedWorld.move;
      wrappedWorld.move = observeMove;
    }
  }
  const rectangle = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  };
  const viewport = () => ({
    width: win.innerWidth,
    height: win.innerHeight,
    dpr: win.devicePixelRatio,
    visual: win.visualViewport
      ? {
          width: win.visualViewport.width,
          height: win.visualViewport.height,
          offsetLeft: win.visualViewport.offsetLeft,
          offsetTop: win.visualViewport.offsetTop,
          scale: win.visualViewport.scale,
        }
      : null,
    canvas: rectangle(s.canvas),
  });
  for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel", "lostpointercapture"])
    listen(doc, type, (e) => {
      if (e.target === button) return;
      push({
        type,
        time: s.game?.time ?? null,
        id: e.pointerId,
        pointerType: e.pointerType,
        target: e.target?.id ?? "",
        x: e.clientX,
        y: e.clientY,
        buttons: e.buttons,
      });
    });
  for (const type of ["resize", "blur", "focus"])
    listen(win, type, () => push({ type, time: s.game?.time ?? null, viewport: viewport() }));
  if (win.visualViewport)
    for (const type of ["resize", "scroll"])
      listen(win.visualViewport, type, () =>
        push({ type: "visual-" + type, time: s.game?.time ?? null, viewport: viewport() }),
      );
  listen(doc, "visibilitychange", () => push({ type: "visibility", hidden: doc.hidden, time: s.game?.time ?? null }));
  function report() {
    const g = s.game,
      p = g?.player,
      w = s.world;
    return {
      schema: 1,
      identity,
      viewport: viewport(),
      current: {
        loaded: s.loaded,
        paused: s.paused,
        traveling: s.traveling,
        contextLost: s.contextLost,
        finished: g?.finished,
        time: g?.time,
        area: w?.areaId,
        pos: vector(p?.pos),
        radius: p?.radius,
        stick: s.input?.state ? { ...s.input.state.stick } : null,
        swing: !!p?.swing,
        hurt: g?.time < p?.hurtUntil,
        dodge: g?.time < p?.dodgeUntil,
        ready: g?.time < p?.ready,
      },
      layout: w
        ? {
            area: w.areaId,
            registered:
              w.manifest?.files?.find((f) => f.area === w.areaId && f.path.endsWith("/layout.json"))?.sha256 ?? null,
            road: w.layout.road,
            blockers: w.layout.blockers,
          }
        : null,
      rows: [...rows],
    };
  }
  async function copy(event) {
    const source = event?.currentTarget ?? button;
    const text = JSON.stringify(report());
    try {
      await win.navigator.clipboard.writeText(text);
      source.textContent = "Copied movement report";
    } catch {
      const area = doc.createElement("textarea");
      area.readOnly = true;
      area.value = text;
      (source.closest?.("dialog") ?? box).append(area);
      area.select();
      source.textContent = "Select and copy report below";
      listeners.push(() => area.remove());
    }
  }
  button.addEventListener("click", copy);
  listeners.push(() => button.removeEventListener("click", copy));
  const menu = doc.getElementById?.("menu");
  if (menu) {
    const menuCopy = doc.createElement("button");
    menuCopy.id = "movement-report-copy";
    menuCopy.textContent = "Copy movement report";
    menu.append(menuCopy);
    menuCopy.addEventListener("click", copy);
    listeners.push(() => {
      menuCopy.removeEventListener("click", copy);
      menuCopy.remove();
    });
  }
  return {
    setIdentity(value) {
      identity = value;
    },
    beforeStep(intent) {
      if (disposed) return;
      if (observedGame !== s.game || s.game.time < lastPaint) {
        observedGame = s.game;
        lastPaint = -Infinity;
        push({ type: "run-clock-reset", time: s.game.time });
      }
      bind();
      calls = [];
      before = {
        pos: vector(s.game.player.pos),
        intent: {
          move: vector(intent.move),
          moveHeld: intent.moveHeld,
          run: intent.run,
          actions: intent.actions,
          held: intent.held,
        },
      };
    },
    afterStep() {
      if (disposed || !before) return;
      const g = s.game,
        p = g.player,
        w = s.world,
        stick = s.input.state.stick;
      const locks = {
        paused: s.paused,
        traveling: s.traveling,
        finished: g.finished,
        contextLost: s.contextLost,
        swing: !!p.swing,
        hurt: g.time < p.hurtUntil,
        dodge: g.time < p.dodgeUntil,
        ready: g.time < p.ready,
      };
      const delta = { x: p.pos.x - before.pos.x, z: p.pos.z - before.pos.z },
        blocked =
          Math.hypot(before.intent.move.x, before.intent.move.z) > MOVEMENT_TRACE.stalledIntent &&
          Math.hypot(delta.x, delta.z) < MOVEMENT_TRACE.answerEpsilon;
      const row = {
        type: "step",
        time: g.time,
        area: w.areaId,
        pos: vector(p.pos),
        point: w.geometry.point(p.pos),
        radius: p.radius,
        hp: p.hp,
        stick: { x: stick.x, y: stick.y },
        intent: before.intent,
        delta,
        blocked,
        locks,
        calls,
        nearby: g.enemies
          .filter((e) => e.hp > 0 && distance(p.pos, e.pos) < MOVEMENT_TRACE.nearbyMetres)
          .map((e) => ({
            id: e.id,
            key: e.placementKey,
            pos: vector(e.pos),
            radius: e.radius,
            hp: e.hp,
            distance: distance(p.pos, e.pos),
          })),
        camera: { right: vector(w.cameraRight), forward: vector(w.cameraForward), center: { ...w.center } },
      };
      push(row);
      if (g.time - lastPaint >= MOVEMENT_TRACE.paintSeconds) {
        lastPaint = g.time;
        const boundary = calls.find((c) => c.boundary);
        line.textContent = `${identity?.version ?? "Build identity loading"} ${identity?.sourceCommit?.slice(0, MOVEMENT_TRACE.commitChars) ?? ""} · ${w.areaId} · ${blocked ? "STOP" : "MOVE"}\nroot ${p.pos.x.toFixed(MOVEMENT_TRACE.decimals)},${p.pos.z.toFixed(MOVEMENT_TRACE.decimals)} r${p.radius} stick ${stick.x.toFixed(MOVEMENT_TRACE.decimals)},${stick.y.toFixed(MOVEMENT_TRACE.decimals)} · ${
          Object.entries(locks)
            .filter(([, v]) => v)
            .map(([k]) => k)
            .join(",") || "unlocked"
        }${boundary ? " · nearest " + boundary.boundary.nearest[0]?.name + "/" + boundary.boundary.nearest[0]?.index : ""}`;
        line.style.whiteSpace = "pre-wrap";
      }
      before = null;
    },
    report,
    dispose() {
      if (disposed) return;
      disposed = true;
      restore();
      for (const remove of listeners) remove();
      box.remove();
      rows.length = 0;
    },
  };
}
