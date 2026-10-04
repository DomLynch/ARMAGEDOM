const clampStick = (value, radius) => {
  const length = Math.hypot(value.x, value.y);
  const divisor = length > radius ? length : radius;
  return { x: value.x / divisor, y: value.y / divisor };
};

export class InputState {
  constructor() {
    this.pointers = new Map();
    this.keys = new Set();
    this.clear();
  }

  down(id, kind, at) {
    if (this.pointers.has(id)) return;
    // One thumb owns movement until release; extra pad contacts cannot steer it.
    if (kind === 'move' && [...this.pointers.values()].some(p => p.kind === 'move'))
      return;
    if (kind === 'fire' && [...this.pointers.values()].some(p => p.kind === 'fire')) return;
    const alreadyGuarding = this.guardHeld();
    const pointer = { kind, start: { ...at }, at: { ...at } };
    this.pointers.set(id, pointer);
    if (kind !== 'move' && (kind !== 'guard' || !alreadyGuarding)) {
      this.pending.push({ pointer, kind });
    }
  }

  guardHeld() {
    return [...this.pointers.values()].some(
      (pointer) => pointer.kind === 'guard',
    );
  }

  get aim() {
    let owner = null;
    for (const pointer of this.pointers.values()) {
      if (pointer.aim && (!owner || pointer.aimOrder > owner.aimOrder))
        owner = pointer;
    }
    return owner ? { ...owner.aim } : null;
  }

  move(id, at) {
    const pointer = this.pointers.get(id);
    if (!pointer) return;
    pointer.at = { ...at };
    const delta = { x: at.x - pointer.start.x, y: at.y - pointer.start.y };
    if (pointer.kind === 'move') {
      // Preserve the floating touch origin: donor ratios map to this 46px pad.
      const raw = Math.hypot(delta.x, delta.y) / 46;
      this.stick = raw < .12 ? { x: 0, y: 0 } : clampStick(delta, 46);
      pointer.run = raw > 1.4 + 1e-10;
    } else if (Math.hypot(delta.x, delta.y) > 12) {
      pointer.aim = clampStick(delta, 1);
      pointer.aimOrder = ++this.aimOrder;
    }
  }

  up(id) {
    const pointer = this.pointers.get(id);
    if (pointer?.kind === 'move') this.stick = { x: 0, y: 0 };
    this.pointers.delete(id);
  }

  cancel(id) {
    // Automatic lostcapture after a successful up must preserve the quick tap.
    if (!this.pointers.has(id)) return;
    const pointer = this.pointers.get(id);
    this.pending = this.pending.filter((press) => press.pointer !== pointer);
    this.up(id);
  }

  clear() {
    this.pointers.clear();
    this.keys.clear();
    this.stick = { x: 0, y: 0 };
    this.aimOrder = 0;
    this.pending = [];
  }

  take() {
    const held = [
      ...new Set(
        [...this.pointers.values()]
          .map((pointer) => pointer.kind)
          .filter((kind) => !['move', 'guard', 'dodge'].includes(kind)),
      ),
    ];
    const move = {
      x:
        this.stick.x +
        (this.keys.has('KeyD') ? 1 : 0) -
        (this.keys.has('KeyA') ? 1 : 0),
      y:
        this.stick.y +
        (this.keys.has('KeyS') ? 1 : 0) -
        (this.keys.has('KeyW') ? 1 : 0),
    };
    const length = Math.hypot(move.x, move.y);
    if (length > 1) {
      move.x /= length;
      move.y /= length;
    }
    const presses = this.pending.splice(0);
    return {
      move,
      run: [...this.pointers.values()].some(p => p.kind === 'move' && p.run) ||
        this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      aim: this.aim,
      actions: presses
        .filter((press) => !['guard', 'dodge'].includes(press.kind))
        .map((press) => press.kind),
      held,
      guard: this.guardHeld(),
      guardPressed: presses.some((press) => press.kind === 'guard'),
      dodge: presses.some((press) => press.kind === 'dodge'),
    };
  }
}

export function attachInput({
  canvas,
  onMenu,
  onRetry,
  isPaused,
  onInteraction = () => {},
  isPistol = () => false,
}) {
  const state = new InputState();
  // Safari may ignore viewport zoom hints. Cancel browser gestures, not game
  // pointers: movement and action contacts still reach the bindings below.
  const prevent = (event) => {
    if (event.cancelable) event.preventDefault();
  };
  for (const type of ['gesturestart', 'gesturechange', 'gestureend'])
    document.addEventListener(type, prevent, { passive: false });
  let multiTouch = false, lastTap = -Infinity;
  for (const type of ['touchstart', 'touchmove']) {
    document.addEventListener(type, (event) => {
      if (type === 'touchstart' && event.touches.length === 1) multiTouch = false;
      if (event.touches.length > 1) {
        multiTouch = true;
        lastTap = -Infinity;
        prevent(event);
      }
    }, { passive: false });
  }
  document.addEventListener('touchend', (event) => {
    const target = event.target;
    const clickDriven = target?.closest?.(
      '#menu, #menu-button, #entry, #ending, #pistol-interact, a, input, select, textarea',
    );
    const fight = !isPaused() && !clickDriven && (
      target === document.body || target === document.documentElement ||
      target?.closest?.('#world, #hud, #move, #action-cluster, [data-action]')
    );
    if (!fight || multiTouch || event.touches.length || event.changedTouches.length !== 1) {
      lastTap = -Infinity;
      return;
    }
    if (event.timeStamp - lastTap < 350) prevent(event);
    lastTap = event.timeStamp;
  }, { passive: false });
  document.addEventListener('touchcancel', () => {
    multiTouch = false;
    lastTap = -Infinity;
  });
  // WebKit can require release/click activation even when pointerdown worked.
  for (const type of ['pointerup', 'touchend', 'click'])
    window.addEventListener(type, () => {
      if (!isPaused()) onInteraction();
    }, { passive: true });
  const map = {
    KeyQ: 'heavy',
    KeyE: 'special',
    Digit1: 'special',
    Space: 'dodge',
    KeyF: 'guard',
    KeyG: 'pickup',
  };
  let mouse = null,
    touch = false;

  const bind = (element, kind) => {
    element.addEventListener('pointerdown', (event) => {
      if (isPaused()) return;
      onInteraction();
      event.preventDefault();
      touch = true;
      document.body.classList.add('touch');
      element.setPointerCapture(event.pointerId);
      element.classList.add('pressed');
      const fire = isPistol() && kind === 'slash';
      state.down(event.pointerId, fire ? 'fire' : kind, { x: event.clientX, y: event.clientY });
    });
    element.addEventListener('pointermove', (event) => {
      state.move(event.pointerId, { x: event.clientX, y: event.clientY });
      if (kind === 'move') {
        element.style.setProperty('--knob-x', `${state.stick.x * 36}px`);
        element.style.setProperty('--knob-y', `${state.stick.y * 36}px`);
      } else {
        const aim = state.pointers.get(event.pointerId)?.aim;
        if (aim)
          element.style.setProperty(
            '--aim-angle',
            `${Math.atan2(aim.y, aim.x)}rad`,
          );
      }
    });
    const release = (event) => {
      if (event.type === 'pointerup') state.up(event.pointerId);
      else state.cancel(event.pointerId);
      if (
        ![...state.pointers.values()].some((pointer) => pointer.kind === kind || kind === 'slash' && pointer.kind === 'fire')
      ) {
        element.classList.remove('pressed');
      }
      if (kind === 'move') {
        element.style.setProperty('--knob-x', `${state.stick.x * 36}px`);
        element.style.setProperty('--knob-y', `${state.stick.y * 36}px`);
      }
    };
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      element.addEventListener(type, release);
    }
  };
  bind(document.querySelector('#move'), 'move');
  for (const element of document.querySelectorAll('[data-action]'))
    bind(element, element.dataset.action);

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'mouse') {
      touch = false;
      mouse = { x: event.clientX, y: event.clientY };
    }
  });
  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'mouse' || isPaused()) return;
    onInteraction();
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    mouse = { x: event.clientX, y: event.clientY };
    state.down(event.pointerId, event.button === 2 ? 'stab' : isPistol() ? 'fire' : 'slash', mouse);
  });
  canvas.addEventListener('pointerup', (event) => state.up(event.pointerId));
  canvas.addEventListener('pointercancel', (event) =>
    state.cancel(event.pointerId),
  );
  canvas.addEventListener('lostpointercapture', (event) =>
    state.cancel(event.pointerId),
  );
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  function retryAllowed() {
    if (
      document.hidden ||
      document.getElementById('menu')?.open ||
      document.getElementById('entry')?.hidden === false
    )
      return false;
    // Main treats a finished encounter as paused; retain desktop death/retry.
    return !isPaused() || document.getElementById('ending')?.hidden === false;
  }

  window.addEventListener('keydown', (event) => {
    if (event.code === 'Escape') {
      event.preventDefault();
      if (!event.repeat) onMenu();
      return;
    }
    if (event.code === 'KeyR') {
      event.preventDefault();
      if (!event.repeat && retryAllowed()) onRetry();
      return;
    }
    if (isPaused()) return;
    onInteraction();
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(event.code)) {
      event.preventDefault();
      state.keys.add(event.code);
    }
    if (map[event.code] && !event.repeat) {
      event.preventDefault();
      state.down(event.code, map[event.code], { x: 0, y: 0 });
    }
  });
  window.addEventListener('keyup', (event) => {
    state.keys.delete(event.code);
    state.up(event.code);
  });

  function clear() {
    multiTouch = false;
    lastTap = -Infinity;
    state.clear();
    mouse = null;
    for (const element of document.querySelectorAll('.pressed'))
      element.classList.remove('pressed');
    const move = document.querySelector('#move');
    move.style.setProperty('--knob-x', '0px');
    move.style.setProperty('--knob-y', '0px');
  }
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', clear);
  return {
    state,
    clear,
    take: () => ({ ...state.take(), mouse: touch ? null : mouse }),
  };
}
