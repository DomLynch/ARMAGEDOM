import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), "utf8");

test("the menu has one way out, the X: no Back to game button, and the X still unlocks audio on close", () => {
  const html = read("../index.html"),
    header = /<header id="menu-header">[\s\S]*?<\/header>/.exec(html)[0];
  assert.ok(header.includes('id="close-menu"'), "the X stays");
  assert.ok(!/id="resume"|Back to game/.test(html), "no duplicate close button");
  assert.ok(!/#resume/.test(read("../src/style.css")), "its style is gone with it");
  const session = read("../src/engine/browser-session.js");
  assert.ok(session.includes('getElementById("close-menu"), "click", () => audio.unlock()'), "closing from the X unlocks audio");
  assert.ok(!session.includes('getElementById("resume")'));
});
