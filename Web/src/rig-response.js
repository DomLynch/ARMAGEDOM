import { GAME_DATA } from "./engine/game-data.js";
import { rigCapability, rigNumber, rigText } from "./rig-capabilities.js";

// The hit or death reaction an actor plays: the clip and how many ticks it holds. The per-rig clips and ticks are rows of
// rig-capabilities.json; a rig with none (the humans and bosses) uses creatures.json defaultResponse and a hit holds for the
// hit's stagger. `hp` decides hit or death; pass 0 for a death.
export function rigResponse(rig, hp, time, staggerSeconds) {
  const defaults = GAME_DATA.creatures.defaultResponse,
    alive = rigCapability(rig, "strictAlive") ? hp > 0 : Boolean(hp);
  return alive
    ? {
        clip: rigText(rig, "hitClip") ?? defaults.hitClip,
        start: time,
        ticks: rigNumber(rig, "hitTicks") ?? Math.round(staggerSeconds * 60),
      }
    : {
        clip: rigText(rig, "deathClip") ?? defaults.deathClip,
        start: time,
        ticks: rigNumber(rig, "deathTicks") ?? defaults.deathTicks,
      };
}
