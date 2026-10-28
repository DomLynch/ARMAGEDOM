import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { attachInput } from "../src/input.js";
import { buildKeyMap, keyHints, keyHintLine } from "../src/engine/input-keymap.js";
import { validateInputKeys, HELD_ACTION, PRESS_ACTION } from "../src/engine/input-keymap-data.js";
import { nextCarriedWeapon, carriedWeaponAt } from "../src/engine/weapon-cycle.js";
import { webText } from "../src/engine/web-text.js";

const DATA = GAME_DATA.inputKeys;

class Element extends EventTarget {
  constructor() {
    super();
    const classes = new Set();
    this.classList = { add: (n) => classes.add(n), remove: (n) => classes.delete(n), contains: (n) => classes.has(n) };
    this.style = Object.assign(new Map(), { setProperty() {} });
    this.dataset = {};
  }
  setPointerCapture() {}
}
function send(target, type, values = {}) {
  const event = new Event(type, { cancelable: true });
  Object.assign(event, { clientX: 0, clientY: 0, pointerId: 1, ...values });
  target.dispatchEvent(event);
  return event;
}
function setup(t, { pistol = false } = {}) {
  const oldWindow = globalThis.window,
    oldDocument = globalThis.document;
  const window = new EventTarget(),
    document = new EventTarget();
  const elements = Object.fromEntries(["move", "menu", "entry", "ending"].map((id) => [id, new Element()]));
  Object.assign(elements.menu, { open: false });
  elements.entry.hidden = true;
  elements.ending.hidden = true;
  document.body = new Element();
  document.hidden = false;
  document.getElementById = (id) => elements[id];
  document.querySelector = (selector) => elements[selector.slice(1)];
  document.querySelectorAll = () => [];
  document.elementFromPoint = () => null;
  globalThis.window = window;
  globalThis.document = document;
  t.after(() => {
    if (oldWindow === undefined) delete globalThis.window;
    else globalThis.window = oldWindow;
    if (oldDocument === undefined) delete globalThis.document;
    else globalThis.document = oldDocument;
  });
  const env = { window, elements, canvas: new Element(), paused: false, switches: [], menus: 0, pickups: 0, claimPickup: false };
  env.input = attachInput({
    canvas: env.canvas,
    isPistol: () => pistol,
    isPaused: () => env.paused,
    onMenu: () => env.menus++,
    onPickup: () => (env.pickups++, env.claimPickup),
    switchWeapon: (pick) => env.switches.push(pick),
  });
  return env;
}
const key = (env, code, extra = {}) => send(env.window, "keydown", { code, ...extra });
const mouse = (env, button, id = 1) => send(env.canvas, "pointerdown", { pointerType: "mouse", button, pointerId: id });

test("the shipped key map validates and no key is bound to two actions", () => {
  validateInputKeys(structuredClone(DATA));
  assert.equal(new Set(Object.values(DATA.keys).flat()).size, Object.values(DATA.keys).flat().length - 1, "only retry shares a key");
});

test("a bad key map is refused", () => {
  const bad = (edit) => {
    const copy = structuredClone(DATA);
    edit(copy);
    assert.throws(() => validateInputKeys(copy));
  };
  bad((d) => (d.keys.dodge = ["KeyW"]));
  bad((d) => (d.keys.flyAway = ["KeyP"]));
  bad((d) => (d.keys.guard = []));
  bad((d) => (d.mouse.primary.melee = "explode"));
  bad((d) => (d.wheelStepMs = -1));
  bad((d) => d.hints.push({ text: "hud.keys.move", keys: ["noSuchAction"], join: "" }));
  bad((d) => (d.extra = 1));
});

test("every action the sim and the weapon tiles accept is reachable by a key", () => {
  const map = buildKeyMap(),
    actions = new Set(Object.keys(DATA.keys));
  for (const kind of ["dodge", "stab", "heavy", "special", "guard", "pickup", "menu", "weaponNext", "weaponPrev", "sprint"])
    assert.ok(actions.has(kind), `${kind} has a key`);
  for (const slot of [1, 2, 3, 4, 5, 6]) assert.equal(map.weaponSlot(`weapon${slot}`), slot);
  for (const direction of ["moveUp", "moveDown", "moveLeft", "moveRight"]) assert.ok(HELD_ACTION.test(direction) && actions.has(direction));
  assert.ok(PRESS_ACTION.test("guard"));
  assert.equal(map.weaponStep("weaponNext"), 1);
  assert.equal(map.weaponStep("weaponPrev"), -1);
  assert.equal(map.weaponStep("dodge"), null);
});

test("WASD and the arrow keys both move, and a second key keeps the move held until both are up", (t) => {
  const env = setup(t);
  key(env, "KeyW");
  key(env, "ArrowUp");
  assert.equal(env.input.take().move.y, -1);
  send(env.window, "keyup", { code: "KeyW" });
  assert.equal(env.input.take().move.y, -1, "ArrowUp still holds it");
  send(env.window, "keyup", { code: "ArrowUp" });
  assert.equal(env.input.take().move.y, 0);
  key(env, "KeyD");
  key(env, "ShiftRight");
  const value = env.input.take();
  assert.ok(value.move.x > 0 && value.run);
});

test("keys fire each action once per press and never repeat while held", (t) => {
  const env = setup(t);
  key(env, "Space");
  key(env, "Space", { repeat: true });
  assert.equal(env.input.take().dodge, true);
  assert.equal(env.input.take().dodge, false);
  key(env, "KeyQ");
  key(env, "KeyQ", { repeat: true });
  assert.deepEqual(env.input.take().actions, ["heavy"]);
  key(env, "KeyR");
  assert.deepEqual(env.input.take().actions, ["stab"], "R is Stab / reload in play, not Retry");
  key(env, "KeyF");
  const guard = env.input.take();
  assert.ok(guard.guard && guard.guardPressed);
  send(env.window, "keyup", { code: "KeyF" });
  assert.equal(env.input.take().guard, false);
});

test("mouse: left attacks (fires with a gun), right guards (reloads with a gun), middle is Heavy, and the cursor aims", (t) => {
  const env = setup(t);
  mouse(env, 0);
  assert.deepEqual(env.input.take().actions, ["slash"]);
  send(env.canvas, "pointerup", { pointerType: "mouse" });
  mouse(env, 2);
  const guard = env.input.take();
  assert.ok(guard.guard && guard.guardPressed);
  assert.deepEqual(guard.actions, []);
  send(env.canvas, "pointerup", { pointerType: "mouse" });
  assert.equal(env.input.take().guard, false);
  mouse(env, 1);
  assert.deepEqual(env.input.take().actions, ["heavy"]);
  send(env.canvas, "pointermove", { pointerType: "mouse", clientX: 640, clientY: 360 });
  assert.deepEqual(env.input.take().mouse, { x: 640, y: 360 });
});

test("mouse with a gun: left fires and right reloads", (t) => {
  const env = setup(t, { pistol: true });
  mouse(env, 0);
  assert.deepEqual(env.input.take().actions, ["fire"]);
  send(env.canvas, "pointerup", { pointerType: "mouse" });
  mouse(env, 2);
  assert.deepEqual(env.input.take().actions, ["stab"]);
});

test("weapon switching: 1-6 pick a slot, C/X step, the wheel steps once per interval, holding a key does not spin", (t) => {
  const env = setup(t);
  key(env, "Digit3");
  key(env, "Digit3", { repeat: true });
  key(env, "KeyC");
  key(env, "KeyC", { repeat: true });
  key(env, "KeyX");
  assert.deepEqual(env.switches, [{ step: null, slot: 3 }, { step: 1, slot: null }, { step: -1, slot: null }]);
  env.switches.length = 0;
  const wheel = (deltaY) => send(env.canvas, "wheel", { deltaY });
  assert.equal(wheel(100).defaultPrevented, true);
  assert.deepEqual(env.switches, [{ step: 1 }]);
  wheel(100);
  assert.equal(env.switches.length, 1, "a second tick inside the step interval is ignored");
  assert.equal(wheel(0).defaultPrevented, true);
  env.paused = true;
  wheel(-100);
  assert.equal(env.switches.length, 1, "no switch while paused");
});

test("Esc opens the menu once, G tries a world pickup first, Ctrl/Cmd chords go to the browser", (t) => {
  const env = setup(t);
  key(env, "Escape");
  key(env, "Escape", { repeat: true });
  assert.equal(env.menus, 1);
  env.claimPickup = true;
  key(env, "KeyG");
  assert.deepEqual(env.input.take().actions, [], "a claimed pickup is not also sent to the sim");
  env.claimPickup = false;
  key(env, "KeyG");
  assert.deepEqual(env.input.take().actions, ["pickup"]);
  const chord = key(env, "KeyR", { metaKey: true });
  assert.equal(chord.defaultPrevented, false);
  assert.deepEqual(env.input.take().actions, []);
  key(env, "KeyC", { ctrlKey: true });
  assert.equal(env.switches.length, 0);
});

test("no input while paused, and a rebind in the data is followed", (t) => {
  const env = setup(t);
  env.paused = true;
  key(env, "Space");
  key(env, "KeyW");
  assert.equal(env.input.take().dodge, false);
  assert.deepEqual(env.input.take().move, { x: 0, y: 0 });
  const rebound = structuredClone(DATA);
  rebound.keys.dodge = ["KeyV"];
  rebound.keys.heavy = ["KeyQ"];
  const map = buildKeyMap(rebound);
  assert.equal(map.actionFor("KeyV"), "dodge");
  assert.equal(map.actionFor("Space"), null);
});

test("weapon order helpers: step both ways, nth slot, skip the companion and the active weapon", () => {
  const rows = [{ id: "a", active: false }, { id: "b", active: true }, { id: "pet", companion: true }, { id: "c", active: false }];
  assert.equal(nextCarriedWeapon(rows, 1).id, "c");
  assert.equal(nextCarriedWeapon(rows, -1).id, "a");
  assert.equal(carriedWeaponAt(rows, 3).id, "c");
  assert.equal(carriedWeaponAt(rows, 2), null, "already active");
  assert.equal(carriedWeaponAt(rows, 4), null, "not carried");
  assert.equal(nextCarriedWeapon([rows[0]], 1), null);
});

test("key hints come from the data: every hint has text in webText.json and a key or mouse part", () => {
  const hints = keyHints();
  assert.equal(hints.length, DATA.hints.length);
  for (const [i, hint] of hints.entries()) {
    assert.equal(hint.label, webText(DATA.hints[i].text));
    assert.ok(hint.label.length > 0 && hint.label.length <= 24, "short label");
    assert.ok(hint.keys.length > 0, `${hint.label} shows a key`);
  }
  const text = Object.fromEntries(hints.map((h) => [h.label, h.keys]));
  assert.equal(text[webText("hud.keys.move")], "WASD");
  assert.equal(text[webText("hud.keys.attack")], DATA.mouseNames.primary);
  assert.equal(text[webText("hud.keys.weapon")], `1-6${DATA.partJoin}${DATA.mouseNames.wheel}`);
  assert.match(keyHintLine(hints), /WASD/);
  const rebound = structuredClone(DATA);
  rebound.keys.moveUp = ["KeyI"];
  assert.match(keyHints(rebound)[0].keys, /^I/);
});
