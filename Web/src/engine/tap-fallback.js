import { TAP_FALLBACK } from "./tap-fallback-data.js";
// A tap made while another finger is already down (the thumb on the move pad) gets NO click from the browser: Chrome treats the second
// contact as part of a multi-touch gesture. Buttons that act on click (weapon tiles, the menu button, Pick up, safehouse and equipment
// buttons) then did nothing while the player was moving. This installs one fallback: a clean secondary tap on a button, that is not one of
// the pad or action buttons (those use pointer events and already work), is turned into a click if the browser did not send one itself
// within graceMs. A browser that does send the click is untouched (one click, never two), and a drag, a cancel or a lift off the button
// is never a tap.
export function installTapFallback({
  target = globalThis.document,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  graceMs = TAP_FALLBACK.graceMs,
  slop = TAP_FALLBACK.slopPx,
  exclude = "[data-action], #move",
} = {}) {
  const touches = new Set(), // touch pointers currently down
    taps = new Map(); // pointerId -> { button, x, y } for secondary contacts that began on a button
  let clicks = 0;
  const buttonOf = (event) => event.target?.closest?.("button") ?? null;
  const on = (type, handler) => {
    target.addEventListener(type, handler, { capture: true, passive: true });
    return () => target.removeEventListener(type, handler, { capture: true });
  };
  const removers = [
    on("click", () => clicks++),
    on("pointerdown", (event) => {
      if (event.pointerType !== "touch") return;
      const secondary = touches.size > 0;
      touches.add(event.pointerId);
      const button = buttonOf(event);
      if (secondary && button && !button.closest(exclude)) taps.set(event.pointerId, { button, x: event.clientX, y: event.clientY });
    }),
    on("pointermove", (event) => {
      const tap = taps.get(event.pointerId);
      if (tap && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > slop) taps.delete(event.pointerId);
    }),
    on("pointerup", (event) => {
      touches.delete(event.pointerId);
      const tap = taps.get(event.pointerId);
      taps.delete(event.pointerId);
      if (!tap || buttonOf(event) !== tap.button) return;
      const seen = clicks;
      setTimer(() => {
        if (clicks === seen && tap.button.isConnected && !tap.button.disabled) tap.button.click();
      }, graceMs);
    }),
    on("pointercancel", (event) => {
      touches.delete(event.pointerId);
      taps.delete(event.pointerId);
    }),
    on("touchcancel", () => {
      touches.clear();
      taps.clear();
    }),
  ];
  return () => removers.forEach((remove) => remove());
}
