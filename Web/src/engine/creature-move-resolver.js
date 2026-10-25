// Resolves the rows of Web/src/data/creatures.json `moves`. A row names its parents in `extends` ("knife:<id>" is a knife move, any
// other name an earlier row; a list layers left to right) and lists only what it changes. The seconds fields are derived from the
// tick counts at 60 Hz, so a row that changes a tick count never leaves them stale. Pure: game-data.js uses it to validate the file.
const SECONDS = [
  ["windupTicks", "windup"],
  ["activeTicks", "active"],
  ["recoveryTicks", "recovery"],
];
export function resolveCreatureMoves(rows, knifeMoves) {
  const resolved = {};
  const parent = (ref) => {
    const knife = ref.startsWith("knife:") ? knifeMoves[ref.slice(6)] : undefined;
    const row = knife ?? resolved[ref];
    if (!row) throw TypeError(`Creature move extends unknown or later row "${ref}"`);
    return row;
  };
  for (const [name, { extends: from = [], ...own }] of Object.entries(rows)) {
    const move = Object.assign({}, ...[from].flat().map(parent), own);
    for (const [ticks, seconds] of SECONDS) if (ticks in move) move[seconds] = move[ticks] / 60;
    resolved[name] = Object.freeze(move);
  }
  return Object.freeze(resolved);
}
