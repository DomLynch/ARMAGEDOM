// railgunCoils.json validator: the Thundercoil's decorative amber coils (engine/railgun-coils.js): the three rings, their
// material, the charge arc and how the glow follows the charge.
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

const checkColour = (field, v) => count("railgunCoils", field, v, 0, 0xffffff);
export function validateRailgunCoils(d) {
  closed(d, ["schema_version", "ring", "material", "arc", "charge"]);
  closed(d.ring, ["radius", "tube", "radialSegments", "tubularSegments", "count", "y", "z", "zStep"]);
  for (const f of ["radius", "tube", "y", "z", "zStep"]) number("railgunCoils", `ring.${f}`, d.ring[f], 0);
  count("railgunCoils", "ring.radialSegments", d.ring.radialSegments, 3, 32);
  count("railgunCoils", "ring.tubularSegments", d.ring.tubularSegments, 3, 64);
  count("railgunCoils", "ring.count", d.ring.count, 1, 8);
  closed(d.material, ["color", "metalness", "roughness", "emissive", "emissiveIdle"]);
  checkColour("material.color", d.material.color);
  checkColour("material.emissive", d.material.emissive);
  for (const f of ["metalness", "roughness", "emissiveIdle"]) number("railgunCoils", `material.${f}`, d.material[f], 0);
  closed(d.arc, ["color", "points"]);
  checkColour("arc.color", d.arc.color);
  if (
    !Array.isArray(d.arc.points) ||
    d.arc.points.length < 2 ||
    !d.arc.points.every((p) => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite))
  )
    fail("railgunCoils", "arc.points must list at least two [x, y, z] points");
  closed(d.charge, ["emissiveBase", "emissiveGain", "opacityBase", "opacityGain", "flicker", "flickerRate"]);
  for (const [f, v] of Object.entries(d.charge)) number("railgunCoils", `charge.${f}`, v, 0);
}
