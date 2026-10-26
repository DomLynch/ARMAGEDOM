// The player-facing text of the session files, read from data/sessionText.json. sessionText("run.vestEquipped") returns the string;
// sessionText("run.supplyRounds", { amount: 3 }) fills {amount}. A missing key or a missing value throws at once, so a typo cannot ship
// as a blank message.
import { GAME_DATA } from "./game-data.js";

export function sessionText(path, values = {}) {
  const [group, key] = path.split(".");
  const rows = Object.hasOwn(GAME_DATA.sessionText, group) ? GAME_DATA.sessionText[group] : null,
    text = rows && Object.hasOwn(rows, key) ? rows[key] : null;
  if (typeof text !== "string") throw Error(`No session text ${path}`);
  return text.replace(/\{([A-Za-z]+)\}/g, (_, name) => {
    if (!Object.hasOwn(values, name)) throw Error(`Session text ${path} needs {${name}}`);
    return String(values[name]);
  });
}
