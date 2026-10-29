import { KNIFE_RULES as R } from "../donor/knife.js";
const EPS = 1e-8;
export function knifeEnergy(entity, regen = 1) {
  if (entity.maxStamina !== undefined) return entity;
  entity.stamina = R.maxStamina;
  entity.maxStamina = R.maxStamina;
  entity.exhausted = false;
  entity.staminaRegen = regen;
  entity.guardRecoverAt = 0;
  Object.defineProperty(entity, "guard", {
    enumerable: true,
    configurable: true,
    get() {
      return this.stamina;
    },
    set(value) {
      this.stamina = Math.max(0, Math.min(this.maxStamina, value));
      if (this.stamina <= EPS) this.exhausted = true;
    },
  });
  return entity;
}
export function knifeAffordable(entity, cost) {
  if (entity.stamina <= EPS) entity.exhausted = true;
  return !entity.exhausted && entity.stamina + EPS >= cost;
}
export function knifeSpend(g, entity, cost) {
  entity.guard = Math.max(0, entity.stamina - cost);
  entity.guardRecoverAt = g.time + R.regenDelay / 60;
  if (entity.exhausted) {
    entity.guarding = false;
    entity.parryUntil = 0;
  }
}
export function knifeRegen(g, entity, dt, committed) {
  if (entity.stamina <= EPS) entity.exhausted = true;
  if (!committed && g.time + EPS >= entity.guardRecoverAt && g.time + EPS >= (entity.guardBrokenUntil ?? 0))
    entity.guard = entity.stamina + R.regen * (entity.staminaRegen ?? 1) * (entity.guarding ? R.guardRegen : 1) * dt;
  if (entity.exhausted && entity.stamina + EPS >= R.exhaustRecover) entity.exhausted = false;
}
