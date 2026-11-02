// finisher-data.json validator, split out so game-data.js can load the file (finisher-data.js reads the result back from GAME_DATA).
import { closed, freeze } from "./content-schema.js";
const key = (x) => typeof x === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(x);
import { finite } from "./shared-checks.js";
const list = (x) => Array.isArray(x) && x.length > 0 && x.every(key) && new Set(x).size === x.length;
const fail = () => {
  throw TypeError("Invalid finisher catalogue");
};
export function validateFinisherData(value) {
  const d = structuredClone(value);
  closed(
    d,
    [
      "version",
      "chance",
      "seed",
      "ordinary",
      "limits",
      "recipes",
      "bindings",
      "flameDeath",
      "impactLimits",
      "impactPalette",
      "preparation",
      "cosmetics",
      "grounding",
      "armSever",
      "gore",
    ],
    ["schema_version"],
  );
  closed(d.armSever, [
    "boneCount",
    "lifetime",
    "initialRadius",
    "launchSpeed",
    "launchLift",
    "spinRate",
    "maxStep",
    "gravity",
    "bounceKeep",
    "groundFriction",
    "spinDamping",
    "spinMin",
  ]);
  // grounding (finisher-grounding.js): the victim floor-lift table's sample count, vertex cap, time slice and yield cadence.
  closed(d.grounding, [
    "samples",
    "maxVertices",
    "sliceMs",
    "indexYieldMask",
    "readYieldMask",
    "phaseMax",
    "floorTolerance",
  ]);
  const ground = d.grounding;
  if (
    !Number.isSafeInteger(ground.samples) ||
    !finite(ground.samples, 1, 1000) ||
    !Number.isSafeInteger(ground.maxVertices) ||
    !finite(ground.maxVertices, 1000, 10000000) ||
    !finite(ground.sliceMs, 0.5, 50) ||
    ![ground.indexYieldMask, ground.readYieldMask].every(
      (m) => Number.isSafeInteger(m) && m >= 0 && (m & (m + 1)) === 0,
    ) ||
    !finite(ground.phaseMax, 0.9, 1) ||
    !finite(ground.floorTolerance, 0, 0.1)
  )
    fail();
  const arm = d.armSever;
  if (
    !Number.isInteger(arm.boneCount) ||
    !finite(arm.boneCount, 1, 256) ||
    !finite(arm.lifetime, 0.1, 60) ||
    !finite(arm.initialRadius, 0.001, 2) ||
    !finite(arm.launchSpeed, 0, 20) ||
    !finite(arm.launchLift, 0, 20) ||
    !finite(arm.spinRate, 0, 50) ||
    !finite(arm.maxStep, 0.001, 1) ||
    !finite(arm.gravity, 0, 50) ||
    !finite(arm.bounceKeep, 0, 1) ||
    !finite(arm.groundFriction, 0, 1) ||
    !finite(arm.spinDamping, 0, 1) ||
    !finite(arm.spinMin, 0, 1)
  )
    fail();
  if (d.version !== 1 || !finite(d.chance, 0, 1) || !key(d.seed)) fail();
  closed(d.ordinary, ["id", "clip", "seconds", "cost", "parts"]);
  if (
    d.ordinary.id !== "ordinary" ||
    d.ordinary.clip !== "Death" ||
    !finite(d.ordinary.seconds, 0.01, 10) ||
    d.ordinary.cost !== 0 ||
    !Array.isArray(d.ordinary.parts) ||
    d.ordinary.parts.length
  )
    fail();
  closed(d.limits, ["partBudget", "partLifetime", "maxRecipeSeconds"]);
  if (
    !Number.isSafeInteger(d.limits.partBudget) ||
    !finite(d.limits.partBudget, 0, 8) ||
    !finite(d.limits.partLifetime, 0.1, 10) ||
    !finite(d.limits.maxRecipeSeconds, 0.1, 10)
  )
    fail();
  if (!Array.isArray(d.recipes) || !d.recipes.length || d.recipes.length > 16) fail();
  const ids = new Map();
  for (const r of d.recipes) {
    closed(r, ["id", "damageType", "parts", "avoidRepeat"], ["impact", "presentationRecipeId", "goreRecipeId"]);
    if (
      !key(r.id) ||
      r.id === "ordinary" ||
      ids.has(r.id) ||
      !key(r.damageType) ||
      typeof r.avoidRepeat !== "boolean" ||
      !Array.isArray(r.parts) ||
      r.parts.length > 2 ||
      r.parts.some((p) => !["head", "crown", "upper-body", "left-arm"].includes(p)) ||
      new Set(r.parts).size !== r.parts.length
    )
      fail();
    if (
      r.impact &&
      (!Array.isArray(r.impact) ||
        r.impact.length !== 6 ||
        !["head", "body"].includes(r.impact[0]) ||
        !Number.isInteger(r.impact[1]) ||
        !finite(r.impact[1], 0, 48) ||
        !Number.isInteger(r.impact[2]) ||
        !finite(r.impact[2], 0, 8) ||
        !finite(r.impact[3], 0.01, 3) ||
        !finite(r.impact[4], 0, 10) ||
        !finite(r.impact[5], 0, 90))
    )
      fail();
    ids.set(r.id, r);
  }
  for (const r of d.recipes)
    for (const field of ["presentationRecipeId", "goreRecipeId"]) if (Object.hasOwn(r, field) && !key(r[field])) fail();
  for (const r of d.recipes)
    if (r.presentationRecipeId) {
      const base = ids.get(r.presentationRecipeId);
      if (
        !base ||
        base.presentationRecipeId ||
        r.id === base.id ||
        JSON.stringify(r.parts) !== JSON.stringify(base.parts)
      )
        fail();
    }
  if (!Array.isArray(d.bindings) || !d.bindings.length || d.bindings.length > 16) fail();
  for (const b of d.bindings) {
    closed(b, ["weapon", "recipes"], ["moveIds", "attackClasses", "fallback", "rotate"]);
    if (
      !key(b.weapon) ||
      (b.moveIds && !list(b.moveIds)) ||
      (b.attackClasses && !list(b.attackClasses)) ||
      !Array.isArray(b.recipes) ||
      !b.recipes.length ||
      new Set(b.recipes.map((r) => r.id)).size !== b.recipes.length
    )
      fail();
    for (const r of b.recipes) {
      closed(r, ["id", "weight"]);
      if (!ids.has(r.id) || !finite(r.weight, 0.001, 100)) fail();
    }
    if (
      new Set(b.recipes.map((r) => ids.get(r.id).damageType)).size !== 1 ||
      !ids.has(b.fallback) ||
      ids.get(b.fallback).parts.length ||
      ids.get(b.fallback).damageType !== ids.get(b.recipes[0].id).damageType ||
      typeof b.rotate !== "boolean"
    )
      fail();
  }
  closed(d.preparation, ["openedPlacements", "deferred"]);
  if (!list(d.preparation.openedPlacements)) fail();
  // Finisher geometry for living residents is prepared after arrival, in slices of `sliceMs` per frame, starting
  // `startDelayMs` after arrival, and pausing `backoffMs` whenever a frame takes longer than `backoffFrameMs`.
  // During a fight only the closest alerted resident is prepared (`fightSliceMs` slices, skipped after a frame over
  // `fightSkipFrameMs`); everyone else waits `quietAfterFightMs` after the last alerted enemy.
  closed(d.preparation.deferred, [
    "enabled",
    "startDelayMs",
    "sliceMs",
    "backoffFrameMs",
    "backoffMs",
    "fightSliceMs",
    "fightSkipFrameMs",
    "quietAfterFightMs",
  ]);
  const deferred = d.preparation.deferred;
  if (
    typeof deferred.enabled !== "boolean" ||
    !finite(deferred.startDelayMs, 0, 10000) ||
    !finite(deferred.sliceMs, 0.5, 8) ||
    !finite(deferred.backoffFrameMs, 16, 100) ||
    !finite(deferred.backoffMs, 0, 10000) ||
    !finite(deferred.fightSliceMs, 0.5, 8) ||
    !finite(deferred.fightSkipFrameMs, 16, 100) ||
    !finite(deferred.quietAfterFightMs, 0, 10000)
  )
    fail();
  closed(d.impactLimits, ["bursts", "particles", "trails"]);
  for (const [k, max] of Object.entries({ bursts: 2, particles: 48, trails: 8 }))
    if (!Number.isInteger(d.impactLimits[k]) || !finite(d.impactLimits[k], 0, max)) fail();
  // The blood colours of an impact burst that carries no gore style of its own (finisher-impact-profile.js).
  if (
    !Array.isArray(d.impactPalette) ||
    d.impactPalette.length !== 3 ||
    d.impactPalette.some((n) => !Number.isInteger(n) || !finite(n, 0, 0xffffff))
  )
    fail();
  const f = d.flameDeath;
  closed(f, [
    "recipeId",
    "holdSeconds",
    "collapseTailSeconds",
    "maxSeconds",
    "nativeSeconds",
    "fadeSeconds",
    "anchorBones",
    "pelvisBones",
    "flareColor",
    "flareIntensity",
    "anchorLift",
    "charBegin",
    "charSettle",
    "tint",
    "blend",
    "roughnessFloor",
    "prioritizeCorpses",
    "flickerRate",
    "flickerSize",
    "riseRate",
    "rise",
    "wisps",
  ]);
  if (
    ids.get(f.recipeId)?.damageType !== "flame" ||
    !finite(f.holdSeconds, 0.1, 5) ||
    !finite(f.collapseTailSeconds, 0, 0.2) ||
    !finite(f.maxSeconds, 1, 10) ||
    !finite(f.nativeSeconds, 0, 10) ||
    !finite(f.fadeSeconds, 0.01, 2) ||
    f.holdSeconds + f.fadeSeconds >= f.maxSeconds ||
    !Array.isArray(f.anchorBones) ||
    !f.anchorBones.length ||
    f.anchorBones.some((x) => typeof x !== "string" || !/^\w{1,64}$/.test(x)) ||
    !Array.isArray(f.pelvisBones) ||
    !f.pelvisBones.length ||
    f.pelvisBones.some((x) => typeof x !== "string" || !/^\w{1,64}$/.test(x)) ||
    !Number.isInteger(f.flareColor) ||
    !finite(f.flareColor, 0, 0xffffff) ||
    !finite(f.flareIntensity, 0, 3) ||
    !finite(f.anchorLift, 0, 0.3) ||
    !finite(f.charBegin, 0, 3) ||
    !finite(f.charSettle, f.charBegin + 0.01, 5) ||
    !Number.isInteger(f.tint) ||
    !finite(f.tint, 0, 0xffffff) ||
    !finite(f.blend, 0, 1) ||
    !finite(f.roughnessFloor, 0, 1)
  )
    fail();
  if (
    typeof f.prioritizeCorpses !== "boolean" ||
    !finite(f.flickerRate, 0, 30) ||
    !finite(f.flickerSize, 0, 0.5) ||
    !finite(f.riseRate, 0, 10) ||
    !finite(f.rise, 0, 0.3) ||
    !Array.isArray(f.wisps) ||
    !f.wisps.length ||
    f.wisps.length > 12
  )
    fail();
  for (const w of f.wisps) {
    closed(w, ["offset", "width", "aspect", "color", "phase", "anchor"]);
    if (
      !["torso", "pelvis"].includes(w.anchor) ||
      !Array.isArray(w.offset) ||
      w.offset.length !== 3 ||
      !finite(w.offset[0], -0.4, 0.4) ||
      !finite(w.offset[1], 0, 0.8) ||
      !finite(w.offset[2], -0.4, 0.4) ||
      !finite(w.width, 0.05, 1.2) ||
      !finite(w.aspect, 1, 3) ||
      !Number.isInteger(w.color) ||
      !finite(w.color, 0, 0xffffff) ||
      !finite(w.phase, 0, 10)
    )
      fail();
  }
  if (
    !Array.isArray(d.cosmetics) ||
    d.cosmetics.length !== 1 ||
    new Set(d.cosmetics.map((c) => c.damageType)).size !== 1
  )
    fail();
  for (const c of d.cosmetics) {
    closed(c, ["damageType", "seconds", "pulseHz", "color", "emissive", "intensity", "settleTint", "settleBlend"]);
    if (
      c.damageType !== "piercing" ||
      !finite(c.seconds, 0.1, 2) ||
      !finite(c.pulseHz, 0, 30) ||
      !finite(c.intensity, 0, 3) ||
      !finite(c.settleBlend, 0, 1) ||
      [c.color, c.emissive, c.settleTint].some((n) => !Number.isInteger(n) || !finite(n, 0, 0xffffff))
    )
      fail();
  }
  const g = d.gore;
  closed(g, [
    "wound",
    "residentViewBudget",
    "excludedSurfaceTokens",
    "sampleLimit",
    "placement",
    "profiles",
    "rigs",
    "palettes",
  ]);
  // placement: how finisher-gore.js picks the skin vertex a wound sits on (influence weight, facing, footprint, rays).
  closed(g.placement, [
    "influenceWeightMin",
    "sparseZoneDivisor",
    "normalMinLengthSq",
    "footprintHalf",
    "reliefDrop",
    "visibleBottom",
    "fleshOffsetWeight",
    "fleshFacingWeight",
    "otherOffsetWeight",
    "facingMin",
    "rayMinDistance",
    "rayBackoff",
  ]);
  if (
    !finite(g.placement.influenceWeightMin, 0.01, 1) ||
    !finite(g.placement.sparseZoneDivisor, 1, 64) ||
    !finite(g.placement.normalMinLengthSq, 0.1, 1) ||
    !finite(g.placement.footprintHalf, 0.1, 1) ||
    !finite(g.placement.reliefDrop, 0, 0.2) ||
    !finite(g.placement.visibleBottom, 0, 0.1) ||
    !finite(g.placement.fleshOffsetWeight, 0, 5) ||
    !finite(g.placement.fleshFacingWeight, 0, 5) ||
    !finite(g.placement.otherOffsetWeight, 0, 5) ||
    !finite(g.placement.facingMin, 0, 1) ||
    !finite(g.placement.rayMinDistance, 0.0001, 1) ||
    !finite(g.placement.rayBackoff, 0, 1)
  )
    fail();
  if (
    !list(g.excludedSurfaceTokens) ||
    !Number.isInteger(g.residentViewBudget) ||
    !finite(g.residentViewBudget, 1, 64) ||
    !Number.isInteger(g.sampleLimit) ||
    !finite(g.sampleLimit, 16, 128) ||
    !Array.isArray(g.profiles) ||
    g.profiles.length !== 4 ||
    new Set(g.profiles.map((p) => p.recipeId)).size !== 4 ||
    !Array.isArray(g.rigs) ||
    !g.rigs.length ||
    new Set(g.rigs.map((r) => r.id)).size !== g.rigs.length
  )
    fail();
  for (const p of g.profiles) {
    closed(p, [
      "recipeId",
      "region",
      "style",
      "mode",
      "spreadDegrees",
      "emitSeconds",
      "verticalSpeed",
      "dropSize",
      "jet",
      "pool",
      "burst",
    ]);
    const b = p.burst;
    closed(
      b,
      ["leadingCount", "leadingSize", "tailSize", "extent", "trailSeconds", "tailDelays"],
      ["leadingDelays", "holdSeconds", "gravity", "palettes", "leadingPaletteIndices", "markerLiftPx", "stretch"],
    );
    if (
      b.stretch &&
      (!Array.isArray(b.stretch) || b.stretch.length !== 3 || b.stretch.some((n) => !finite(n, 0.01, 2)))
    )
      fail();
    if (
      (b.leadingDelays &&
        (!Array.isArray(b.leadingDelays) ||
          b.leadingDelays.length !== 2 ||
          b.leadingDelays[0] !== 0 ||
          !finite(b.leadingDelays[1], 0.01, 0.1))) ||
      (b.holdSeconds !== undefined && !finite(b.holdSeconds, 0, 0.3)) ||
      (b.gravity !== undefined && !finite(b.gravity, 0.1, 10)) ||
      (b.markerLiftPx !== undefined && (!Number.isInteger(b.markerLiftPx) || !finite(b.markerLiftPx, 0, 80))) ||
      (b.leadingPaletteIndices &&
        (!Array.isArray(b.leadingPaletteIndices) ||
          b.leadingPaletteIndices.length !== b.leadingCount ||
          b.leadingPaletteIndices.some((i) => !Number.isInteger(i) || !finite(i, 0, 2))))
    )
      fail();
    if (b.palettes) {
      closed(b.palettes, ["flesh", "chitin"]);
      for (const palette of Object.values(b.palettes))
        if (
          !Array.isArray(palette) ||
          palette.length !== 3 ||
          palette.some((n) => !Number.isInteger(n) || !finite(n, 0, 0xffffff))
        )
          fail();
    }
    if (
      ![6, 8].includes(b.leadingCount) ||
      ![b.leadingSize, b.tailSize].every(
        (a) => Array.isArray(a) && a.length === 2 && finite(a[0], 0.02, 0.3) && finite(a[1], a[0], 0.3),
      ) ||
      !Array.isArray(b.extent) ||
      b.extent.length !== 2 ||
      !finite(b.extent[0], 0.1, 1) ||
      !finite(b.extent[1], b.extent[0], 1.5) ||
      !finite(b.trailSeconds, 0.05, 0.4) ||
      !Array.isArray(b.tailDelays) ||
      b.tailDelays.length !== 2 ||
      !finite(b.tailDelays[0], 0.01, 0.1) ||
      !finite(b.tailDelays[1], b.tailDelays[0], 0.2)
    )
      fail();
    if (
      !["pistol-directional", "bullet-native-collapse", "cutting-native-collapse", "blunt-native-collapse"].includes(
        p.recipeId,
      ) ||
      !ids.has(p.recipeId) ||
      !["body", "head"].includes(p.region) ||
      !["bullet", "slash", "blunt"].includes(p.style) ||
      !["exit", "directed", "fan", "radial"].includes(p.mode) ||
      !finite(p.spreadDegrees, 1, 360) ||
      !finite(p.emitSeconds, 0, 0.3) ||
      !finite(p.verticalSpeed, 0, 2) ||
      !finite(p.dropSize, 0.02, 0.15) ||
      typeof p.jet !== "boolean" ||
      typeof p.pool !== "boolean"
    )
      fail();
  }
  for (const r of g.rigs) {
    closed(r, ["id", "material", "bodyBones", "headBones", "radius"], ["mesh", "upperRegion"]);
    if (r.upperRegion && !["head", "body"].includes(r.upperRegion)) fail();
    if (
      !key(r.id) ||
      !["flesh", "chitin", "machine"].includes(r.material) ||
      ![r.bodyBones, r.headBones].every(
        (a) => Array.isArray(a) && a.every((n) => typeof n === "string" && /^\w{1,64}$/.test(n)),
      ) ||
      (r.material !== "machine" && (!r.bodyBones.length || !r.headBones.length)) ||
      (r.material === "machine" && typeof r.mesh !== "string") ||
      !finite(r.radius, 0.03, 0.4)
    )
      fail();
  }
  closed(g.palettes, ["flesh", "chitin", "machine"]);
  for (const palette of Object.values(g.palettes))
    if (
      !Array.isArray(palette) ||
      palette.length !== 3 ||
      palette.some((n) => !Number.isInteger(n) || !finite(n, 0, 0xffffff))
    )
      fail();
  const w = g.wound;
  closed(w, ["maxZoneFraction", "surfaceOffset", "mesh", "styles"]);
  if (!finite(w.maxZoneFraction, 0.1, 1) || !finite(w.surfaceOffset, 0.001, 0.01)) fail();
  const m = w.mesh;
  closed(m, [
    "segments",
    "centerRelief",
    "backRelief",
    "ringColors",
    "ringRadius",
    "ringRelief",
    "wobbleA",
    "wobbleAFrequency",
    "wobbleB",
    "wobbleBFrequency",
    "minSurfaceRadius",
    "minSize",
  ]);
  if (
    !Number.isInteger(m.segments) ||
    !finite(m.segments, 6, 64) ||
    !finite(m.centerRelief, 0, 0.05) ||
    !finite(m.backRelief, 0, 0.05) ||
    !finite(m.wobbleA, 0, 0.3) ||
    !finite(m.wobbleAFrequency, 0, 20) ||
    !finite(m.wobbleB, 0, 0.3) ||
    !finite(m.wobbleBFrequency, 0, 20) ||
    !finite(m.minSurfaceRadius, 0.001, 0.1) ||
    !finite(m.minSize, 0.001, 0.05) ||
    !Array.isArray(m.ringColors) ||
    m.ringColors.length !== m.ringRadius.length + 1 ||
    m.ringColors.some((n) => !Number.isInteger(n) || !finite(n, 0, 0xffffff)) ||
    !Array.isArray(m.ringRadius) ||
    m.ringRadius.length !== 3 ||
    m.ringRadius.some((n) => !finite(n, 0.05, 2)) ||
    !Array.isArray(m.ringRelief) ||
    m.ringRelief.length !== m.ringRadius.length ||
    m.ringRelief.some((n) => !finite(n, 0, 0.05))
  )
    fail();
  closed(w.styles, ["bullet", "slash", "blunt", "shell"]);
  for (const style of Object.values(w.styles)) {
    closed(style, ["width", "height", "reliefScale"], ["palette", "nonOrganicSize"]);
    if (
      style.nonOrganicSize &&
      (!Array.isArray(style.nonOrganicSize) ||
        style.nonOrganicSize.length !== 2 ||
        !finite(style.nonOrganicSize[0], 0.02, 0.6) ||
        !finite(style.nonOrganicSize[1], 0.02, 0.4))
    )
      fail();
    if (
      !finite(style.width, 0.02, 0.6) ||
      !finite(style.height, 0.02, 0.4) ||
      !finite(style.reliefScale, 0.1, 1) ||
      (style.palette &&
        (!Array.isArray(style.palette) ||
          style.palette.length !== 4 ||
          style.palette.some((n) => !Number.isInteger(n) || !finite(n, 0, 0xffffff))))
    )
      fail();
  }
  for (const r of d.recipes) if (r.goreRecipeId && !g.profiles.some((p) => p.recipeId === r.goreRecipeId)) fail();
  return freeze(d);
}
