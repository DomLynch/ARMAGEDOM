// visual.json `wantedPoster` (engine/wanted-projection.js): where the WANTED poster's pieces sit on its 384x768 canvas, the fixed wear
// pattern, and the mesh colour, draw order and flicker rates. Checked when wanted-projection.js loads; kept out of game-data.js,
// which is at its source density limit. Pixels on the canvas, alpha 0 to 1.
import { closed } from "./content-schema.js";

const fail = (why) => {
  throw TypeError(`Invalid game data visual: wantedPoster.${why}`);
};
const numbers = (where, row, fields, min = 0) => {
  closed(row, fields);
  for (const f of fields) if (!Number.isFinite(row[f]) || row[f] < min) fail(`${where}.${f} must be a finite number >= ${min}`);
};
const alpha = (where, v) => {
  if (!(v >= 0 && v <= 1)) fail(`${where} must be 0 to 1`);
};

export function validateWantedPoster(p) {
  closed(p, ["canvas", "titleX", "portrait", "amount", "rules", "specks", "scratches", "meshColour", "renderOrder", "flickerHz"]);
  numbers("canvas", p.canvas, ["width", "height"], 16);
  numbers("portrait", p.portrait, ["alpha", "x", "y", "width", "height"]);
  numbers("amount", p.amount, ["x", "y", "fontPx", "maxWidth"], 1);
  closed(p.rules, ["alpha", "top", "bottom"]);
  numbers("rules.top", p.rules.top, ["x", "y", "width"]);
  numbers("rules.bottom", p.rules.bottom, ["x", "y", "width"]);
  numbers("specks", p.specks, ["count", "stepX", "offsetX", "spanX", "stepY", "offsetY", "spanY", "alpha", "alphaStep"]);
  numbers("scratches", p.scratches, ["count", "x", "stepX", "spanX", "y", "stepY", "width", "widthStep"]);
  for (const v of [p.portrait.alpha, p.rules.alpha, p.specks.alpha]) alpha("an alpha", v);
  for (const f of ["spanX", "spanY"]) if (!(p.specks[f] >= 1)) fail(`specks.${f} must be at least 1`);
  if (!(p.scratches.spanX >= 1)) fail("scratches.spanX must be at least 1");
  if (!Number.isFinite(p.titleX) || !Number.isFinite(p.renderOrder)) fail("titleX and renderOrder must be numbers");
  if (!/^[0-9a-f]{6}$/.test(p.meshColour)) fail("meshColour must be 6 lowercase hex digits");
  if (!Array.isArray(p.flickerHz) || p.flickerHz.length !== 2 || !p.flickerHz.every((v) => Number.isFinite(v) && v > 0))
    fail("flickerHz must be two positive rates");
}
