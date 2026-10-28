import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA, validateSessionText } from "../src/engine/game-data.js";
import { placeholders } from "../src/engine/game-data-session-text.js";
import { sessionText } from "../src/engine/session-text.js";

// The text gate arrives in its own PR (scripts/text-literal-gate.mjs); until it is on this branch, the last test is skipped.
const gatePath = new URL("../../scripts/text-literal-gate.mjs", import.meta.url);
const gate = fs.existsSync(gatePath) ? await import(gatePath.href) : null;

// The player-facing English of browser-session.js, run-state.js, expedition-runtime.js, commander/match.js, commander/session.js,
// mode-entry.js and account-control.js moved to data/sessionText.json. Each expected string below is the literal (or template with
// sample values filled in) the code held before, copied from origin/main (058e76b7), so this proves the shown text is string-equal.
const text = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const raw = () => structuredClone(JSON.parse(text("../src/data/sessionText.json")));

const OLD = [
  ["browser.resetUnavailable", {}, "Reset is unavailable during travel or recovery. Try again when the game is ready."],
  ["browser.resetCancelled", {}, "Reset cancelled because the session changed. The previous run was kept."],
  ["browser.resetSaveFailed", {}, "Reset could not save the fresh run. Your current run and saves were kept. Check available storage and try again."],
  ["browser.resetSavedReloading", {}, "Fresh game saved. Reloading Westminster…"],
  ["browser.resetSavedReload", {}, "Fresh game saved. Reload this page to start in Westminster."],
  ["browser.resetPrepareFailed", {}, "Reset could not prepare Westminster. Your current run and saves were kept. Try again."],
  ["browser.retrySaveUnavailable", {}, "Run saving unavailable. Retry kept the current run."],
  ["browser.retryPrepareFailed", {}, "Could not prepare Retry. Your current run was kept. Try again."],
  ["browser.graphicsPaused", {}, "Graphics paused. Reload this page to restore your fight."],
  ["browser.reloadGame", {}, "Reload game"],
  ["browser.loadingWestminster", {}, "Loading Westminster…"],
  ["browser.loadingRigs", {}, "Loading London and the original character rigs…"],
  ["browser.loadStopped", {}, "Loading has stopped. Check your connection, then tap Retry."],
  ["browser.progressSynced", {}, "Progress synced"],
  ["browser.versionLabel", {}, "Three.js · Starting pistol V1 · Approved006 framing"],
  ["browser.loadFailed", {}, "A game file could not be loaded. Check your connection, then tap Retry."],
  ["run.supplyRounds", { amount: 3 }, `Scavenged ${3} spare rounds.`],
  ["run.supplyDressing", { amount: 2 }, `Dressing restored ${2} health.`],
  ["run.pistolRequired", {}, "Collect the pistol first. Rounds kept."],
  ["run.reserveFull", {}, "Spare rounds full. Supply kept."],
  ["run.healthFull", {}, "Health full. Dressing kept."],
  ["run.vestEquipped", { percent: Math.round(GAME_DATA.weapons.vest.reduction * 100) }, "Worn vest equipped · 10% protection from unblocked hits."],
  ["expedition.actionAccept", {}, "Accept contract"],
  ["expedition.actionRecover", {}, "Recover supply case"],
  ["expedition.actionClaim", {}, "Complete contract & claim reward"],
  ["expedition.viewGear", {}, "View Gear"],
  ["expedition.viewEarnedGear", {}, "View earned gear"],
  ["expedition.journalAvailable", {}, "Optional · accept at the Westminster stash, or recover the case in East."],
  ["expedition.journalAccepted", {}, "Next: recover the supply case in East. Fighting Hale is optional."],
  ["expedition.journalRecoveredReady", {}, "At the Westminster stash · claim your reward."],
  ["expedition.journalRecovered", {}, "Case recovered · return to the Westminster stash."],
  ["expedition.journalClaimed", {}, "Reward claimed once · choose your earned weapon in Gear."],
  ["expedition.reachEast", {}, "Reach Central Safehouse."],
  ["expedition.bossDown", {}, "Boss down. Return to Safehouse."],
  ["areaObjective.central-hub", {}, "Pick a road. Each area has a boss."],
  ["areaObjective.east", {}, "Head for East Bridge or Elephant and Castle."],
  ["areaObjective.south", {}, "Kill the Southbank Stalker."],
  ["areaObjective.east-bridge", {}, "Kill the Bridge Warden."],
  ["areaObjective.elephant-and-castle", {}, "Kill the Borough Butcher."],
  ["areaObjective.lambeth", {}, "Kill the Lambeth Surgeon."],
  ["areaObjective.area7", {}, "Kill the Station Breaker."],
  ["areaObjective.area8", {}, "Kill the Borough Marshal."],
  ["expedition.descriptionCompanion", { summary: "S.", name: "Watchman" }, `${"S."} Reward: ${"Watchman"}, an autonomous companion alongside your held weapon.`],
  [
    "expedition.descriptionWeapon",
    { summary: "S.", name: "Marshal", damage: 30, percent: 20, baseDamage: 25, reload: "1.0", baseReload: "1.3" },
    `${"S."} Reward: ${"Marshal"}, ${30} base damage (+${20}%; starting pistol ${25}); reload ${"1.0"}s (starting pistol ${"1.3"}s).`,
  ],
  ["expedition.rewardCompanion", { name: "Watchman" }, `Reward: ${"Watchman"} · autonomous companion`],
  ["expedition.rewardWeapon", { name: "Marshal", percent: 20, reload: "1.0" }, `Reward: ${"Marshal"} · +${20}% base damage · ${"1.0"}s reload.`],
  ["expedition.resetHint", {}, "Open the menu and choose Reset game."],
  ["expedition.atlasMap", { count: 9 }, `${9} areas. Select a destination to show only its route. Tile positions are schematic.`],
  ["expedition.nodeCurrent", {}, "● "],
  ["expedition.nodeVisited", {}, " ✓"],
  ["expedition.nodeObjective", {}, " ⚑"],
  ["expedition.nodePinned", {}, " · PIN"],
  ["expedition.nodeUndiscovered", {}, "? Undiscovered"],
  ["expedition.labelUndiscovered", {}, "Undiscovered area"],
  ["expedition.labelCurrent", {}, ", current area"],
  ["expedition.labelVisited", {}, ", visited"],
  ["expedition.labelObjective", {}, ", objective"],
  ["expedition.labelPinned", {}, ", pinned"],
  ["expedition.routeNext", { area: "East", next: "Bridge" }, `Pinned ${"East"} · next exit: ${"Bridge"}`],
  ["expedition.routeGate", { gate: "Locked" }, ` · ${"Locked"}`],
  ["expedition.routeHere", { area: "East" }, `Pinned ${"East"} · you are here.`],
  ["expedition.routeChoose", {}, "Choose a known destination to show its route. Tile positions are schematic. ● Current · ✓ Visited · ⚑ Objective"],
  ["expedition.pistolStored", {}, "Stored pistol"],
  ["expedition.pistolEquipped", {}, "Equipped pistol"],
  ["expedition.pistolHolstered", {}, "Holstered pistol"],
  [
    "expedition.equipmentState",
    { stance: "Equipped pistol", name: "Pistol", damage: 25, reload: "1.3", magazine: 4, capacity: 6, reserve: 7, hint: "" },
    `${"Equipped pistol"}: ${"Pistol"} · damage ${25} · reload ${"1.3"}s · ${4}/6 loaded, ${7} reserve.${""}`,
  ],
  ["expedition.equipmentCollect", {}, " Collect the pistol at the stash to use your retained variant."],
  ["expedition.variantStored", { name: "Marshal" }, `Stored · ${"Marshal"}`],
  ["expedition.variantChoice", { state: "Equip", name: "Marshal" }, `${"Equip"} · ${"Marshal"}`],
  ["expedition.stateEquipped", {}, "Equipped"],
  ["expedition.stateEquip", {}, "Equip"],
  ["expedition.stateLocked", {}, "Locked"],
  ["expedition.comparisonRow", { name: "Marshal", damage: 30, reload: "1.0" }, `${"Marshal"}: ${30} damage · ${"1.0"}s reload`],
  ["commander.unavailable", {}, "Match or order unavailable"],
  ["commander.capReached", {}, "Three-unit cap reached"],
  ["commander.reserveExhausted", {}, "Reserve exhausted"],
  ["commander.pointOccupied", {}, "Deployment point occupied"],
  ["commander.selectFirst", {}, "Select a machine first"],
  ["commander.chooseOpponent", {}, "Choose a living biological opponent"],
  ["commander.outsideRoad", {}, "Destination is outside the clear road"],
  ["commander.noRoute", {}, "No body-clear route for the selected formation"],
  ["commander.resultCaptured", {}, "Checkpoint captured and defended"],
  ["commander.resultDestroyed", {}, "Checkpoint destroyed"],
  ["commander.resultTime", {}, "Time expired"],
  ["commander.resultReserve", {}, "Squad and replacement reserve exhausted"],
  ["commander.objectiveCapture", { done: "1.5", total: 10 }, `Capture checkpoint · ${"1.5"} / ${10}s`],
  ["commander.objectiveDefend", { done: "2.5", total: 30 }, `Defend checkpoint · ${"2.5"} / ${30}s`],
  ["commander.integrity", { hp: 80, max: 100, seconds: 120 }, `Checkpoint ${80} / ${100} · ${120}s`],
  ["commander.reserve", { alive: 2, cap: 3, reserve: 4 }, `Machines ${2} / ${3} · Reserve ${4}`],
  ["commander.paused", {}, "Paused"],
  ["commander.selected", { count: 2, hint: "tap clear road to move" }, `${2} selected · ${"tap clear road to move"}`],
  ["commander.hintAttack", {}, "tap a biological opponent"],
  ["commander.hintMove", {}, "tap clear road to move"],
  ["commander.selectDrone", {}, "Select a drone or choose All"],
  ["commander.droneButton", { id: 7, hp: 5, max: 8 }, `Drone ${7} · ${5}/${8}`],
  ["commander.resume", {}, "Resume"],
  ["commander.pause", {}, "Pause"],
  ["commander.titleSuccess", {}, "Checkpoint secured"],
  ["commander.titleLoss", {}, "Checkpoint lost"],
  ["commander.matchUnavailable", {}, "Commander match unavailable"],
  ["commander.selectLiving", {}, "Select a living machine"],
  ["commander.deployed", {}, "Replacement deployed"],
  ["commander.orderAccepted", { order: "Move" }, `${"Move"} order accepted`],
  ["commander.loading", {}, "Loading Commander · Westminster…"],
  ["commander.loadFailed", { error: "boom" }, `Commander could not load: ${"boom"}. Return to the menu and retry.`],
  ["commander.tapOpponent", {}, "Tap a biological opponent to attack"],
  ["commander.graphicsInterrupted", {}, "Graphics interrupted · return to menu and retry"],
  ["mode.playHuman", {}, "Play as Human"],
  ["mode.choose", {}, "Choose how to play."],
  ["mode.startFailed", { mode: "Human", error: "x" }, `Could not start ${"Human"}: ${"x"}`],
  ["mode.modeHuman", {}, "Human"],
  ["mode.modeCommander", {}, "Commander"],
  ["account.signIn", {}, "Sign in with Google to keep progress"],
  ["account.signInUnavailable", {}, "Sign-in is unavailable right now."],
];

test("every string the files used to hold is returned byte for byte, with its values filled in", () => {
  for (const [key, values, expected] of OLD) assert.equal(sessionText(key, values), expected, key);
});

test("the data holds exactly the keys above and no others", () => {
  const keys = Object.entries(GAME_DATA.sessionText)
    .filter(([group]) => group !== "schema_version")
    .flatMap(([group, rows]) => Object.keys(rows).map((key) => `${group}.${key}`));
  assert.deepEqual(keys.sort(), OLD.map(([key]) => key).sort());
  assert(Object.isFrozen(GAME_DATA.sessionText));
});

test("the helper refuses a missing key, a missing value and a prototype name, and does not expand braces inside a value", () => {
  assert.throws(() => sessionText("run.nope"), /No session text run.nope/);
  assert.throws(() => sessionText("nope.vestEquipped"), /No session text/);
  assert.throws(() => sessionText("constructor.name"), /No session text/);
  assert.throws(() => sessionText("run.supplyRounds"), /needs \{amount\}/);
  assert.equal(sessionText("mode.startFailed", { mode: "Human", error: "{mode} {x}" }), "Could not start Human: {mode} {x}");
  assert.equal(sessionText("run.vestEquipped", { percent: 10, unused: 1 }), "Worn vest equipped · 10% protection from unblocked hits.");
});

test("each call in the source files names a key that exists, and each key is used by some call", () => {
  const files = [
    "engine/browser-session.js", "engine/run-state.js", "engine/expedition-runtime.js", "engine/commander/match.js",
    "engine/commander/session.js", "engine/mode-entry.js", "engine/account-control.js",
  ];
  const all = new Set(OLD.map(([key]) => key)),
    used = new Set();
  for (const file of files) {
    const src = text(`../src/${file}`);
    for (const m of src.matchAll(/"((?:browser|run|expedition|commander|mode|account)\.[A-Za-z]+)"/g)) used.add(m[1]);
    for (const m of src.matchAll(/\bmark\([^,]+,\s*"([A-Za-z]+)"\)/g)) used.add(`expedition.${m[1]}`);
  }
  for (const key of used) assert(all.has(key), `${key} is used but not in the data`);
  // areaObjective rows are looked up by area id at run time, so no source file names them.
  for (const key of all) assert(used.has(key) || key.startsWith("areaObjective."),`${key} is in the data but no source file uses it`);
});

test("the placeholders in each string are exactly the values its call site passes", () => {
  for (const [key, values] of OLD) {
    const [group, name] = key.split(".");
    assert.deepEqual(placeholders(GAME_DATA.sessionText[group][name]).sort(), [...new Set(Object.keys(values))].sort(), key);
  }
});

test("the loader refuses missing, extra, empty and malformed text", () => {
  const broken = (mutate) => () => { const d = raw(); mutate(d); validateSessionText(d); };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken((d) => { delete d.run; }));
  assert.throws(broken((d) => { d.extra = {}; }));
  assert.throws(broken((d) => { d.run = {}; }));
  assert.throws(broken((d) => { d.run.vestEquipped = ""; }));
  assert.throws(broken((d) => { d.run.vestEquipped = 5; }));
  assert.throws(broken((d) => { d.run["bad key"] = "x"; }));
  assert.throws(broken((d) => { d.run.supplyRounds = "Scavenged {amount spare rounds."; }));
  assert.throws(broken((d) => { d.run.supplyRounds = "Scavenged {1} spare rounds."; }));
  assert.throws(broken((d) => { d.browser = []; }));
});

test("the text gate counts 0 in the session files, and every text-ok mark carries a reason", { skip: !gate }, () => {
  const files = [
    "engine/browser-session.js", "engine/run-state.js", "engine/expedition-runtime.js", "engine/commander/match.js",
    "engine/commander/session.js", "engine/mode-entry.js", "engine/account-control.js", "engine/movement-trace.js",
    "engine/save-client.js", "engine/remote-survivors.js", "engine/guest-auth.js", "engine/client-log.js",
  ];
  for (const file of files) {
    const r = gate.countTextLiterals(text(`../src/${file}`));
    assert.equal(r.count, 0, `${file}: ${r.items.map((i) => `${i.line} ${i.text}`).join("; ")}`);
    assert.deepEqual(r.unexplained, [], file);
  }
});
