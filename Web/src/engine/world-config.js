// Where the live world's guest sign-in lives (data/world.json auth). Both values are PUBLIC (the project URL and its publishable key); no
// secret belongs there, and the loader rejects anything that is not a publishable key. Anonymous sign-ins must also be enabled on the
// project, otherwise the guest signup is refused and the live world stays offline.
import { GAME_DATA } from "./game-data.js";

export const WORLD_AUTH = GAME_DATA.world.auth;
