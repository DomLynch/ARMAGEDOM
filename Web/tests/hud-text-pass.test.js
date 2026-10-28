import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { hudMessage } from "../src/hud.js";
import { progressionObjective } from "../src/engine/expedition-runtime.js";

const css = readFileSync(new URL("../src/style.css", import.meta.url), "utf8"),
  html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("vitals, ammo and the three centre lines share one flex column, so they cannot overlap", () => {
  const column = /#hud-top\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
  assert.match(column, /display:\s*flex/);
  assert.match(column, /flex-direction:\s*column/);
  const inside = /<div id="hud-top">([\s\S]*?)<button id="menu-button"/.exec(html)?.[1] ?? "";
  for (const id of ["vitals", "ammo", "notice", "expedition-objective", "marked-status"])
    assert.ok(inside.includes(`id="${id}"`), `${id} is in the column`);
});

test("ammo has no fixed offset of its own, and each centre line shows at most two lines with an ellipsis", () => {
  assert.doesNotMatch(/#ammo\s*\{([^}]*)\}/.exec(css)[1], /top:|position:\s*absolute/);
  const rule = /#notice:not\(\.hint\),\s*#marked-status,[^{]*\{([^}]*)\}/.exec(css)[1];
  assert.match(rule, /-webkit-line-clamp:\s*2/);
  assert.match(rule, /text-overflow:\s*ellipsis/);
  assert.match(rule, /position:\s*static/);
});

test("outside Westminster each area shows its one objective line", () => {
  assert.equal(progressionObjective({ world: { areaId: "east" } }).objective, "Head for East Bridge or Elephant and Castle.");
  const world = { areaId: "south", bossData: { placements: [{ areaId: "south" }] } };
  assert.equal(progressionObjective({ world, enemies: [{ hp: 9, bossProfile: {} }] }).objective, "Kill the Southbank Stalker.");
});

test("Boss down needs a boss seen alive in that area first, so a late spawn never flashes it", () => {
  const world = { areaId: "south", bossData: { placements: [{ areaId: "south" }] } },
    g = { world, enemies: [] };
  assert.equal(progressionObjective(g).objective, "Kill the Southbank Stalker.");
  g.enemies = [{ hp: 9, bossProfile: {} }];
  assert.equal(progressionObjective(g).objective, "Kill the Southbank Stalker.");
  g.enemies = [];
  assert.match(progressionObjective(g).objective, /^Boss down/);
  g.world = { areaId: "east-bridge", bossData: { placements: [{ areaId: "east-bridge" }] } };
  assert.equal(progressionObjective(g).objective, "Kill the Bridge Warden.");
});

test("the hunter warnings never reach the HUD; other messages pass through", () => {
  for (const line of ["HUNTER INBOUND · find cover or reach a safehouse.", "A hunter is after you", "Hunter in 3s"])
    assert.equal(hudMessage(line), "");
  assert.equal(hudMessage("PISTOL EQUIPPED"), "PISTOL EQUIPPED");
  assert.equal(hudMessage(undefined), "");
});
