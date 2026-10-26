import { GAME_DATA } from "../engine/game-data.js";

// Focused immutable numeric donor snapshot; provenance.json pins source. Do not hand-edit.
// The numbers live in Web/src/data/knifePaths.json (read through game-data.js, shape checked there): hero and goblin, four unchained paths each.
export const knifePaths = GAME_DATA.knifePaths.paths;
