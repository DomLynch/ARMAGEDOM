// Test preload (node --import, see package.json "test" and scripts/verify_web.mjs). Timed waves and boss unlock goals ship ON (6 Nov
// 2026), but most of the suite was written against the plain game: bosses placed in their pockets, no wave mobs. Node has no page
// address, so every page switch would read its shipped default; this gives the suite an address that turns the two off, using the off
// switches named in the data. An address also makes the page "a browser" for the spawn variation roll, so that is switched off too
// (it is off for a test that has no address). Kill drops and shops need no address: their tests pass their own rules. Tests that
// exercise a feature say so themselves: they pass an explicit `search` to the pure functions, or set their own globalThis.location
// before importing the engine.
import fs from "node:fs";

const data = (name) => JSON.parse(fs.readFileSync(new URL(`../src/data/${name}.json`, import.meta.url), "utf8"));
const off = [data("trashWave").offSwitch, data("bossGoals").offSwitch, { param: data("spawnVariation").offParam, value: "1" }];
globalThis.location ??= { search: `?${off.map((row) => `${row.param}=${row.value}`).join("&")}` };
