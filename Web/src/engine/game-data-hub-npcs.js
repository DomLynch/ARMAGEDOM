// hubNpcs.json (engine/hub-npcs.js): the named Central Hub NPCs. The validator lives here so the loader stays small.
import { closed } from "./content-schema.js";
import { fail, number } from "./game-data-checks.js";

const REF = /^[a-z][a-z0-9-]*$/;
const ROLES = ["vendor", "medic", "quest-giver"];

export function validateHubNpcs(d) {
  closed(d, ["schema_version", "note", "enabled", "offParam", "offValue", "area", "npcs"]);
  if (typeof d.enabled !== "boolean") fail("hubNpcs", "enabled must be true or false");
  for (const name of ["offParam", "offValue", "area"])
    if (typeof d[name] !== "string" || !d[name]) fail("hubNpcs", `${name} must be a nonempty string`);
  if (!Array.isArray(d.npcs) || d.npcs.length === 0) fail("hubNpcs", "npcs must be a nonempty list");
  const seen = new Set();
  for (const n of d.npcs) {
    closed(n, ["id", "name", "role", "title", "ref", "body", "mixamoClip", "idleClip", "at", "facingDegrees", "phaseSeconds", "look"]);
    for (const name of ["id", "name", "title", "ref", "body", "mixamoClip", "idleClip", "look"])
      if (typeof n[name] !== "string" || !n[name]) fail("hubNpcs", `${n.id}: ${name} must be a nonempty string`);
    if (!REF.test(n.ref) || seen.has(n.id) || seen.has(n.ref)) fail("hubNpcs", `${n.id}: id and ref must be unique lowercase ids`);
    seen.add(n.id).add(n.ref);
    if (!ROLES.includes(n.role)) fail("hubNpcs", `${n.id}: role must be one of ${ROLES.join(", ")}`);
    closed(n.at, ["x", "y"]);
    for (const axis of ["x", "y"]) {
      number("hubNpcs", `${n.id}.at.${axis}`, n.at[axis]);
      if (n.at[axis] > 1) fail("hubNpcs", `${n.id}.at.${axis} is a painting fraction from 0 to 1`);
    }
    if (!Number.isFinite(n.facingDegrees)) fail("hubNpcs", `${n.id}: facingDegrees must be a number`);
    number("hubNpcs", `${n.id}.phaseSeconds`, n.phaseSeconds);
  }
}
