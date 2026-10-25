import { GAME_DATA } from "./game-data.js";
import { KNIFE_MOVES } from "../donor/knife.js";
import { resolveCreatureMoves } from "./creature-move-resolver.js";

// The creature bite and low-strike moves and the salamander breath live in Web/src/data/creatures.json (read through game-data.js).
export const CREATURE_MOVES = resolveCreatureMoves(GAME_DATA.creatures.moves, KNIFE_MOVES);
export const SALAMANDER_BREATH = GAME_DATA.creatures.salamanderBreath;
