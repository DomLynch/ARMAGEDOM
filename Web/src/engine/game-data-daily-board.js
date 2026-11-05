// dailyBoard.json validator (engine/daily-board.js reads the data): the read-only daily leaderboard panel. Times are milliseconds. The validator lives
// here so the loader (engine/game-data.js) stays small. The panel's words are in webText.json (board.*).
import { closed } from "./content-schema.js";
import { fail, count } from "./game-data-checks.js";

export function validateDailyBoard(d) {
  closed(d, ["schema_version", "note", "enabled", "offSwitch", "op", "maxRows", "cacheMs", "nameMax"]);
  if (typeof d.enabled !== "boolean") fail("dailyBoard", "enabled");
  if (typeof d.offSwitch !== "string" || !/^[a-z0-9]{1,16}$/.test(d.offSwitch)) fail("dailyBoard", "offSwitch");
  if (typeof d.op !== "string" || !/^[a-z_]{1,24}$/.test(d.op)) fail("dailyBoard", "op");
  count("dailyBoard", "maxRows", d.maxRows, 1, 20);
  count("dailyBoard", "cacheMs", d.cacheMs, 0, 600000);
  count("dailyBoard", "nameMax", d.nameMax, 4, 40);
}
