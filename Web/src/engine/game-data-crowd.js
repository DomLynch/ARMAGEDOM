// crowdBodies.json (engine/crowd-bodies.js): the crowd appearance pool. The validator lives here so the loader stays small.
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

const REF = /^[a-z][a-z0-9-]*$/;

export function validateCrowdBodies(d) {
  closed(d, [
    "schema_version",
    "note",
    "enabled",
    "offParam",
    "offValue",
    "seed",
    "defaultRef",
    "buckets",
    "idleMs",
    "maxBodiesPerArea",
    "excludedAreas",
    "plainRecipes",
    "pool",
  ]);
  if (typeof d.enabled !== "boolean") fail("crowdBodies", "enabled must be true or false");
  for (const name of ["offParam", "offValue", "seed", "defaultRef"])
    if (typeof d[name] !== "string" || !d[name]) fail("crowdBodies", `${name} must be a nonempty string`);
  count("crowdBodies", "buckets", d.buckets, 2, 65536);
  count("crowdBodies", "idleMs", d.idleMs, 0, 60000);
  count("crowdBodies", "maxBodiesPerArea", d.maxBodiesPerArea, 0, 12);
  if (!Array.isArray(d.excludedAreas) || d.excludedAreas.some((a) => typeof a !== "string" || !a))
    fail("crowdBodies", "excludedAreas must be a list of area ids");
  if (!Array.isArray(d.plainRecipes) || d.plainRecipes.some((r) => typeof r !== "string" || !r))
    fail("crowdBodies", "plainRecipes must be a list of recipe ids");
  if (!Array.isArray(d.pool) || d.pool.length < 1) fail("crowdBodies", "pool must list at least one row");
  const seen = new Set();
  for (const row of d.pool) {
    closed(row, ["ref", "weight", "active", "native"]);
    if (typeof row.native !== "boolean") fail("crowdBodies", `${row.ref}.native must be true or false`);
    if (typeof row.ref !== "string" || !REF.test(row.ref) || seen.has(row.ref))
      fail("crowdBodies", "pool refs must be unique model names");
    seen.add(row.ref);
    number("crowdBodies", `${row.ref}.weight`, row.weight, 0);
    if (typeof row.active !== "boolean") fail("crowdBodies", `${row.ref}.active must be true or false`);
  }
  if (!seen.has(d.defaultRef)) fail("crowdBodies", "defaultRef must be a pool row");
}
