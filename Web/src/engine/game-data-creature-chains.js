// creatureChainRows.json: per creature model, the bone map and measured segment lengths a Physics chain body (or the humanoid body) needs once
// the death ragdoll is wired for that creature. Inert: every row is live false until the wiring reads it. The test that checks each bone name
// against the real GLB skeleton is tests/creature-chain-rows.test.js; this validator only checks the row against itself.
import { closed } from "./content-schema.js";
import { fail, number } from "./game-data-checks.js";

const FILE = "creatureChainRows";

function validateSegments(id, row) {
  const seen = new Set();
  const bones = new Set(row.bones);
  row.segments.forEach((s, i) => {
    const at = `${id}.segments[${i}]`;
    closed(s, ["id", "role", "parent", "bone", "tip", "lengthModel", "lengthMetres", "radiusModel", "radiusSamples"]);
    if (!s.id || seen.has(s.id)) fail(FILE, `${at}: id must be unique text`);
    if (i === 0 ? s.parent !== null : !seen.has(s.parent)) fail(FILE, `${at}: parent must be null for the root and an earlier segment otherwise`);
    seen.add(s.id);
    for (const key of ["bone", "tip"]) if (!bones.has(s[key])) fail(FILE, `${at}: ${key} ${s[key]} is not in bones`);
    if (row.boneMap[s.id] !== s.bone) fail(FILE, `${at}: boneMap must map ${s.id} to ${s.bone}`);
    number(FILE, `${at}.lengthModel`, s.lengthModel, 0.0001);
    if (Math.abs(s.lengthMetres - s.lengthModel * row.modelScale) > 0.001) fail(FILE, `${at}: lengthMetres must be lengthModel x modelScale`);
    if (!Number.isInteger(s.radiusSamples) || s.radiusSamples < 0) fail(FILE, `${at}: radiusSamples must be a whole number`);
    if (s.radiusModel !== null) number(FILE, `${at}.radiusModel`, s.radiusModel, 0.0001);
  });
  if (row.segments.length && Object.keys(row.boneMap).length !== row.segments.length) fail(FILE, `${id}: boneMap must have one entry per segment`);
}

export function validateCreatureChainRows(d) {
  closed(d, ["schema_version", "note", "glbRoot", "simRootNote", "rows"]);
  const ids = Object.keys(d.rows);
  if (!ids.length) fail(FILE, "rows must not be empty");
  for (const id of ids) {
    const row = d.rows[id];
    closed(
      row,
      ["glb", "family", "kind", "fit", "fitNote", "live", "definitionId", "modelScale", "rigNodeScale", "simRoot", "jointCount"]
        .concat(["bones", "boneMap", "segments"]),
      ["missingBones", "nodeBones"],
    );
    if (row.live !== false) fail(FILE, `${id}: live must be false until the wiring lands`);
    if (!["chain", "humanoid", "none"].includes(row.kind) || !["full", "partial", "humanoid", "none"].includes(row.fit)) fail(FILE, `${id}: kind or fit is not a known value`);
    if (typeof row.fitNote !== "string" || !row.fitNote) fail(FILE, `${id}: fitNote must say how well the skeleton fits`);
    number(FILE, `${id}.modelScale`, row.modelScale, 0.01);
    closed(row.simRoot, ["scale", "modelChildScale"]);
    if (row.simRoot.scale !== 1 || row.simRoot.modelChildScale !== row.modelScale)
      fail(FILE, `${id}: the sim root is unscaled and the model child carries modelScale`);
    if (!Array.isArray(row.rigNodeScale) || row.rigNodeScale.length !== 3) fail(FILE, `${id}: rigNodeScale must be 3 numbers`);
    const bones = new Set(row.bones);
    if (bones.size !== row.bones.length || row.jointCount !== row.bones.length) fail(FILE, `${id}: bones must be unique, jointCount their count`);
    // nodeBones: named nodes that are not skin joints (a Mixamo Spine1 the mesh is not weighted to) but still drive a part
    const driven = new Set([...bones, ...(row.nodeBones ?? [])]);
    for (const [part, bone] of Object.entries(row.boneMap)) if (!driven.has(bone)) fail(FILE, `${id}: boneMap ${part} names ${bone}, not a listed bone`);
    if (row.kind === "none" ? row.glb !== null || row.bones.length : typeof row.glb !== "string") fail(FILE, `${id}: glb and bones do not match kind`);
    if (row.kind === "chain" && !row.segments.length) fail(FILE, `${id}: a chain row needs segments`);
    if (row.kind !== "chain" && row.segments.length) fail(FILE, `${id}: only a chain row has segments`);
    validateSegments(id, row);
  }
}
