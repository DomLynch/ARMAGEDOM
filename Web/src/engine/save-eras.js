// The save chain written down once, as data: every era of the stored run, oldest to newest. Each row is the record's
// own `version` and the localStorage key a record of that era lives under (the key ends in `:v<version>`). The browser
// writes only the newest row; the older rows are read-only migration inputs that the layered codecs still understand.
// A server-held run (multiplayer proof P3) versions its records with the same numbers. Adding an era means adding a row
// here and a replay fixture (or an explicit reason) in tests/save-eras.test.js.
import { RUN_SAVE_KEY } from "./run-state.js";
import { PROGRESSION_SAVE_KEY } from "./progression-core.js";
import { EXPEDITION_SAVE_KEY, AREA_BOSS_SAVE_KEY } from "./expedition-core.js";
import { UNIQUE_REWARD_SAVE_KEY } from "./unique-reward-core.js";
import { FLAME_SAVE_KEY } from "./flame-core.js";
import { RIFLE_SAVE_KEY } from "./rifle-core.js";
import { BOSS_EQUIPMENT_SAVE_KEY, PREVIOUS_BOSS_EQUIPMENT_SAVE_KEY } from "./boss-equipment-core.js";
import { LOCKER_SAVE_KEY } from "./locker-core.js";
import { OPENING_STORY_SAVE_KEY, PREVIOUS_OPENING_STORY_SAVE_KEY } from "./opening-story-core.js";
import { REAPER_SAVE_KEY } from "./reaper-core.js";
import { RAILGUN_SAVE_KEY } from "./railgun-core.js";
import { HUB_SAVE_KEY } from "./hub-core.js";
import { MARKED_SAVE_KEY } from "./marked-core.js";

const era = (version, layer, key) => Object.freeze({ version, layer, key });
export const SAVE_ERAS = Object.freeze([
  era(1, "run", RUN_SAVE_KEY),
  era(4, "progression", PROGRESSION_SAVE_KEY),
  era(5, "expedition", EXPEDITION_SAVE_KEY),
  era(6, "area-boss", AREA_BOSS_SAVE_KEY),
  era(7, "unique-reward", UNIQUE_REWARD_SAVE_KEY),
  era(8, "flame", FLAME_SAVE_KEY),
  era(9, "rifle", RIFLE_SAVE_KEY),
  era(10, "boss-equipment", PREVIOUS_BOSS_EQUIPMENT_SAVE_KEY),
  era(11, "boss-equipment", BOSS_EQUIPMENT_SAVE_KEY),
  era(12, "locker", LOCKER_SAVE_KEY),
  // The opening-story layer's first key was retired when it moved to v14; real records under it still exist.
  era(13, "opening-story", PREVIOUS_OPENING_STORY_SAVE_KEY),
  era(14, "opening-story", OPENING_STORY_SAVE_KEY),
  era(15, "reaper", REAPER_SAVE_KEY),
  era(16, "railgun", RAILGUN_SAVE_KEY),
  era(17, "hub", HUB_SAVE_KEY),
  era(18, "marked", MARKED_SAVE_KEY),
]);

export const CURRENT_ERA = SAVE_ERAS[SAVE_ERAS.length - 1];

/** The era row a raw stored record belongs to (by its own `version`), or null when it is not a known era. */
export function eraOfRecord(raw) {
  try {
    const version = JSON.parse(raw)?.version;
    return SAVE_ERAS.find((row) => row.version === version) ?? null;
  } catch {
    return null;
  }
}
