import test from "node:test";
import assert from "node:assert/strict";
import { showExitLock } from "../src/engine/areas.js";
import { createFirstTimeHints } from "../src/first-time-hints.js";

const memory = () => ({ getItem: () => null, setItem() {} });
const session = (routeLine) => ({
  world: { exitHint: () => routeLine },
  game: { time: 10, message: "", messageUntil: 0, player: { pos: { x: 0, z: 0 } } },
});

test("a locked exit says why, unless the yellow route line already says the same", () => {
  const plain = session("");
  showExitLock(plain, { message: "Kill the Salamander" });
  assert.equal(plain.game.message, "Kill the Salamander");
  assert.equal(plain.game.messageUntil, 14);

  const other = session("← WESTMINSTER SHELTER · 25m");
  showExitLock(other, { message: "Kill the Salamander" });
  assert.equal(other.game.message, "Kill the Salamander", "a different route line does not hide the reason");

  const same = session("← KILL THE SALAMANDER · 17m");
  showExitLock(same, { message: "Kill the Salamander" });
  assert.equal(same.game.message, "", "the line already says it: no second notice");
  assert.equal(same.game.messageUntil, 0);
});

test("a boxed first-time hint waits while the route line shows, and is not used up", () => {
  const hints = createFirstTimeHints({ storage: memory() });
  const g = {
    time: 1,
    messageUntil: 0,
    finished: false,
    player: { hp: 100, pos: { x: 0, z: 0 } },
    enemies: [{ hp: 10, pos: { x: 3, z: 0 } }],
  };
  assert.equal(hints.current(g, true), "", "route line active: no boxed hint over it");
  g.time += 30;
  assert.match(hints.current(g, true), /^$/, "still waiting, nothing consumed");
  assert.match(hints.current(g, false), /SLASH or STAB/, "it shows once the route line is gone");
});

test("the yellow route line and toasts sit a clear gap (>= 20px) below the HUD block, set by one CSS variable", async () => {
  const { readFileSync } = await import("node:fs");
  const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8");
  const gap = /--hud-status-gap:\s*(\d+)px/.exec(css);
  assert.ok(gap && Number(gap[1]) >= 20, "the gap is a CSS variable of at least 20px");
  assert.match(/#vitals\s*\{([^}]*)\}/.exec(css)[1], /margin-bottom:\s*var\(--hud-status-gap\)/);
  assert.doesNotMatch(css, /#notice:not\(\.hint\)\s*\{\s*margin-top/, "no second, smaller offset on the notice");
});
