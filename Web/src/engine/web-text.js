// The one reader for webText.json (see engine/game-data-web-text.js): a line by id, with {placeholders} filled from `vars`.
// An unknown id or a placeholder with no value throws, so a typo shows up in the first test that renders the line.
import { GAME_DATA } from "./game-data.js";

export function webText(id, vars = {}) {
  const template = GAME_DATA.webText.texts[id];
  if (template === undefined) throw new Error(`webText: no text with id ${id}`);
  return template.replace(/\{([A-Za-z][A-Za-z0-9]*)\}/g, (_, name) => {
    if (!(name in vars)) throw new Error(`webText: ${id} needs {${name}}`);
    return String(vars[name]);
  });
}
