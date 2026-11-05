// enemyBars.json validator (engine/enemy-bars.js reads the data): the health bar over a hurt hostile. Seconds and CSS pixels unless a name
// says otherwise; colours are CSS colour strings; `half` is the fraction that turns device coordinates (two units across) into pixels.
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

const COLOUR = /^(#[0-9a-f]{6}|rgba?\([0-9., ]{5,32}\))$/i;

export function validateEnemyBars(d) {
  closed(d, [
    "schema_version",
    "enabled",
    "offSwitch",
    "maxVisible",
    "holdSeconds",
    "targetHoldSeconds",
    "fadeSeconds",
    "lowFraction",
    "liftPx",
    "half",
    "decay",
    "classes",
    "target",
    "colours",
  ]);
  if (d.schema_version !== 1) fail("enemyBars", "schema_version must be 1");
  if (typeof d.enabled !== "boolean") fail("enemyBars", "enabled must be true or false");
  closed(d.offSwitch, ["param", "value"]);
  for (const k of ["param", "value"])
    if (typeof d.offSwitch[k] !== "string" || !/^[a-z0-9]{1,16}$/.test(d.offSwitch[k])) fail("enemyBars", `offSwitch.${k}`);
  count("enemyBars", "maxVisible", d.maxVisible, 1, 64);
  number("enemyBars", "holdSeconds", d.holdSeconds, 0);
  number("enemyBars", "targetHoldSeconds", d.targetHoldSeconds, d.holdSeconds);
  number("enemyBars", "fadeSeconds", d.fadeSeconds, 0);
  if (d.fadeSeconds > d.holdSeconds) fail("enemyBars", "fadeSeconds must not exceed holdSeconds");
  number("enemyBars", "lowFraction", d.lowFraction, 0);
  if (d.lowFraction > 1) fail("enemyBars", "lowFraction is at most 1");
  number("enemyBars", "liftPx", d.liftPx, 0);
  number("enemyBars", "half", d.half, 0);
  if (d.half <= 0 || d.half > 1) fail("enemyBars", "half must be above 0 and at most 1");
  closed(d.decay, ["delaySeconds", "perSecond"]);
  number("enemyBars", "decay.delaySeconds", d.decay.delaySeconds, 0);
  number("enemyBars", "decay.perSecond", d.decay.perSecond, 0);
  if (d.decay.perSecond <= 0) fail("enemyBars", "decay.perSecond must be above 0");
  closed(d.classes, ["normal", "elite", "boss"]);
  for (const [name, row] of Object.entries(d.classes)) {
    closed(row, ["always", "heightPx", "widthPx"]);
    if (typeof row.always !== "boolean") fail("enemyBars", `${name}.always must be true or false`);
    count("enemyBars", `${name}.heightPx`, row.heightPx, 1, 64);
    closed(row.widthPx, ["phone", "desktop"]);
    count("enemyBars", `${name}.widthPx.phone`, row.widthPx.phone, 1, 512);
    count("enemyBars", `${name}.widthPx.desktop`, row.widthPx.desktop, row.widthPx.phone, 512);
  }
  closed(d.target, ["heightPx", "minWidthPx", "maxWidthPx"]);
  count("enemyBars", "target.heightPx", d.target.heightPx, 1, 64);
  count("enemyBars", "target.minWidthPx", d.target.minWidthPx, 1, 512);
  count("enemyBars", "target.maxWidthPx", d.target.maxWidthPx, d.target.minWidthPx, 512);
  closed(d.colours, ["back", "decay", "fill", "low", "elite", "follower"]);
  for (const [name, value] of Object.entries(d.colours))
    if (typeof value !== "string" || !COLOUR.test(value)) fail("enemyBars", `colours.${name} must be a hex or rgb colour`);
}
