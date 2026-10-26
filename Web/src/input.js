import { mobileStickVector } from "./mobile-combat-aim.js";
import { installTapFallback } from "./engine/tap-fallback.js";
import { GAME_DATA } from "./engine/game-data.js";
// Stick, aim and tap thresholds: data/visual.json `input`.
const INPUT = GAME_DATA.visual.input;
// How far the knob travels at full tilt: a third of the pad's width, so a larger pad moves the knob further (136 px pad: 46 px; the old
// 106 px pad and a pad whose size is not known: 36 px). The finger travel for full tilt (mobileStickVector's 46 px) is unchanged.
const knobTravel = (element) => Math.round((element?.offsetWidth || INPUT.knobPadPx) * INPUT.knobTravelShare);
const clampStick = (value, radius) => {
  const length = Math.hypot(value.x, value.y);
  const divisor = length > radius ? length : radius;
  return { x: value.x / divisor, y: value.y / divisor };
};

export class InputState {
  constructor() {
    this.pointers = new Map();
    this.nextLifetime = 0;
    this.keys = new Set();
    this.clear();
  }

  down(id, kind, at, { aimable = false } = {}) {
    if (this.pointers.has(id)) return;
    // One thumb owns movement until release; extra pad contacts cannot steer it.
    if (kind === "move" && [...this.pointers.values()].some((p) => p.kind === "move")) return;
    if (kind === "fire" && [...this.pointers.values()].some((p) => p.kind === "fire")) return;
    const alreadyGuarding = this.guardHeld();
    const pointer = { kind, lifetime: ++this.nextLifetime, start: { ...at }, at: { ...at }, aimable };
    this.pointers.set(id, pointer);
    if (kind !== "move" && (kind !== "guard" || !alreadyGuarding)) {
      this.pending.push({ pointer, kind });
    }
  }

  guardHeld() {
    return [...this.pointers.values()].some((pointer) => pointer.kind === "guard");
  }

  get aim() {
    let owner = null;
    for (const pointer of this.pointers.values()) {
      if (pointer.aim && (!owner || pointer.aimOrder > owner.aimOrder)) owner = pointer;
    }
    return owner ? { ...owner.aim } : null;
  }

  move(id, at) {
    const pointer = this.pointers.get(id);
    if (!pointer) return;
    pointer.at = { ...at };
    const delta = { x: at.x - pointer.start.x, y: at.y - pointer.start.y };
    if (pointer.kind === "move") {
      // Preserve the floating touch origin: donor ratios map to this 46px pad.
      const raw = Math.hypot(delta.x, delta.y) / INPUT.stickRadiusPx;
      this.stick = mobileStickVector(delta.x, delta.y, INPUT.stickRadiusPx);
      pointer.run = raw > INPUT.runTilt + 1e-10;
    } else if ((pointer.kind !== "fire" || pointer.aimable) && Math.hypot(delta.x, delta.y) > INPUT.aimStartPx) {
      pointer.aim = clampStick(delta, 1);
      pointer.aimOrder = ++this.aimOrder;
    }
  }

  up(id, { cancelled = false } = {}) {
    const pointer = this.pointers.get(id);
    if (pointer && !cancelled && ["fire", "slash"].includes(pointer.kind)) this.normalUps.push(pointer);
    if (pointer?.kind === "move") this.stick = { x: 0, y: 0 };
    this.pointers.delete(id);
  }

  cancel(id) {
    // Automatic lostcapture after a successful up must preserve the quick tap.
    if (!this.pointers.has(id)) return;
    const pointer = this.pointers.get(id);
    this.pending = this.pending.filter((press) => press.pointer !== pointer);
    this.up(id, { cancelled: true });
  }

  clear({ keepMovement = false } = {}) {
    if (keepMovement) {
      for (const [id, pointer] of this.pointers) if (pointer.kind !== "move") this.pointers.delete(id);
      for (const key of this.keys)
        if (!["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"].includes(key)) this.keys.delete(key);
    } else {
      this.pointers.clear();
      this.keys.clear();
      this.stick = { x: 0, y: 0 };
    }
    this.aimOrder = 0;
    this.pending = [];
    this.normalUps = [];
  }

  take({ actionEdges = false } = {}) {
    const held = [
      ...new Set(
        [...this.pointers.values()]
          .map((pointer) => pointer.kind)
          .filter((kind) => !["move", "guard", "dodge"].includes(kind)),
      ),
    ];
    const move = {
      x: this.stick.x + (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0),
      y: this.stick.y + (this.keys.has("KeyS") ? 1 : 0) - (this.keys.has("KeyW") ? 1 : 0),
    };
    const length = Math.hypot(move.x, move.y);
    if (length > 1) {
      move.x /= length;
      move.y /= length;
    }
    const presses = this.pending.splice(0),
      ups = this.normalUps.splice(0),
      edge = (p) => ({ kind: p.kind, lifetime: p.lifetime }),
      attack = (p) => ["fire", "slash"].includes(p.kind);
    return {
      move,
      ...(actionEdges
        ? {
            actionEdges: {
              started: presses.filter(attack).map((p) => edge(p.pointer)),
              held: [...this.pointers.values()].filter(attack).map(edge),
              released: ups.map(edge),
            },
          }
        : {}),
      moveHeld: [...this.pointers.values()].some((p) => p.kind === "move"),
      run:
        [...this.pointers.values()].some((p) => p.kind === "move" && p.run) ||
        this.keys.has("ShiftLeft") ||
        this.keys.has("ShiftRight"),
      aim: this.aim,
      fireAim:
        ([...this.pointers.values()].find((p) => p.kind === "fire") ?? presses.find((p) => p.kind === "fire")?.pointer)
          ?.aim ?? null,
      actions: presses.filter((press) => !["guard", "dodge"].includes(press.kind)).map((press) => press.kind),
      held,
      guard: this.guardHeld(),
      guardPressed: presses.some((press) => press.kind === "guard"),
      dodge: presses.some((press) => press.kind === "dodge"),
    };
  }
}

export function attachInput({
  canvas,
  onMenu,
  onRetry,
  isPaused,
  onInteraction = () => {},
  onPickup = () => false,
  cycleWeapon = () => {},
  isPistol = () => false,
  isFlame = () => false,
  isWorldGun = () => false,
  isSelectOnly = () => false,
  onTargetClear = () => {},
}) {
  const state = new InputState(),
    listeners = [];
  const worldContacts = new Map();
  let worldTap = null;
  // Check visible UI leaves only at contact/release, including readouts whose
  // pointer-events:none would otherwise let a canvas tap pass through them.
  function worldSurface(x, y) {
    if (document.elementFromPoint?.(x, y) !== canvas) return false;
    for (const node of document.querySelectorAll(
      "#vitals,#notice,#ammo,#pistol-icon,#expedition-objective,#safehouse-status,#boss,#boss-labels > *,#expedition-guard-label,#expedition-case-label,#flame-pickup-label,#unique-reward-label,#move,#action-cluster,#weapon-tiles,#menu-button,#safehouse-interact,#pistol-interact",
    )) {
      if (node.hidden || !node.getClientRects().length) continue;
      const r = node.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return false;
    }
    return true;
  }
  function listen(target, type, handler, options) {
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }
  const gameplayTouch = (target) =>
    !isPaused() &&
    !target?.closest?.(
      "#weapon-tiles, #safehouse-interact, #menu, #menu-button, #entry, #ending, #pistol-interact, #rifle-pickup, #rifle-equipment, #boss-equipment, [data-boss-equipment-control], a, input, select, textarea",
    ) &&
    (target === document.body ||
      target === document.documentElement ||
      !!target?.closest?.("#world, #hud, #move, #action-cluster, [data-action]"));
  // Safari may ignore viewport zoom hints. Cancel browser gestures, not game
  // pointers: movement and action contacts still reach the bindings below.
  const prevent = (event) => {
    if (event.cancelable) event.preventDefault();
  };
  for (const type of ["gesturestart", "gesturechange", "gestureend"])
    listen(document, type, prevent, { passive: false, capture: true });
  // Keep click-driven menus usable: cancel the zoom default, not either click.
  listen(document, "dblclick", prevent, { passive: false, capture: true });
  let multiTouch = false,
    lastTap = -Infinity;
  for (const type of ["touchstart", "touchmove"]) {
    listen(
      document,
      type,
      (event) => {
        if (type === "touchstart" && event.touches.length === 1) multiTouch = false;
        if (event.touches.length > 1) {
          multiTouch = true;
          lastTap = -Infinity;
          prevent(event);
        } else if (gameplayTouch(event.target)) prevent(event);
      },
      { passive: false, capture: true },
    );
  }
  listen(
    document,
    "touchend",
    (event) => {
      if (!gameplayTouch(event.target) || multiTouch || event.touches.length || event.changedTouches.length !== 1) {
        lastTap = -Infinity;
        return;
      }
      if (event.timeStamp - lastTap < INPUT.doubleTapMs) prevent(event);
      lastTap = event.timeStamp;
    },
    { passive: false, capture: true },
  );
  listen(document, "touchcancel", () => {
    worldContacts.clear();
    worldTap = null;
    multiTouch = false;
    lastTap = -Infinity;
  });
  // WebKit can require release/click activation even when pointerdown worked.
  for (const type of ["pointerup", "touchend", "click"])
    listen(
      window,
      type,
      () => {
        if (!isPaused()) onInteraction();
      },
      { passive: true },
    );
  const map = {
    KeyQ: "heavy",
    KeyE: "special",
    Digit1: "special",
    Space: "dodge",
    KeyF: "guard",
    KeyG: "pickup",
  };
  let mouse = null,
    touch = false;

  const bind = (element, kind) => {
    listen(element, "pointerdown", (event) => {
      if (isPaused()) return;
      if (kind !== "move") {
        worldTap = null;
        worldContacts.clear();
      }
      onInteraction();
      event.preventDefault();
      touch = true;
      document.body.classList.add("touch");
      element.setPointerCapture(event.pointerId);
      const fire = isPistol() && kind === "slash";
      state.down(
        event.pointerId,
        fire ? "fire" : kind,
        { x: event.clientX, y: event.clientY },
        { aimable: fire && isFlame() },
      );
      if (!state.pointers.has(event.pointerId)) return;
      element.classList.add("pressed");
      element.style.setProperty("--aim-angle", "0rad");
      element.classList.remove("aiming");
    });
    listen(element, "pointermove", (event) => {
      state.move(event.pointerId, { x: event.clientX, y: event.clientY });
      if (kind === "move") {
        element.style.setProperty("--knob-x", `${state.stick.x * knobTravel(element)}px`);
        element.style.setProperty("--knob-y", `${state.stick.y * knobTravel(element)}px`);
      } else {
        const aim = state.pointers.get(event.pointerId)?.aim;
        if (aim) {
          element.classList.add("aiming");
          element.style.setProperty("--aim-angle", `${Math.atan2(aim.y, aim.x)}rad`);
        }
      }
    });
    const release = (event) => {
      if (event.type === "pointerup") state.up(event.pointerId);
      else state.cancel(event.pointerId);
      if (
        ![...state.pointers.values()].some(
          (pointer) => pointer.kind === kind || (kind === "slash" && pointer.kind === "fire"),
        )
      ) {
        element.classList.remove("pressed");
        element.classList.remove("aiming");
        element.style.setProperty("--aim-angle", "0rad");
      }
      if (kind === "move") {
        element.style.setProperty("--knob-x", `${state.stick.x * knobTravel(element)}px`);
        element.style.setProperty("--knob-y", `${state.stick.y * knobTravel(element)}px`);
      }
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) {
      listen(element, type, release);
    }
  };
  bind(document.querySelector("#move"), "move");
  for (const element of document.querySelectorAll("[data-action]")) bind(element, element.dataset.action);

  listen(canvas, "pointermove", (event) => {
    const contact = worldContacts.get(event.pointerId);
    if (contact && Math.hypot(event.clientX - contact.x, event.clientY - contact.y) > INPUT.worldTapSlopPx) contact.cancelled = true;
    if (event.pointerType === "mouse") {
      touch = false;
      mouse = { x: event.clientX, y: event.clientY };
    }
  });
  listen(canvas, "pointerdown", (event) => {
    if (event.pointerType === "touch") {
      if (isPaused() || !isWorldGun() || !worldSurface(event.clientX, event.clientY)) return;
      onInteraction();
      event.preventDefault();
      touch = true;
      mouse = null;
      document.body.classList.add("touch");
      if (worldContacts.size) {
        for (const contact of worldContacts.values()) contact.cancelled = true;
        worldContacts.set(event.pointerId, { cancelled: true });
        return;
      }
      worldContacts.set(event.pointerId, { x: event.clientX, y: event.clientY, at: event.timeStamp, cancelled: false });
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    if (event.pointerType !== "mouse" || isPaused()) return;
    if (isSelectOnly() && event.button !== 2) { // tuning-ok: button 2 is the secondary (right) mouse button
      onInteraction();
      event.preventDefault();
      touch = false;
      mouse = { x: event.clientX, y: event.clientY };
      worldContacts.set(event.pointerId, { x: event.clientX, y: event.clientY, at: event.timeStamp, cancelled: false });
      canvas.setPointerCapture(event.pointerId);
      return;
    }
    touch = false;
    worldTap = null;
    worldContacts.clear();
    onTargetClear();
    onInteraction();
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    mouse = { x: event.clientX, y: event.clientY };
    state.down(event.pointerId, event.button === 2 ? "stab" : isPistol() ? "fire" : "slash", mouse); // tuning-ok: button 2 is the right mouse button
  });
  listen(canvas, "pointerup", (event) => {
    const contact = worldContacts.get(event.pointerId);
    worldContacts.delete(event.pointerId);
    if (
      contact &&
      !contact.cancelled &&
      !isPaused() &&
      isWorldGun() &&
      event.timeStamp - contact.at <= INPUT.worldTapMaxMs &&
      Math.hypot(event.clientX - contact.x, event.clientY - contact.y) <= INPUT.worldTapSlopPx &&
      worldSurface(event.clientX, event.clientY)
    )
      worldTap = { x: event.clientX, y: event.clientY };
    state.up(event.pointerId);
  });
  listen(canvas, "pointercancel", (event) => {
    worldContacts.delete(event.pointerId);
    state.cancel(event.pointerId);
  });
  listen(canvas, "lostpointercapture", (event) => {
    worldContacts.delete(event.pointerId);
    state.cancel(event.pointerId);
  });
  listen(canvas, "contextmenu", (event) => event.preventDefault());

  function retryAllowed() {
    if (document.hidden || document.getElementById("menu")?.open || document.getElementById("entry")?.hidden === false)
      return false;
    // Main treats a finished encounter as paused; retain desktop death/retry.
    return !isPaused() || document.getElementById("ending")?.hidden === false;
  }

  listen(window, "keydown", (event) => {
    if (event.code === "Escape") {
      event.preventDefault();
      if (!event.repeat) onMenu();
      return;
    }
    if (event.code === "KeyR") {
      event.preventDefault();
      if (!event.repeat && retryAllowed()) onRetry();
      return;
    }
    if (isPaused()) return;
    touch = false;
    worldTap = null;
    worldContacts.clear();
    if (!isSelectOnly()) onTargetClear();
    onInteraction();
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ShiftLeft", "ShiftRight"].includes(event.code)) {
      event.preventDefault();
      touch = false;
      state.keys.add(event.code);
    }
    if (event.code === "KeyG" && !event.repeat && onPickup()) {
      event.preventDefault();
      return;
    }
    // C cycles the carried weapons (Digit1 stays Special; 1-4 are not weapon slots here).
    if (event.code === "KeyC" && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (!event.repeat) cycleWeapon();
      return;
    }
    if (map[event.code] && !event.repeat) {
      event.preventDefault();
      state.down(event.code, map[event.code], { x: 0, y: 0 });
    }
  });
  listen(window, "keyup", (event) => {
    state.keys.delete(event.code);
    state.up(event.code);
  });

  function clear({ keepMovement = false } = {}) {
    worldContacts.clear();
    worldTap = null;
    onTargetClear();
    multiTouch = false;
    lastTap = -Infinity;
    state.clear({ keepMovement });
    mouse = null;
    for (const element of document.querySelectorAll(".pressed")) {
      if (keepMovement && element.id === "move") continue;
      element.classList.remove("pressed");
      element.classList.remove("aiming");
      element.style.setProperty("--aim-angle", "0rad");
    }
    const move = document.querySelector("#move");
    if (!keepMovement) {
      move.style.setProperty("--knob-x", "0px");
      move.style.setProperty("--knob-y", "0px");
    }
  }
  listen(window, "blur", clear);
  listen(document, "visibilitychange", clear);
  // A tap on a HUD button (weapon tile, menu, Pick up) made while the move thumb is down gets no browser click: see tap-fallback.js.
  listeners.push(installTapFallback({ target: document }));
  return {
    state,
    clear,
    dispose() {
      clear();
      for (const remove of listeners.splice(0)) remove();
    },
    take: () => {
      const tap = worldTap;
      worldTap = null;
      return {
        ...state.take({ actionEdges: true }),
        mobile: touch,
        mouse: touch ? null : mouse,
        ...(tap ? { worldTap: tap } : {}),
      };
    },
  };
}
