import test from "node:test";
import assert from "node:assert/strict";
import { createHUD } from "../src/hud.js";

class Element extends EventTarget {
  constructor() {
    super();
    this.textContent = "";
    this.hidden = false;
    this.open = false;
    this.style = {
      setProperty: (name, value) => {
        this.style[name] = value;
      },
    };
    const classes = new Set();
    this.classList = {
      toggle: (name, enabled) =>
        enabled ? classes.add(name) : classes.delete(name),
      contains: (name) => classes.has(name),
    };
    this.attributes = new Map();
    this.small = { textContent: "" };
    this.span = { textContent: "" };
  }
  querySelector(selector) {
    assert.ok(["small", "span"].includes(selector));
    return this[selector];
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }
  showModal() {
    this.open = true;
  }
  close() {
    this.open = false;
    this.dispatchEvent(new Event("close"));
  }
}
function setup(t) {
  const previous = { document: globalThis.document, window: globalThis.window };
  const elements = new Map();
  const el = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  globalThis.document = {
    getElementById: id=>id==='special'?null:el(id),
    hidden: false,
    body: new Element(),
    addEventListener() {},
  };
  globalThis.window = new EventTarget();
  t.after(() => {
    for (const key of ["document", "window"]) {
      if (previous[key] === undefined) delete globalThis[key];
      else globalThis[key] = previous[key];
    }
  });
  const actions = { retries: 0, paused: false };
  const hud = createHUD({
    onRetry: () => actions.retries++,
    onPause: (value) => {
      actions.paused = value;
    },
    onSound() {},
  });
  return { hud, el, actions };
}
function game(donor = false) {
  return {
    ...(donor
      ? {
          pilot: "donor-knife",
          cooldowns: { heavy: 0, special: 15, dodge: 0.6 },
        }
      : {}),
    time: 10,
    wave: 1,
    enemies: [{ kind: 0 }],
    message: "",
    messageUntil: 0,
    finished: false,
    won: false,
    player: {
      hp: donor ? 75 : 50,
      maxHP: donor ? 150 : 100,
      guard: 100,
      guarding: true,
      guardBrokenUntil: 0,
      guardExposedUntil: 0,
      heavyReady: 10,
      specialReady: 10,
      dodgeReady: 10,
    },
  };
}

test("donor objective identifies one Goblin encounter without three-wave text", (t) => {
  const { hud, el } = setup(t);
  const g = game(true);
  hud.update(g);
  assert.equal(
    el("objective").textContent,
    "WESTMINSTER · GOBLIN ENCOUNTER · 1 HOSTILES",
  );
  g.enemies = [];
  hud.update(g);
  assert.equal(
    el("objective").textContent,
    "WESTMINSTER · GOBLIN ENCOUNTER · 0 HOSTILES",
  );
});
test("donor cooldown arcs use supplied periods and zero-cooldown Heavy stays finite", (t) => {
  const { hud, el } = setup(t);
  const g = game(true);
  g.player.specialReady = 17.5; // Half of its actual 15-second cooldown left.
  g.player.dodgeReady = 10.3; // Half of its actual .6-second roll left.
  hud.update(g);
  assert.ok(Math.abs(Number(el("dodge").style["--ready"]) - 0.5) < 1e-12);
  assert.equal(el("dodge").small.textContent, "0.3s");
  assert.equal(el("heavy").style["--ready"], "1");
  assert.equal(el("heavy").small.textContent, "");
  assert.equal(el("heavy").classList.contains("cooldown"), false);
  g.time = 18;
  hud.update(g);
});
test("donor displays actual 150HP maximum and held guard without false break during exposure", (t) => {
  const { hud, el } = setup(t);
  const g = game(true);
  g.player.guardExposedUntil = 11;
  hud.update(g);
  assert.equal(el("health-number").textContent, "75 / 150");
  assert.equal(el("health-fill").style.width, "50%");
  assert.equal(el("guard-number").textContent, "100 / 100");
  assert.equal(el("guard-fill").style.width, "100%");
  assert.equal(el("guard").classList.contains("pressed"), true);
  g.player.guard = 25;
  g.player.guarding = false;
  g.player.guardBrokenUntil = 11;
  hud.update(g);
  assert.equal(el("guard-number").textContent, "25 / 100");
  assert.equal(el("stamina-state").textContent, "GUARD BROKEN");
  assert.equal(el("guard-fill").style.width, "25%");
  assert.equal(el("guard").classList.contains("pressed"), false);
});
test("legacy wave HUD keeps cooldown periods but hides positive ending", (t) => {
  const { hud, el } = setup(t);
  const g = game();
  g.cooldowns = { heavy: 0, special: 15, dodge: 0.6 }; // Only the explicit pilot selects these.
  g.player.heavyReady = 10.8;
  g.player.specialReady = 13.5;
  g.player.dodgeReady = 10.525;
  hud.update(g);
  assert.equal(
    el("objective").textContent,
    "WESTMINSTER · WAVE 1 / 3 · 1 HOSTILES",
  );
  for (const id of ["heavy", "dodge"]) {
    assert.ok(Math.abs(Number(el(id).style["--ready"]) - 0.5) < 1e-12);
  }
  assert.equal(el("health-number").textContent, "50 / 100");
  g.finished = g.won = true;
  hud.update(g);
  assert.equal(el("ending").hidden, true);
});
test("donor death and Retry remain available while positive clearance stays hidden", (t) => {
  const { hud, el, actions } = setup(t);
  const g = game(true);
  g.player.hp = 0;
  g.finished = true;
  hud.update(g);
  assert.equal(el("ending").hidden, false);
  assert.equal(el("result").textContent, "THE ASH CLAIMS YOU");
  el("again").onclick();
  assert.equal(actions.retries, 1);
  hud.ready();
  hud.toggleMenu();
  assert.equal(actions.paused, true);
  el("retry").onclick();
  assert.equal(actions.retries, 2);
  assert.equal(actions.paused, false);
  g.player.hp = 150;
  g.finished = false;
  hud.update(g);
  assert.equal(el("ending").hidden, true);
  assert.equal(el("health-number").textContent, "150 / 150");
  g.finished = g.won = true;
  hud.update(g);
  assert.equal(el("ending").hidden, true);
  assert.notEqual(el("result").textContent, "CHECKPOINT CLEARED");
});

const costs = { slash: 18, stab: 14, heavy: 26, special: 40, dodge: 30 };
test("stamina uses the unified player resource and an accessible clamped gold bar", (t) => {
  const { hud, el } = setup(t),
    g = game(true);
  Object.assign(g.player, {
    stamina: 35,
    maxStamina: 100,
    guard: 90,
    exhausted: false,
  });
  g.staminaCosts = costs;
  hud.update(g);
  assert.equal(el("guard-number").textContent, "35 / 100");
  assert.equal(el("guard-fill").style.width, "35%");
  assert.equal(el("stamina-bar").attributes.get("aria-valuenow"), "35");
  assert.equal(el("stamina-bar").attributes.get("aria-valuemax"), "100");
  assert.equal(el("stamina-state").textContent, ""); // All visible actions affordable; keyboard Special remains separate.
});
test("unaffordable actions dim without disabling aim or held guard and preserve cooldown", (t) => {
  const { hud, el } = setup(t),
    g = game(true);
  Object.assign(g.player, { stamina: 17, maxStamina: 100, exhausted: false });
  g.staminaCosts = costs;
  g.player.specialReady = 17.5;
  hud.update(g);
  assert.equal(el("slash").classList.contains("low-energy"), true);
  assert.equal(el("stab").classList.contains("low-energy"), false);
  assert.equal(el("heavy").classList.contains("low-energy"), true);
  assert.equal(el("slash").small.textContent, "");
  assert.equal(el("guard").classList.contains("low-energy"), false);
  assert.equal(el("guard").classList.contains("pressed"), true);
  for (const id of ["slash", "stab", "heavy", "dodge", "guard"]) {
    assert.notEqual(el(id).disabled, true);
    assert.equal(el(id).attributes.has("disabled"), false);
    assert.equal(el(id).attributes.has("aria-disabled"), false);
  }
});
test("exhaustion dims all five controls and recovery/retry clears every stale hint", (t) => {
  const { hud, el } = setup(t),
    g = game(true);
  Object.assign(g.player, { stamina: 40, maxStamina: 100, exhausted: true });
  g.staminaCosts = costs;
  hud.update(g);
  assert.equal(el("stamina-state").textContent, "EXHAUSTED");
  for (const id of ["slash", "stab", "heavy", "dodge", "guard"])
    assert.equal(el(id).classList.contains("low-energy"), true);
  const fresh = game(true);
  Object.assign(fresh.player, {
    stamina: 100,
    maxStamina: 100,
    exhausted: false,
  });
  fresh.staminaCosts = costs;
  hud.update(fresh);
  assert.equal(el("stamina-state").textContent, "");
  assert.equal(el("guard-fill").style.width, "100%");
  for (const id of ["slash", "stab", "heavy", "dodge", "guard"])
    assert.equal(el(id).classList.contains("low-energy"), false);
  for (const id of ["slash", "stab", "heavy", "dodge"])
    assert.equal(el(id).small.textContent, "");
});
test("exact cost is affordable, zero stamina dims guard, invalid/out-of-range values stay finite", (t) => {
  const { hud, el } = setup(t),
    g = game(true);
  g.staminaCosts = costs;
  Object.assign(g.player, { stamina: 18, maxStamina: 100, exhausted: false });
  hud.update(g);
  assert.equal(el("slash").classList.contains("low-energy"), false);
  for (const [value, maximum, width, number] of [
    [-10, 100, "0%", "0 / 100"],
    [140, 100, "100%", "100 / 100"],
    [NaN, 100, "0%", "0 / 100"],
    [Infinity, 0, "0%", "0 / 100"],
    [30, 60, "50%", "30 / 60"],
  ]) {
    Object.assign(g.player, { stamina: value, maxStamina: maximum });
    hud.update(g);
    assert.equal(el("guard-fill").style.width, width);
    assert.equal(el("guard-number").textContent, number);
    assert.ok(
      Number.isFinite(
        Number(el("stamina-bar").attributes.get("aria-valuenow")),
      ),
    );
    assert.equal(el("guard").classList.contains("low-energy"), width === "0%");
  }
});
test("HUD counts current-area residents and keeps cleared exploration uninterrupted", (t) => {
  const { hud, el } = setup(t), g = game(true);
  g.encounter = { id: "hollow-scavengers" };
  g.enemies = Array.from({ length: 9 }, () => ({kind:0}));
  for (const area of ["east", "south", "westminster"]) {
    g.world = { areaId: area };hud.update(g);
    assert.equal(el("objective").textContent, `${area.toUpperCase()} · HOLLOW SCAVENGERS · 9 HOSTILES`);
    assert.equal(el("menu-area").textContent, `${area.toUpperCase()} · LONDON 2030`);
    assert.equal(el("ending").hidden, true);
  }
  g.encounterCleared = true;g.enemies = [];hud.update(g);
  assert.equal(el("objective").textContent, "WESTMINSTER · CLEARED · EXPLORE LONDON");
  assert.equal(el("ending").hidden, true);
  assert.equal(el("explore").onclick, undefined, "no Continue action is bound");
});
test('Hollow HUD uses actual survivors without a clearance modal',t=>{
 const {hud,el}=setup(t),g=game(true);g.encounter={id:'hollow-scavengers'};
 g.enemies=Array.from({length:6},()=>({kind:0}));hud.update(g);
 assert.equal(el('objective').textContent,'WESTMINSTER · HOLLOW SCAVENGERS · 6 HOSTILES');
 g.encounterCleared=true;g.enemies=[];hud.update(g);
 assert.equal(el('objective').textContent,'WESTMINSTER · CLEARED · EXPLORE LONDON');assert.equal(el('ending').hidden,true);
});
test('Fire stays enabled for neutral aim and keeps ammo counts during authoritative cooldown',t=>{
 const {hud,el}=setup(t),g=game(true);g.pistol={collected:true,equipped:true,magazine:5,reserve:12,nextFireAt:11.2,reloadingUntil:0};hud.update(g);
 assert.equal(el('slash').classList.contains('cooldown'),true);assert.equal(el('slash').classList.contains('pistol-aim'),true);assert.equal(el('slash').querySelector('small').textContent,'5/6');assert.notEqual(el('slash').disabled,true);
 g.time=11.2;hud.update(g);assert.equal(el('slash').classList.contains('cooldown'),false);assert.equal(el('slash').querySelector('small').textContent,'5/6');
 g.pistol.equipped=false;hud.update(g);assert.equal(el('slash').classList.contains('pistol-aim'),false);assert.equal(el('slash').classList.contains('cooldown'),false);
});


test('Fire magazine remains truthful through reload/pickup and clears on holster/Retry',t=>{
 const {hud,el}=setup(t),g=game(true);g.pistol={collected:true,equipped:true,magazine:6,reserve:12,nextFireAt:0,reloadingUntil:0};
 hud.update(g);assert.equal(el('slash').small.textContent,'6/6');
 g.pistol.magazine=0;g.pistol.nextFireAt=11.2;hud.update(g);assert.equal(el('slash').small.textContent,'0/6');assert.match(el('slash').attributes.get('aria-label'),/0 of 6.*12 reserve/);
 g.pistol.reloadingUntil=11.3;hud.update(g);assert.equal(el('slash').small.textContent,'0/6');assert.equal(el('stab').small.textContent,'1.3s');assert.match(el('slash').attributes.get('aria-label'),/reloading/);
 g.pistol.magazine=6;g.pistol.reserve=6;g.pistol.reloadingUntil=0;hud.update(g);assert.equal(el('slash').small.textContent,'6/6');
 g.pistol.reserve+=3;hud.update(g);assert.equal(el('slash').small.textContent,'6/6');assert.match(el('ammo').textContent,/9 RESERVE/);
 g.pistol.magazine=g.pistol.reserve=0;hud.update(g);assert.equal(el('slash').small.textContent,'0/6');
 g.pistol.equipped=false;hud.update(g);assert.equal(el('slash').small.textContent,'');
 g.world={areaId:'westminster'};g.player.pos={x:0,z:0};g.pistol={...g.pistol,collected:false,pickupAreaId:'westminster',pickupPos:{x:5,z:5}};hud.update(g);assert.equal(el('slash').span.textContent,'SLASH');
});


import {createVestState} from '../src/vest.js';
import {createSuppliesState,issueSupply} from '../src/supplies.js';
import {encodeRun,restoreRun,applySavedRun} from '../src/pistol-save.js';
function vestGame(){const g=game(true);g.world={areaId:'westminster'};g.vest=createVestState();g.supplies=createSuppliesState();g.pistol={collected:true,equipped:true,magazine:6,reserve:12,nextFireAt:0,reloadingUntil:0};return g;}
function unlockVest(g){for(const placementKey of ['westminster-roamer-2','westminster-roamer-4'])g.supplies=issueSupply(g.supplies,{areaId:'westminster',placementKey,position:{x:0,z:0},hp:0}).state;}
test('vest notice persists after transient expires, uses existing unlock and hides outside West or when finished',t=>{
 const {hud,el}=setup(t),g=vestGame();hud.update(g);assert.equal(el('notice').textContent,'');
 g.supplies=issueSupply(g.supplies,{areaId:'westminster',placementKey:'westminster-roamer-2',position:{x:0,z:0},hp:0}).state;hud.update(g);assert.equal(el('notice').textContent,'');
 g.supplies=issueSupply(g.supplies,{areaId:'westminster',placementKey:'westminster-roamer-4',position:{x:0,z:0},hp:0}).state;g.message='Scavenged rounds';g.messageUntil=11;hud.update(g);assert.equal(el('notice').textContent,'Scavenged rounds');
 g.time=11;hud.update(g);assert.equal(el('notice').textContent,'VEST BY PISTOL STASH · Walk near to equip');g.time=50;hud.update(g);assert.equal(el('notice').textContent,'VEST BY PISTOL STASH · Walk near to equip');
 g.world.areaId='east';hud.update(g);assert.equal(el('notice').textContent,'');g.world.areaId='westminster';g.finished=true;hud.update(g);assert.equal(el('notice').textContent,'');g.finished=false;g.player.hp=0;hud.update(g);assert.equal(el('notice').textContent,'');
});
test('equipped vest status follows authoritative restore, holster, transient priority and fresh Retry',t=>{
 const {hud,el}=setup(t),g=vestGame();unlockVest(g);g.vest.equipped=true;hud.update(g);assert.equal(el('notice').textContent,'VEST EQUIPPED · 10% protection');
 g.pistol.equipped=false;g.world.areaId='east';hud.update(g);assert.equal(el('notice').textContent,'VEST EQUIPPED · 10% protection');
 g.message='OUT OF AMMO · Switch to melee.';g.messageUntil=11;hud.update(g);assert.equal(el('notice').textContent,g.message);g.time=12;hud.update(g);assert.equal(el('notice').textContent,'VEST EQUIPPED · 10% protection');
 const restored=vestGame();applySavedRun(restored,restoreRun(restored,encodeRun(g)));hud.update(restored);assert.equal(el('notice').textContent,'VEST EQUIPPED · 10% protection');
 hud.update(vestGame());assert.equal(el('notice').textContent,'');assert.equal(el('ammo').hidden,false);
});

test('Assist 100percent correction setting toggles independently without changing five touch actions',t=>{
 const {el}=setup(t);let enabled;createHUD({onPause(){},onAssist:value=>enabled=value});el('assist').onclick();assert.equal(enabled,false);assert.equal(el('assist').textContent,'Assist: Off');assert.equal(el('assist').attributes.get('aria-pressed'),'false');el('assist').onclick();assert.equal(enabled,true);assert.equal(el('assist').textContent,'Assist: 100%');
});

test('five-control HUD works without Special DOM; Dodge remains enabled in pistol and guard follows mode',t=>{
 const {hud,el}=setup(t),g=game(true);g.pistol={collected:true,equipped:true,magazine:6,reserve:12,nextFireAt:0,reloadingUntil:0};hud.update(g);assert.equal(el('guard').disabled,true);assert.equal(el('guard').span.textContent,'NO GUARD');assert.notEqual(el('dodge').disabled,true);assert.equal(el('dodge').attributes.get('aria-label'),'Dodge Roll');g.pistol.equipped=false;hud.update(g);assert.equal(el('guard').disabled,false);assert.equal(el('guard').span.textContent,'GUARD');assert.notEqual(el('dodge').disabled,true);
});
