// soundHooks.json (engine/sound-hooks.js): the validator, called from game-data.js. Seconds, metres, gains 0 to 1.
import { closed } from "./content-schema.js";
import { count, fail, id, number } from "./game-data-checks.js";

const FILE = "soundHooks";
const share = (field, v, max = 1) => {
  if (!Number.isFinite(v) || v < 0 || v > max) fail(FILE, `${field} must be 0 to ${max}`);
};
const word = (field, v) => {
  if (typeof v !== "string" || !v) fail(FILE, `${field} must be a non-empty string`);
};
const TONE_TYPES = ["sine", "triangle", "square", "sawtooth"];
function checkRow(r) {
  closed(
    r,
    ["id", "event", "enabled", "priority", "gain", "pitchVariance", "minGapSeconds", "voices", "distance"],
    ["match", "note", "tone", "noise"],
  );
  id(FILE, "row id", r.id);
  word(`${r.id}.event`, r.event);
  if (typeof r.enabled !== "boolean" || typeof r.distance !== "boolean")
    fail(FILE, `${r.id}: enabled and distance must be true or false`);
  if (!r.enabled && !r.note) fail(FILE, `${r.id}: an inert row must carry a note saying why`);
  count(FILE, `${r.id}.priority`, r.priority, 1, 9);
  count(FILE, `${r.id}.voices`, r.voices, 1, 4);
  share(`${r.id}.gain`, r.gain);
  share(`${r.id}.pitchVariance`, r.pitchVariance, 0.5);
  number(FILE, `${r.id}.minGapSeconds`, r.minGapSeconds);
  if (!r.tone && !r.noise) fail(FILE, `${r.id}: needs a tone or a noise`);
  for (const [k, v] of Object.entries(r.match ?? {}))
    if (
      !(
        typeof v === "string" ||
        typeof v === "boolean" ||
        (Array.isArray(v) && v.length && v.every((x) => typeof x === "string"))
      )
    )
      fail(FILE, `${r.id}.match.${k} must be a string, a boolean or a list of strings`);
  if (r.tone) {
    closed(r.tone, ["from", "to", "seconds", "type"]);
    for (const k of ["from", "to"]) number(FILE, `${r.id}.tone.${k}`, r.tone[k], 1);
    number(FILE, `${r.id}.tone.seconds`, r.tone.seconds, 0.01);
    if (!TONE_TYPES.includes(r.tone.type)) fail(FILE, `${r.id}.tone.type must be one of ${TONE_TYPES}`);
  }
  if (r.noise) {
    closed(r.noise, ["seconds", "cutoff", "share"]);
    number(FILE, `${r.id}.noise.seconds`, r.noise.seconds, 0.01);
    number(FILE, `${r.id}.noise.cutoff`, r.noise.cutoff, 1);
    share(`${r.id}.noise.share`, r.noise.share, 2);
  }
}
export function validateSoundHooks(d) {
  closed(d, ["schema_version", "note", "flagParam", "offValue", "defaultOn", "mix", "burn", "rows"]);
  word("note", d.note);
  word("flagParam", d.flagParam);
  word("offValue", d.offValue);
  if (typeof d.defaultOn !== "boolean") fail(FILE, "defaultOn must be true or false");
  closed(d.mix, ["maxVoices", "maxPerBatch", "hearingRange", "farGain"]);
  count(FILE, "mix.maxVoices", d.mix.maxVoices, 1, 8);
  count(FILE, "mix.maxPerBatch", d.mix.maxPerBatch, 1, 8);
  number(FILE, "mix.hearingRange", d.mix.hearingRange, 1);
  share("mix.farGain", d.mix.farGain);
  closed(d.burn, [
    "enabled",
    "note",
    "hearingRange",
    "gain",
    "gainPerActor",
    "cutoff",
    "lfoHz",
    "lfoDepth",
    "rampSeconds",
  ]);
  if (typeof d.burn.enabled !== "boolean") fail(FILE, "burn.enabled must be true or false");
  for (const k of ["hearingRange", "cutoff", "lfoHz", "rampSeconds"]) number(FILE, `burn.${k}`, d.burn[k], 0.01);
  for (const k of ["gain", "gainPerActor", "lfoDepth"]) share(`burn.${k}`, d.burn[k]);
  if (!Array.isArray(d.rows) || !d.rows.length) fail(FILE, "rows must be a non-empty list");
  d.rows.forEach(checkRow);
  if (new Set(d.rows.map((r) => r.id)).size !== d.rows.length) fail(FILE, "row ids must be unique");
}
