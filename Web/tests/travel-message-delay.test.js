import test from "node:test";
import assert from "node:assert/strict";
import { showTravelMessageAfterDelay, TRAVEL_MESSAGE_DELAY_MS } from "../src/engine/areas.js";

// A timer the test advances by hand: no real waiting.
function fakeTimers() {
  const pending = [];
  return {
    setTimer: (fn, ms) => pending.push({ fn, ms }) - 1,
    fire: () => pending.forEach((t) => t.fn()),
    pending,
  };
}
const setup = () => {
  const draws = [],
    game = { message: "", messageUntil: 0, time: 10 };
  return { game, draws, s: { hud: { update: (g) => draws.push(g.message) } } };
};

test("a travel that lasts past the delay shows the message, then the HUD is redrawn", () => {
  const { s, game, draws } = setup(),
    timers = fakeTimers();
  showTravelMessageAfterDelay(s, game, "hub", TRAVEL_MESSAGE_DELAY_MS, timers.setTimer);
  assert.equal(timers.pending[0].ms, 300);
  assert.equal(game.message, "", "nothing yet: the travel may still be instant");
  timers.fire();
  assert.equal(game.message, "Traveling to HUB…");
  assert.equal(game.messageUntil, 14);
  assert.deepEqual(draws, ["Traveling to HUB…"]);
});

test("an instant hop (travel ends before the delay) never shows the message, even if the timer fires late", () => {
  const { s, game, draws } = setup(),
    timers = fakeTimers();
  const cancel = showTravelMessageAfterDelay(s, game, "hub", TRAVEL_MESSAGE_DELAY_MS, timers.setTimer);
  cancel();
  timers.fire();
  assert.equal(game.message, "");
  assert.deepEqual(draws, []);
});
