// data/postBossRaid.json (engine/post-boss-raid.js): the one raid row. The validator lives here so the loader stays small.
import { closed } from "./content-schema.js";
import { fail, number, count } from "./game-data-checks.js";

const ids = (field, list) => {
  if (!Array.isArray(list) || list.some((a) => typeof a !== "string" || !a)) fail("postBossRaid", `${field} must list area ids`);
};

export function validatePostBossRaid(d) {
  closed(d, [
    "schema_version",
    "enabled",
    "trigger",
    "delaySeconds",
    "durationSeconds",
    "targetZones",
    "hunterCount",
    "maxSimultaneous",
    "retrySeconds",
    "messageSeconds",
    "text",
  ]);
  if (typeof d.enabled !== "boolean") fail("postBossRaid", "enabled must be a boolean");
  closed(d.trigger, ["event", "ignoreAreas"]);
  if (typeof d.trigger.event !== "string" || !d.trigger.event) fail("postBossRaid", "trigger.event must be an event type");
  ids("trigger.ignoreAreas", d.trigger.ignoreAreas);
  ids("targetZones", d.targetZones);
  if (!d.targetZones.length) fail("postBossRaid", "targetZones needs at least one area");
  if (d.targetZones.some((a) => d.trigger.ignoreAreas.includes(a))) fail("postBossRaid", "a target zone may not be an ignored area");
  for (const f of ["delaySeconds", "retrySeconds", "messageSeconds"]) number("postBossRaid", f, d[f], 0.1);
  number("postBossRaid", "durationSeconds", d.durationSeconds, d.delaySeconds);
  count("postBossRaid", "hunterCount", d.hunterCount, 1, 64);
  count("postBossRaid", "maxSimultaneous", d.maxSimultaneous, 1, d.hunterCount);
  closed(d.text, ["armed", "arrived", "over"]);
  for (const k of ["armed", "arrived", "over"])
    if (typeof d.text[k] !== "string" || !d.text[k]) fail("postBossRaid", `text.${k} must be a text id`);
}
