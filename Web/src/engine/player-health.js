import { GAME_DATA } from "./game-data.js";
// Active simulation only. No wall clock, saved timestamp, or independent timer.
// The regeneration time lives in Web/src/data/creatures.json `playerHealth` (read through game-data.js).
export const PLAYER_HEALTH_RULES = GAME_DATA.creatures.playerHealth;
export function stepPlayerHealth(player, dt) {
  if (
    !Number.isFinite(dt) ||
    dt <= 0 ||
    !Number.isFinite(player.hp) ||
    !Number.isFinite(player.maxHP) ||
    player.hp <= 0 ||
    player.maxHP <= 0 ||
    player.hp >= player.maxHP
  )
    return;
  const amount = (player.maxHP / PLAYER_HEALTH_RULES.regenerationSeconds) * dt;
  player.hp = player.maxHP - player.hp <= amount + 1e-10 ? player.maxHP : player.hp + amount;
}
