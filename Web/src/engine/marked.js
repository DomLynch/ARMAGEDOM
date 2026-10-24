import { publicAreaRegistry } from "../area-registry.js";
import { closed, freeze } from "./content-schema.js";
import { LOCKER_RESOURCE_RULES } from "./locker-state.js";
export const MARKED_DEFAULTS = freeze({
  version: 1,
  cashPerKill: 100,
  bossCash: 200,
  maxMoney: 1000000000,
  hunterBounty: 300,
  maxHunters: 1,
  hostileBudget: 6,
  minSpawnDistance: 8,
  warningSeconds: 2,
  spawnCooldown: 30,
  arrivalDelay: 6,
  hunterHealth: 80,
  hunterSpeed: 3.2,
  shop: { pistol: { price: 100, amount: 6 }, rifle: { price: 150, amount: 4 }, dressing: { price: 100, amount: 25 } },
});
export function validateMarkedData(input, registry = publicAreaRegistry) {
  if (input === undefined) return null;
  closed(input, Object.keys(MARKED_DEFAULTS), ["projection", "projections", "hunters", "bounty"]);
  for (const k of ["hunters", "bounty"])
    if (input[k] !== undefined && typeof input[k] !== "boolean") throw TypeError("Invalid Marked switch");
  for (const key of Object.keys(MARKED_DEFAULTS).filter((k) => k !== "shop"))
    if (!Number.isFinite(input[key]) || input[key] <= 0) throw TypeError("Invalid Marked rule");
  if (
    input.version !== 1 ||
    input.maxHunters !== 1 ||
    input.hostileBudget !== 6 ||
    input.maxMoney > 1e9 ||
    !Number.isSafeInteger(input.maxMoney) ||
    input.minSpawnDistance < 8 ||
    input.warningSeconds < 2 ||
    input.spawnCooldown < 30 ||
    input.arrivalDelay < 6 ||
    input.hunterHealth > 120 ||
    input.hunterSpeed > 4
  )
    throw TypeError("Invalid bounded Marked rules");
  for (const k of ["cashPerKill", "bossCash", "hunterBounty"])
    if (!Number.isSafeInteger(input[k])) throw TypeError("Integer cash required");
  closed(input.shop, ["pistol", "rifle", "dressing"]);
  for (const row of Object.values(input.shop)) {
    closed(row, ["price", "amount"]);
    if (!Number.isSafeInteger(row.price) || row.price <= 0 || !Number.isSafeInteger(row.amount) || row.amount <= 0)
      throw TypeError("Invalid Marked shop");
  }
  function checkProjection(p) {
    closed(p, ["version", "areaId", "portrait", "points", "opacity", "flicker"]);
    if (
      p.version !== 1 ||
      !registry.has(p.areaId) ||
      registry.get(p.areaId).visibility !== "public" ||
      p.areaId === "central-hub" ||
      p.portrait !== "westminster/wanted-portrait.png" ||
      !Number.isFinite(p.opacity) ||
      p.opacity < 0.4 ||
      p.opacity > 0.9 ||
      !Number.isFinite(p.flicker) ||
      p.flicker < 0 ||
      p.flicker > 0.03 ||
      !Array.isArray(p.points) ||
      p.points.length !== 4
    )
      throw TypeError("Invalid registered WANTED wall");
    for (const q of p.points) {
      closed(q, ["x", "y"]);
      if (![q.x, q.y].every((n) => Number.isFinite(n) && n > 0 && n < 1)) throw TypeError("Invalid WANTED quad");
    }
    const crosses = p.points.map((a, i) => {
      const b = p.points[(i + 1) % 4],
        c = p.points[(i + 2) % 4];
      return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    });
    if (crosses.some((n) => !Number.isFinite(n) || Math.abs(n) < 1e-6 || Math.sign(n) !== Math.sign(crosses[0])))
      throw TypeError("Non-convex WANTED quad");
  }
  if (input.projection !== undefined) {
    if (input.projections !== undefined || input.projection.areaId !== "westminster")
      throw TypeError("Ambiguous WANTED content");
    checkProjection(input.projection);
  }
  if (input.projections !== undefined) {
    const rows = input.projections,
      ids = Object.keys(rows ?? {});
    closed(rows, ids);
    if (!ids.length || ids.length > 8) throw TypeError("Invalid WANTED area set");
    for (const id of ids) {
      if (rows[id]?.areaId !== id) throw TypeError("WANTED area key mismatch");
      checkProjection(rows[id]);
    }
  }
  return freeze(structuredClone(input));
}
// The bounty views read this, so a save that still carries a bounty shows none while the bounty is off; the save bytes are untouched.
export const effectiveBounty = (g) => (g.world?.markedData?.bounty === false ? 0 : (g.marked?.bounty ?? 0));
export const freshMarked =() => ({ version: 1, carried: 0, bank: 0, bounty: 0 });
export function validMarked(s, max = MARKED_DEFAULTS.maxMoney) {
  try {
    closed(s, ["version", "carried", "bank", "bounty"]);
    return (
      s.version === 1 &&
      ["carried", "bank", "bounty"].every((k) => Number.isSafeInteger(s[k]) && s[k] >= 0 && s[k] <= max)
    );
  } catch {
    return false;
  }
}
export function copyMarked(s) {
  if (!validMarked(s)) throw TypeError("Invalid Marked state");
  return { ...s };
}
export function markedShopEligible(g, id) {
  const row = g.world?.markedData?.shop[id];
  if (!row || !(g.marked?.bank >= row.price)) return false;
  if (id === "pistol")
    return !!g.pistol?.collected && g.pistol.reserve + row.amount <= LOCKER_RESOURCE_RULES["pistol-reserve"].carryCap;
  if (id === "rifle")
    return (
      g.rifle?.status === "owned" && g.rifle.reserve + row.amount <= LOCKER_RESOURCE_RULES["rifle-reserve"].carryCap
    );
  return id === "dressing" && g.player.hp > 0 && g.player.hp < g.player.maxHP;
}
