import { GAME_DATA } from "./engine/game-data.js";
// Additional low-hover drones (rows in data/spawns.json). Existing ground residents and their saved keys stay intact.
// Physical/attack/hover timing belongs the shared Combat+Characters descriptor, not placement.
export const AREA_DRONE_SPAWNS = GAME_DATA.spawns.drones;
