import test from "node:test";
import assert from "node:assert/strict";
import { webText } from "../src/engine/web-text.js";

// The single-word hud.js labels, as they were written in code before they moved to data/webText.json: the on-screen text must not change.
const LABELS = {
  "hud.label.exhausted": "EXHAUSTED",
  "hud.label.low": "LOW",
  "hud.label.knife": "KNIFE",
  "hud.label.pistol": "PISTOL",
  "hud.label.rifle": "RIFLE",
  "hud.label.fire": "FIRE",
  "hud.label.reload": "RELOAD",
  "hud.label.melee": "MELEE",
  "hud.label.slash": "SLASH",
  "hud.label.stab": "STAB",
  "hud.label.heavy": "HEAVY",
  "hud.label.guard": "GUARD",
  "hud.label.throw": "THROW",
  "hud.label.range": "RANGE",
  "hud.label.mode": "MODE",
  "hud.label.sticky": "STICKY",
  "hud.label.standard": "STANDARD",
  "hud.label.rocket": "ROCKET",
  "hud.label.shotgun": "SHOTGUN",
  "hud.label.flame": "FLAME",
  "hud.label.return": "RETURN",
  "hud.label.cut": "CUT",
  "hud.label.hold": "HOLD",
  "hud.aria.guard": "Guard",
  "hud.aria.reload": "Reload",
  "hud.aria.stickyMode": "Sticky",
  "hud.aria.standardMode": "Standard",
  "hud.aria.rocket": "rocket",
  "hud.aria.shotgun": "shotgun",
};

test("single-word hud labels read from data are string-equal to the old literals", () => {
  for (const [id, expected] of Object.entries(LABELS)) assert.equal(webText(id), expected, id);
});

test("the composed hud lines that embed those labels read as before", () => {
  assert.equal(webText("hud.fire.boss", { kind: webText("hud.aria.rocket"), magazine: 2 }), "Fire rocket once; 2 loaded");
  assert.equal(
    webText("hud.grenadeMode", { mode: webText("hud.aria.stickyMode") }),
    "Switch grenade mode; Sticky selected",
  );
  assert.equal(
    webText("hud.ammo.grenade", { mode: webText("hud.label.standard"), magazine: 3, fuse: 1 }),
    "STANDARD GRENADES · 3 LEFT · 1s FUSE",
  );
});
