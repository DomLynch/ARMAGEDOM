import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { countTextLiterals, textLiteralProblems } from "../../scripts/text-literal-gate.mjs";

const count = (src) => countTextLiterals(src).count;

test("a quoted sentence a player can read counts, in any quote style", () => {
  assert.equal(count('notice("Pistol collected and equipped.");'), 1);
  assert.equal(count("label = 'Return to normal weapon';"), 1);
  assert.equal(count("msg = `Scavenged ${n} spare rounds.`;"), 1);
});

test("ALL CAPS banners, one-letter first words and two-word labels count", () => {
  assert.equal(count('route("KILL THE SALAMANDER");'), 1);
  assert.equal(count('notice("A hunter is after you");'), 1);
  assert.equal(count('button.textContent = "Reload game";'), 1);
  assert.equal(count('label = "Loading Westminster…";'), 1);
});

test("text that continues after a leading ${} or separator counts", () => {
  assert.equal(count("msg = `${name} equipped.`;"), 1);
  assert.equal(count('tag = " · tap to equip";'), 1);
  assert.equal(count('tag = " · FLAME BURST — MOVE ASIDE";'), 1);
});

test("one-word labels, keys, ids, class lists and CSS do not count", () => {
  assert.equal(count('const id = "westminster"; el.className = "hud-row active";'), 0);
  assert.equal(count('button.textContent = "Fire";'), 0);
  assert.equal(count("el.style.transform = `translate(${x}px, ${y}px)`;"), 0);
  assert.equal(count("pos = `${x}px ${y}px`;"), 0);
});

test("error and validation text, comments and imports do not count", () => {
  assert.equal(count('throw TypeError("Rifle requires existing save data");'), 0);
  assert.equal(count('fail("atmosphere", "Smoke colour must be three numbers");'), 0);
  assert.equal(count('showError("Saving is unavailable right now");'), 1, "UI that shows an error is still player text");
  assert.equal(count('// "This is a comment sentence"'), 0);
  assert.equal(count('const x = 1; // "Trailing comment sentence here"'), 0);
});

test("a text-ok mark exempts its line and needs a reason", () => {
  assert.equal(count('mesh.name = "Reaper Drone companion"; // text-ok: internal mesh name'), 0);
  assert.deepEqual(countTextLiterals('mesh.name = "Reaper Drone companion"; // text-ok:').unexplained, [1]);
});

test("the ratchet fails an increase and a new file; strict mode also fails a missing lowering", () => {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(process.env.TMPDIR ?? "/tmp"), "textgate-"));
  try {
    const write = (name, src) => {
      const p = path.join(dir, name);
      fs.writeFileSync(p, src);
      return p;
    };
    const a = write("a.js", 'say("Bank carried cash now"); say("Stored in the safehouse");'),
      b = write("b.js", 'say("Bank carried cash now");'),
      c = write("c.js", 'say("Bank carried cash now");');
    const baseline = { textLiterals: { "a.js": 1, "b.js": 2 } };
    const tolerant = textLiteralProblems([a, b, c], baseline, dir, { shrinkTolerance: true });
    assert.equal(tolerant.length, 2);
    assert(tolerant.some((p) => p.startsWith("a.js") && p.includes("limit 1")));
    assert(tolerant.some((p) => p.startsWith("c.js") && p.includes("limit 0")));
    const strict = textLiteralProblems([b], baseline, dir, { shrinkTolerance: false });
    assert(strict[0].includes("Lower it to 1"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the real tree is within the seeded text baseline", () => {
  const root = new URL("../src/", import.meta.url).pathname;
  const walk = (d) =>
    fs
      .readdirSync(d, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith(".js") ? [path.join(d, e.name)] : []));
  const baseline = JSON.parse(fs.readFileSync(new URL("../../scripts/as-data-baseline.json", import.meta.url)));
  assert.deepEqual(textLiteralProblems(walk(root), baseline, root), []);
  assert(Object.values(baseline.textLiterals).every((n) => Number.isInteger(n) && n > 0));
});
