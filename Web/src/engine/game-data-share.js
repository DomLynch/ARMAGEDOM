// shareClip.json (share-clip.js, share-encode.js, share-card.js): the viral death cam. The validator lives here so the loader
// (engine/game-data.js) stays small.
import { closed } from "./content-schema.js";
import { fail, number } from "./game-data-checks.js";

const text = (v) => typeof v === "string" && v.length > 0;

export function validateShareClip(d) {
  const f = "shareClip",
    triggers = ["playerDeath", "flaggedDeath", "blast", "closeCall"]; // the four the capture code knows
  closed(d, [
    "schema_version",
    "note",
    "flagParam",
    "offValue",
    "defaultOn",
    "shareUrl",
    "buffer",
    "tiers",
    "offAreas",
    "still",
    "encode",
    "card",
    "files",
    "brand",
    "moments",
  ]);
  if (!text(d.note)) fail(f, "note must say the values are provisional");
  if (!text(d.flagParam) || !text(d.offValue)) fail(f, "flagParam and offValue must be strings");
  if (typeof d.defaultOn !== "boolean") fail(f, "defaultOn must be true or false");
  if (!/^https:\/\/[a-z0-9.-]+\/$/.test(d.shareUrl)) fail(f, "shareUrl must be a bare https homepage with no path or query");
  closed(d.buffer, ["seconds", "width", "height", "gapSeconds"]);
  for (const name of ["seconds", "width", "height", "gapSeconds"]) number(f, `buffer.${name}`, d.buffer[name], 0.01);
  for (const [name, tier] of Object.entries(d.tiers)) {
    closed(tier, ["fps"]);
    number(f, `tiers.${name}.fps`, tier.fps, 0);
  }
  if (d.tiers.low?.fps !== 0) fail(f, "the low tier must turn the clip ring off (fps 0)");
  if (!Array.isArray(d.offAreas) || !d.offAreas.every(text)) fail(f, "offAreas must list area ids");
  closed(d.still,["width", "height"]);
  number(f, "still.width", d.still.width, 1);
  number(f, "still.height", d.still.height, 1);
  closed(d.encode, ["types", "bitsPerSecond", "timesliceMs", "holdSeconds", "minFrames"]);
  if (!Array.isArray(d.encode.types) || !d.encode.types.length || !d.encode.types.every(text)) fail(f, "encode.types must list mime types");
  for (const name of ["bitsPerSecond", "timesliceMs", "holdSeconds", "minFrames"]) number(f, `encode.${name}`, d.encode[name], 0.01);
  closed(d.card, ["statusSeconds", "revokeSeconds"]);
  number(f, "card.statusSeconds", d.card.statusSeconds, 0.01);
  number(f, "card.revokeSeconds", d.card.revokeSeconds, 0.01);
  closed(d.files,["prefix", "extensions", "image"]);
  if (!text(d.files.prefix) || !d.files.extensions[d.files.image]) fail(f, "files needs a prefix and an extension for the still type");
  for (const type of d.encode.types) if (!d.files.extensions[type.split(";")[0]]) fail(f, `files.extensions has no entry for ${type}`);
  closed(d.brand, ["barPct", "background", "accent", "text", "font", "fontPct", "maxWidthPct", "rulePx"]);
  for (const name of ["barPct", "fontPct", "maxWidthPct", "rulePx"]) number(f, `brand.${name}`, d.brand[name], 0);
  if (!d.brand.font.includes("{px}")) fail(f, "brand.font needs the {px} placeholder");
  if (!Array.isArray(d.moments) || !d.moments.some((m) => m.trigger === "playerDeath")) fail(f, "moments must include the player death");
  const seen = new Set();
  for (const m of d.moments) {
    const required = ["id", "label", "text", "trigger", "priority", "tailSeconds", "cooldownSeconds"];
    closed(m, required, ["flags", "events", "minRadius", "hpFraction", "surviveSeconds"]);
    if (!/^[A-Za-z]+$/.test(m.id) || seen.has(m.id)) fail(f, `moment id ${m.id} must be unique letters`);
    seen.add(m.id);
    if (!text(m.label) || !text(m.text) || !m.text.includes("{url}")) fail(f, `${m.id}: label and a share text with {url} are needed`);
    if (!triggers.includes(m.trigger)) fail(f, `${m.id}: trigger must be one of ${triggers.join(", ")}`);
    number(f, `${m.id}.priority`, m.priority, 1);
    number(f, `${m.id}.tailSeconds`, m.tailSeconds, 0);
    number(f, `${m.id}.cooldownSeconds`, m.cooldownSeconds, 0);
    if (m.trigger === "flaggedDeath" && !(m.flags?.length && m.flags.every(text))) fail(f, `${m.id}: flags must name entity fields`);
    if (m.trigger === "blast" && !(m.events?.length && m.events.every(text))) fail(f, `${m.id}: events must name event types`);
    if (m.trigger === "blast") number(f, `${m.id}.minRadius`, m.minRadius, 0);
    if (m.trigger === "closeCall") {
      if (!(m.hpFraction > 0 && m.hpFraction < 1)) fail(f, `${m.id}: hpFraction must be between 0 and 1`);
      number(f, `${m.id}.surviveSeconds`, m.surviveSeconds, 0.01);
    }
  }
  const death = d.moments.find((m) => m.trigger === "playerDeath");
  if (d.moments.some((m) => m !== death && m.priority <= death.priority)) fail(f, "every other moment must outrank the death");
}
