// data/corpseRun.json (engine/corpse-run.js, corpse-run-view.js): what a death drops, how close you must be to take it back, how long
// before scavengers take it, how bosses converge on it, and its look. The validator lives here so the loader stays small.
import { closed } from "./content-schema.js";
import { fail, number, count } from "./game-data-checks.js";

export function validateCorpseRun(d) {
  const FILE = "corpseRun",
    COLOURS = ["bagColour", "trimColour", "beaconColour"],
    SHARES = ["beaconOpacity", "trimShare", "ringOpacity"],
    SIZES = ["ringWidth", "bagWidth","bagHeight", "bagLength", "beaconRadius", "beaconHeight", "groundLift", "pulseSeconds"];
  closed(d, ["schema_version", "enabled", "drop", "retrieve", "bag", "respawn", "convergence", "view"]);
  if (typeof d.enabled !== "boolean") fail(FILE, "enabled must be a boolean");
  closed(d.drop, ["cashShare", "minCash"]);
  if (!(d.drop.cashShare >= 0 && d.drop.cashShare <= 1)) fail(FILE, "drop.cashShare must be 0 to 1");
  count(FILE, "drop.minCash", d.drop.minCash, 1, 1000000);
  closed(d.retrieve, ["radius"]);
  number(FILE, "retrieve.radius", d.retrieve.radius, 0.1);
  closed(d.bag, ["scavengerSeconds", "mergeOnSecondDeath", "noticeSeconds", "stealableBy"]);
  // The hook for later (other players stealing a bag): only "none" exists today and nothing reads another value.
  if (d.bag.stealableBy !== "none") fail(FILE, "bag.stealableBy must be none (stealing is not built)");
  closed(d.respawn, ["enabled", "safehouseAreaId", "homeAreas"]);
  if (typeof d.respawn.enabled !== "boolean") fail(FILE, "respawn.enabled must be a boolean");
  if (typeof d.respawn.safehouseAreaId !== "string" || !d.respawn.safehouseAreaId) fail(FILE, "respawn.safehouseAreaId must be an area id");
  if (!Array.isArray(d.respawn.homeAreas) || d.respawn.homeAreas.some((a) => typeof a !== "string" || !a)) fail(FILE, "respawn.homeAreas must list area ids");
  number(FILE, "bag.scavengerSeconds", d.bag.scavengerSeconds, 1);
  number(FILE, "bag.noticeSeconds", d.bag.noticeSeconds, 1);
  if (typeof d.bag.mergeOnSecondDeath !== "boolean") fail(FILE, "bag.mergeOnSecondDeath must be a boolean");
  closed(d.convergence, ["enabled", "engageRadius", "leashPadding", "arriveRadius"]);
  if (typeof d.convergence.enabled !== "boolean") fail(FILE, "convergence.enabled must be a boolean");
  for (const f of ["engageRadius", "leashPadding", "arriveRadius"]) number(FILE, `convergence.${f}`, d.convergence[f], 0);
  closed(d.view, [...COLOURS, ...SHARES, ...SIZES, "segments", "ringSegments"]);
  count(FILE, "view.segments", d.view.segments, 3, 64);
  count(FILE, "view.ringSegments", d.view.ringSegments, 8, 128);
  for (const f of COLOURS) if (!/^[0-9a-f]{6}$/.test(d.view[f])) fail(FILE, `view.${f} must be a 6-digit hex colour`);
  for (const f of SHARES) if (!(d.view[f] >= 0 && d.view[f] <= 1)) fail(FILE, `view.${f} must be 0 to 1`);
  for (const f of SIZES) number(FILE, `view.${f}`, d.view[f], 0.01);
}
