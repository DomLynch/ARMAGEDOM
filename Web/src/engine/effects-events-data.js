// visual.json `effects.feedback` events, shot flash, hit marker, pickup pulse, aim cue, loot and the tone synth (effects.js). Called from
// validateEffectsFeedback. A small schema: "n" a finite number >= 0, "p" a number above 0, "s" a share 0 to 1, "h" a 6-digit hex colour,
// "i" an integer >= 1, [kind] an array of that kind, [kind, length] a fixed-length array, strings["a","b"] a list of strings, an
// object a nested closed row.
import { closed } from "./content-schema.js";
import { fail } from "./game-data-checks.js";

// A function, not a top-level table: this is a shape description, not tuning.
const schema = () => ({
  events: {
    railgun: { seconds: "p", colour: "h", flashScale: ["n", 3], flashSeconds: "p" },
    warningColour: "h",
    attackColours: { specialKind: "n", special: "h", other: "h" },
    confirmationSeconds: "p",
    lineSeconds: "p",
    lowLine: {
      biteReach: "p",
      dogBiteReach: "p",
      otherReach: "p",
      roachBiteHeight: "n",
      dogBiteHeight: "n",
      midSlashShare: "p",
      midSlashScaleFallback: "p",
      height: "n",
    },
    special: { reach: "p", combatScaleFallback: "p", height: "n" },
    stab: { height: "n", length: "p", opacity: "s" },
    melee: { specialReach: "p", heavyReach: "p", slashReach: "p", arc: "p", height: "n" },
    defence: { reach: "p", arc: "p", seconds: "p", colours: { parry: "h", block: "h", break: "h" } },
  },
  shot: { originHeight: "n", flash: { high: { scale: ["n", 3], seconds: "p" }, low: { scale: ["n", 3], seconds: "p" } } },
  hitMarker: { sideMargin: "n", topMax: "p", topShare: "s", bottomShare: "s" },
  pickupPulse: { base: "p", swing: "n", rate: "p", phoneWidth: "p", phoneScale: "p" },
  cue: {
    edgeMargin: "n",
    minViewport: "p",
    clampZ: "s",
    pixels: { target: "p", ground: "p" },
    fallbackScale: { target: "p", ground: "p" },
    opacity: { readyTarget: "s", ready: "s", notReady: "s" },
    outlineOpacity: "s",
  },
  loot: { spinRate: "n", height: "n" },
  audio: {
    frequencies: { attack: "p", hit: "p", parry: "p", block: "p", dodge: "p", loot: "p", death: "p", wave: "p" },
    seconds: { death: "p", other: "p" },
    sineEvents: "strings",
    minFrequency: "p",
    rampShare: "s",
    gain: "p",
    gainEnd: "p",
  },
});

function check(path, value, spec) {
  if (spec === "strings") {
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string")) fail("visual", `${path} must be a list of strings`);
  } else if (Array.isArray(spec)) {
    if (!Array.isArray(value) || value.length !== spec[1] || !value.every((v) => Number.isFinite(v) && v >= 0))
      fail("visual", `${path} must be ${spec[1]} non-negative numbers`);
  } else if (typeof spec === "object") {
    closed(value, Object.keys(spec));
    for (const [key, sub] of Object.entries(spec)) check(`${path}.${key}`, value[key], sub);
  } else if (spec === "h") {
    if (typeof value !== "string" || !/^[0-9a-f]{6}$/.test(value)) fail("visual", `${path} must be 6 lowercase hex digits`);
  } else if (!Number.isFinite(value) || value < 0) fail("visual", `${path} must be a non-negative number`);
  else if (spec === "p" && !(value > 0)) fail("visual", `${path} must be above 0`);
  else if (spec === "s" && value > 1) fail("visual", `${path} must be 0 to 1`);
}

export const eventsKeys = () => Object.keys(schema());
export function validateEffectsEvents(c) {
  for (const [key, spec] of Object.entries(schema())) check(`effects.feedback.${key}`, c[key], spec);
  const audio = c.audio;
  for (const name of audio.sineEvents)
    if (!Object.hasOwn(audio.frequencies, name)) fail("visual", `effects.feedback.audio.sineEvents names unknown event ${name}`);
}
