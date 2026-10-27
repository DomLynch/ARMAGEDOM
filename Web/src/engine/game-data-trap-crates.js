// trapCrates.json: booby-trapped crates hidden in each area. Opening one grants better loot than a normal pickup, then a grenade-style
// fuse runs and the blast hits the player unless a dodge roll is in its invulnerable window. The numbers (fuse, respawn, loot) live in
// the JSON; the blast radius and damage come from the standard grenade payload in weapons.json. engine/trap-crate.js runs the data,
// engine/trap-crate-view.js draws it. Placements are checked against the real road geometry in tests/trap-crate.test.js.
import { closed } from "./content-schema.js";
import { fail, number } from "./game-data-checks.js";

const SHAPES = ["box", "cylinder"];
const hex = (field, v) => {
  if (typeof v !== "string" || !/^[0-9a-f]{6}$/.test(v)) fail("trapCrates", `${field} must be a six digit hex colour`);
};
const triple = (field, v, min) => {
  if (!Array.isArray(v) || v.length !== 3 || !v.every((n) => Number.isFinite(n) && n >= min))
    fail("trapCrates", `${field} must be three numbers`);
};

export function validateTrapCrates(d) {
  closed(d, [
    "schema_version",
    "respawnSeconds",
    "openRadius",
    "offscreenMargin",
    "fuseSeconds",
    "beepSeconds",
    "blast",
    "loot",
    "text",
    "cue",
    "audio",
    "model",
    "placements",
  ]);
  closed(d.audio, ["open", "beep"]);
  for (const [name, row] of Object.entries(d.audio)) {
    closed(row, ["from", "to", "seconds", "gain"], ["type"]);
    number("trapCrates", `audio.${name}.from`, row.from, 1);
    number("trapCrates", `audio.${name}.to`, row.to, 1);
    number("trapCrates", `audio.${name}.seconds`, row.seconds, 0.001);
    if (!(row.gain > 0 && row.gain <= 1)) fail("trapCrates", `audio.${name}.gain`);
    if ("type" in row && !["sine", "triangle", "sawtooth"].includes(row.type)) fail("trapCrates", `audio.${name}.type`);
  }
  number("trapCrates", "respawnSeconds", d.respawnSeconds, 1);
  number("trapCrates", "openRadius", d.openRadius, 0.2);
  number("trapCrates", "offscreenMargin", d.offscreenMargin, 0);
  number("trapCrates", "fuseSeconds", d.fuseSeconds, 0.5);
  closed(d.beepSeconds, ["first", "last"]);
  number("trapCrates", "beepSeconds.last", d.beepSeconds.last, 0.02);
  number("trapCrates", "beepSeconds.first", d.beepSeconds.first, d.beepSeconds.last);
  closed(d.blast, ["profile", "playerDamageScale"]);
  if (d.blast.profile !== "standard-grenade-v1") fail("trapCrates", "blast.profile must be standard-grenade-v1");
  number("trapCrates", "blast.playerDamageScale", d.blast.playerDamageScale, 0);
  closed(d.loot, ["healFraction", "refillReserve"]);
  if (!(d.loot.healFraction > 0 && d.loot.healFraction <= 1)) fail("trapCrates", "healFraction must be above 0 and at most 1");
  if (typeof d.loot.refillReserve !== "boolean") fail("trapCrates", "refillReserve must be true or false");
  closed(d.text, ["opened", "openedNoLoot"]);
  for (const [k, v] of Object.entries(d.text)) if (typeof v !== "string" || !v.length || v.length > 60) fail("trapCrates", `text.${k}`);
  if (!d.text.opened.includes("{hp}") || !d.text.opened.includes("{rounds}")) fail("trapCrates", "text.opened needs {hp} and {rounds}");
  closed(d.cue, [
    "ringColour",
    "ringOpacityFrom",
    "ringOpacityTo",
    "ringSegments",
    "flashColour",
    "flashHzFrom",
    "flashHzTo",
    "blastSeconds",
  ]);
  hex("cue.ringColour", d.cue.ringColour);
  hex("cue.flashColour", d.cue.flashColour);
  for (const f of ["ringOpacityFrom", "ringOpacityTo"])
    if (!(d.cue[f] > 0 && d.cue[f] <= 1)) fail("trapCrates", `cue.${f} must be above 0 and at most 1`);
  if (!Number.isInteger(d.cue.ringSegments) || d.cue.ringSegments < 8 || d.cue.ringSegments > 128) fail("trapCrates", "cue.ringSegments");
  number("trapCrates", "cue.flashHzFrom", d.cue.flashHzFrom, 0.5);
  number("trapCrates", "cue.flashHzTo", d.cue.flashHzTo, d.cue.flashHzFrom);
  number("trapCrates", "cue.blastSeconds", d.cue.blastSeconds, 0.05);
  if (!Array.isArray(d.model) || d.model.length < 1 || d.model.length > 8) fail("trapCrates", "model must list 1 to 8 parts");
  for (const p of d.model) {
    closed(p, ["shape", "size", "pos", "color"]);
    if (!SHAPES.includes(p.shape)) fail("trapCrates", "model shape");
    triple("model.size", p.size, 0.001);
    triple("model.pos", p.pos, -10);
    hex("model.color", p.color);
  }
  if (!d.placements || typeof d.placements !== "object" || Array.isArray(d.placements)) fail("trapCrates", "placements");
  const seen = new Set();
  for (const [area, list] of Object.entries(d.placements)) {
    if (!/^[a-z0-9-]{1,32}$/.test(area)) fail("trapCrates", `placements area ${area}`);
    if (area === "central-hub") fail("trapCrates", "the central-hub safehouse has no trap crates");
    if (area === "westminster") fail("trapCrates", "the Westminster tutorial area has no trap crates");
    if (!Array.isArray(list) || list.length < 1 || list.length > 2) fail("trapCrates", `placements.${area} must list 1 or 2`);
    for (const row of list) {
      closed(row, ["id", "x", "z"]);
      if (typeof row.id !== "string" || !/^[a-z0-9-]{1,40}$/.test(row.id) || seen.has(row.id)) fail("trapCrates", `placement id ${row.id}`);
      seen.add(row.id);
      if (!Number.isFinite(row.x) || !Number.isFinite(row.z)) fail("trapCrates", `placement ${row.id} position`);
    }
  }
}
