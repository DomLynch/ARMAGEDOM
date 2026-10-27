import { closed } from "./content-schema.js";
import { checkTemplate } from "./text-template.js";
// Validator for visual.json `routeGuidance` (the road-guidance presentation read by engine/route-guidance.js). It lives apart from
// game-data.js to keep that file under the source size guard. Metres unless a name says otherwise; colours are 6-digit hex strings.
const fail = (why) => {
  throw TypeError(`Invalid game data visual: routeGuidance.${why}`);
};
const number = (field, v, min) => {
  if (!Number.isFinite(v) || v < min) fail(`${field} must be a finite number >= ${min}`);
};
const hex = (field, v) => {
  if (typeof v !== "string" || !/^[0-9a-f]{6}$/.test(v)) fail(`${field} must be 6 lowercase hex digits`);
};
const ensureNumbers = (field, v, length) => {
  if (!Array.isArray(v) || v.length !== length) fail(`${field} must hold ${length} numbers`);
  v.forEach((n, i) => number(`${field}[${i}]`, n, 0.001));
};
// The words of the route cue, the exit label and the safehouse entrance sign. {placeholders} are checked here, at load.
function validateGuidanceText(t) {
  closed(t, ["killSalamander", "killMatron", "walkToProjector", "pistol", "shelter", "exit", "roadClosed", "cue", "compass", "entranceSign"]);
  for (const f of ["killSalamander", "killMatron", "walkToProjector", "pistol", "shelter", "roadClosed"]) checkTemplate(`text.${f}`, t[f], [], fail);
  checkTemplate("text.exit", t.exit, ["area"], fail, ["area"]);
  checkTemplate("text.cue", t.cue, ["closed", "direction", "name", "metres"], fail, ["direction", "name", "metres"]);
  if (!Array.isArray(t.compass) || t.compass.length !== 8) fail("text.compass must hold eight direction marks, east first, counter-clockwise");
  t.compass.forEach((c, i) => checkTemplate(`text.compass[${i}]`, c, [], fail));
  if (!Array.isArray(t.entranceSign) || t.entranceSign.length < 1 || t.entranceSign.length > 2) fail("text.entranceSign must hold one or two lines");
  t.entranceSign.forEach((l, i) => {
    checkTemplate(`text.entranceSign[${i}]`, l, [], fail);
    if (!/^[A-Z0-9 ·→-]{1,22}$/.test(l)) fail(`text.entranceSign[${i}] must be 1 to 22 capitals, digits or spaces`);
  });
}
export function validateRouteGuidance(r) {
  closed(r, [
    "clearance",
    "sampleStep",
    "boundaryReach",
    "exitReach",
    "boundaryStartReach",
    "waypointMin",
    "arrivalRadius",
    "pistolArrived",
    "huntArrived",
    "text",
    "arrow",
    "rail",
    "marker",
  ]);
  validateGuidanceText(r.text);
  for (const f of ["clearance", "sampleStep", "boundaryReach", "exitReach", "boundaryStartReach"]) number(f, r[f], 0.001);
  for (const f of ["waypointMin", "arrivalRadius", "pistolArrived", "huntArrived"]) number(f, r[f], 0.001);
  // The tutorial's ground arrow (Westminster only): it starts tailGap metres out from the player's centre, clear of the footprint, and
  // fades between minOpacity and peakOpacity every pulseSeconds.
  closed(r.arrow, ["height", "tailGap", "peakOpacity", "minOpacity", "pulseSeconds", "triangles"]);
  number("arrow.height", r.arrow.height, 0);
  if (!(r.arrow.tailGap >= 0.5 && r.arrow.tailGap <= 3)) fail("arrow.tailGap must be 0.5 to 3 metres");
  number("arrow.pulseSeconds", r.arrow.pulseSeconds, 0.1);
  if (!(r.arrow.peakOpacity > 0 && r.arrow.peakOpacity <= 1)) fail("arrow.peakOpacity must be above 0 and at most 1");
  if (!(r.arrow.minOpacity >= 0 && r.arrow.minOpacity < 1)) fail("arrow.minOpacity must be from 0 up to 1");
  if (!Array.isArray(r.arrow.triangles) || r.arrow.triangles.length < 1 || r.arrow.triangles.length > 8) fail("arrow.triangles must list 1 to 8 triangles");
  for (const tri of r.arrow.triangles)
    if (!Array.isArray(tri) || tri.length !== 3 || !tri.every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite)))
      fail("arrow.triangles must be triangles of three [x, y, z] points");
  const { rail, marker: m } = r;
  closed(rail, ["sideProbe", "sideOffset", "segments", "centreHeight", "thickness", "depth", "colours", "post"]);
  for (const f of ["sideProbe", "sideOffset", "centreHeight", "thickness", "depth"]) number(`rail.${f}`, rail[f], 0.001);
  if (!Number.isSafeInteger(rail.segments) || rail.segments < 1 || rail.segments > 64) fail("rail.segments must be an integer from 1 to 64");
  if (!Array.isArray(rail.colours) || rail.colours.length !== 2) fail("rail.colours must hold two colours");
  rail.colours.forEach((c, i) => hex(`rail.colours[${i}]`, c));
  closed(rail.post, ["centreHeight", "height", "width", "colour", "along"]);
  if (!Array.isArray(rail.post.along) || !rail.post.along.length || !rail.post.along.every((t) => t >= 0 && t <= 1))
    fail("rail.post.along must list positions from 0 to 1 along the rail");
  for (const f of ["centreHeight", "height", "width"]) number(`rail.post.${f}`, rail.post[f], 0.001);
  hex("rail.post.colour", rail.post.colour);
  closed(m, ["height", "showDistance", "exitHintRemaining", "ring", "sign"]);
  for (const f of ["height", "showDistance", "exitHintRemaining"]) number(`marker.${f}`, m[f], 0);
  closed(m.ring, ["inner", "outer", "segments", "colour"]);
  number("marker.ring.inner", m.ring.inner, 0.001);
  if (!(m.ring.outer > m.ring.inner)) fail("marker.ring.outer must exceed inner");
  if (!Number.isSafeInteger(m.ring.segments) || m.ring.segments < 3 || m.ring.segments > 128) fail("marker.ring.segments must be an integer from 3 to 128");
  hex("marker.ring.colour", m.ring.colour);
  const s = m.sign;
  closed(s, ["canvas", "borderWidth", "border", "textX", "lineY", "fonts", "size", "height"]);
  ensureNumbers("marker.sign.canvas", s.canvas, 2);
  ensureNumbers("marker.sign.border", s.border, 4);
  ensureNumbers("marker.sign.lineY", s.lineY, 2);
  ensureNumbers("marker.sign.size", s.size, 2);
  for (const f of ["borderWidth", "textX", "height"]) number(`marker.sign.${f}`, s[f], 0.001);
  if (!Array.isArray(s.fonts) || s.fonts.length !== 2 || !s.fonts.every((f) => typeof f === "string" && /^(bold )?\d+px [a-z-]+$/.test(f)))
    fail("marker.sign.fonts must hold two CSS font strings");
}
