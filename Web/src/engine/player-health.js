// Active simulation only. No wall clock, saved timestamp, or independent timer.
export const PLAYER_HEALTH_RULES = Object.freeze({ regenerationSeconds: 60 });
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
