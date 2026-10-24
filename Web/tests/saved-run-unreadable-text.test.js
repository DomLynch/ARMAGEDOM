import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const MESSAGE = "Saved run could not be read. Open the menu and choose Reset game to start fresh.";

test("the in-game message for an unreadable saved run points at Reset game, not at a recovery players cannot do", () => {
  const source = read("../src/engine/run-core.js");
  assert.ok(source.includes(`g.message = "${MESSAGE}";`));
  assert.ok(!source.includes("recover it before retrying"));
  assert.ok(!source.includes("Saved run invalid"));
});

test("disabled Retry encounter and Try again carry a hint to use the menu", () => {
  const source = read("../src/engine/expedition-runtime.js");
  assert.ok(
    source.includes(
      'el("retry").title = el("again").title = g.runSaveInvalid ? "Open the menu and choose Reset game." : "";',
    ),
  );
  assert.ok(source.indexOf('el("retry").disabled') < source.indexOf('el("retry").title'));
});
