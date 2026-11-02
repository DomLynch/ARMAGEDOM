import { GAME_DATA } from "./engine/game-data.js";
import { KNIFE_MOVES } from "./donor/knife.js";

// The creature bite and low-strike moves are rows of Web/src/data/creatures.json `moves` (read through game-data.js). A row names its
// parents in `extends` ("knife:<id>" is a knife move, any other name an earlier row; a list layers left to right) and lists only what
// it changes. The seconds fields are derived from the tick counts at 60 Hz, so a row that changes a tick count never leaves them stale.
const KNIFE_PREFIX = "knife:";
export function resolveCreatureMoves(rows, knifeMoves) {
  const resolved = {},
    seconds = [
      ["windupTicks", "windup"],
      ["activeTicks", "active"],
      ["recoveryTicks", "recovery"],
    ];
  const parent = (ref) => {
    const knife = ref.startsWith(KNIFE_PREFIX) ? knifeMoves[ref.slice(KNIFE_PREFIX.length)] : undefined;
    const row = knife ?? resolved[ref];
    if (!row) throw TypeError(`Creature move extends unknown or later row "${ref}"`);
    return row;
  };
  for (const [name, { extends: from = [], ...own }] of Object.entries(rows)) {
    const move = Object.assign({}, ...[from].flat().map(parent), own);
    for (const [ticksField, secondsField] of seconds)
      if (ticksField in move) move[secondsField] = move[ticksField] / 60;
    resolved[name] = Object.freeze(move);
  }
  return Object.freeze(resolved);
}

export const CREATURE_MOVES = resolveCreatureMoves(GAME_DATA.creatures.moves, KNIFE_MOVES);
export const SALAMANDER_BREATH = GAME_DATA.creatures.salamanderBreath;
