// Checks shared by the game-data loader (engine/game-data.js) and its validator modules (game-data-weapons.js, game-data-combat.js,
// game-data-creatures.js): the loader keeps only the JSON imports, the registry and the freeze, so it stays well under the source size limit.
export const fail = (file, why) => {
  throw TypeError(`Invalid game data ${file}: ${why}`);
};
export const count = (file, field, value, min, max) => {
  if (!Number.isSafeInteger(value) || value < min || value > max)
    fail(file, `${field} must be an integer from ${min} to ${max}`);
};
export const number = (file, field, v, min = 0) => {
  if (!Number.isFinite(v) || v < min) fail(file, `${field} must be a finite number >= ${min}`);
};
export const id = (file, field, v) => {
  if (typeof v !== "string" || !/^[a-z0-9-]{1,24}$/.test(v)) fail(file, `${field} must be a lowercase id`);
};
