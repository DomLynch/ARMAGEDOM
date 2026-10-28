import { GAME_DATA } from "./game-data.js";
// Picking something up (a weapon that auto-equips, the starting pistol, rounds, dressing, the vest, loot) glows the screen edge gold for a
// moment. Rule, colour and timing are visual.json `pickupFlash`; the message that goes with a weapon is combatText gear.equipped
// ("Switched to <weapon>."). `observe(events, now)` looks only at events it has not seen in that array yet: any picked-up event starts one
// flash (several events together, or a new one while it is still fading, are the same flash) and it returns true when it started one.
// stepGame replaces g.events at the start of every step, so a pickup that lands between steps (the async auto-equip, the pistol claim from a
// tap) would be wiped unseen; the loop therefore observes g.events both just before and just after each step.
// The overlay is #pickup-flash (pointer-events none), so it never touches input or the six touch actions.
export function createPickupFlash(
  node = globalThis.document?.getElementById("pickup-flash"),
  data = GAME_DATA.visual.pickupFlash,
) {
  const kinds = new Set(data.events),
    seen = new WeakMap(); // events array -> how many of its events were already looked at
  let until = 0;
  node?.style?.setProperty("--pickup-flash-colour", `#${data.colour}`);
  node?.style?.setProperty("--pickup-flash-opacity", String(data.peakOpacity));
  node?.style?.setProperty("--pickup-flash-seconds", `${data.seconds}s`);
  return {
    observe(events, now = globalThis.performance?.now() ?? 0) {
      if (!events) return false;
      const fresh = events.slice(seen.get(events) ?? 0);
      seen.set(events, events.length);
      if (now < until || !fresh.some((e) => kinds.has(e?.type))) return false;
      until = now + data.seconds * 1000;
      if (node) {
        node.classList.remove("on");
        void node.offsetWidth; // restart the CSS animation
        node.classList.add("on");
      }
      return true;
    },
    dispose() {
      node?.classList?.remove("on");
    },
  };
}
