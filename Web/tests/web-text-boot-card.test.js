import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { webText } from "../src/engine/web-text.js";

// The load-failure card's text for the inline boot-failure script lives in index.html (that script runs when the game bundle did not
// load, so it cannot read webText.json). The page's copy and webText.json must say the same thing, so the wording has one owner.
const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const attribute = (name) => new RegExp(`${name}="([^"]*)"`).exec(html)?.[1];

test("the boot failure card text in index.html equals webText.json boot.failed and boot.retry", () => {
  assert.equal(attribute("data-boot-failed"), webText("boot.failed"));
  assert.equal(attribute("data-boot-retry"), webText("boot.retry"));
});

test("the boot failure card text is the wording the card showed before, without the failure detail", () => {
  assert.equal(webText("boot.failed"), "Could not load the game. Check your connection and retry.");
  assert.equal(webText("boot.retry"), "Retry loading");
});

test("the in-game load card and the boot card use the same Retry wording", () => {
  assert.equal(webText("boot.retry"), webText("hud.retryLoading"));
});
