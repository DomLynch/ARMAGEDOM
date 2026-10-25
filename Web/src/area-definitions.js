// Registered area data lives in data/areas.json (read through the single game-data loader); the registry validates it in depth.
import { GAME_DATA } from "./engine/game-data.js";

export const areaDefinitions = GAME_DATA.areas.areas;
export const areaAssets = GAME_DATA.areas.assets;
