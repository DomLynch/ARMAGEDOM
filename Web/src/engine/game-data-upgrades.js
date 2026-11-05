// safehouseUpgrades.json validator (engine/upgrades-state.js, upgrades-core.js and upgrades.js read the data): the permanent safehouse upgrades, their
// prices and effects, and the writer routes. The validator lives here so the loader (engine/game-data.js) stays small.
import { closed } from "./content-schema.js";
import { count, fail, number } from "./game-data-checks.js";

const FILE = "safehouseUpgrades";
const SERVER_ID = /^[a-z0-9-]{1,32}$/; // the server's arma_upgrade_defs.id rule
// Each effect kind and the fields it carries; a kind is used by at most one row.
const effectFields = (kind) =>
  kind === "reserveMagazines"
    ? ["kind", "perLevel", "roundsPerMagazine"]
    : kind === "maxStamina" || kind === "dodgeRecovery"
      ? ["kind", "perLevel"]
      : null;

export function validateUpgrades(d) {
  const NAMES = ["note", "offParam", "offValue", "cacheKey"];
  closed(d, [
    "schema_version",
    "enabled",
    ...NAMES,
    "limits",
    "refreshMs",
    "retryMs",
    "percentScale",
    "api",
    "upgrades",
  ]);
  if (typeof d.enabled !== "boolean") fail(FILE, "enabled must be true or false");
  for (const name of NAMES)
    if (typeof d[name] !== "string" || !d[name]) fail(FILE, `${name} must be a nonempty string`);
  closed(d.limits, ["maxLevels", "maxPrice", "maxPerLevel", "maxRounds", "maxDodgeCut"]);
  const L = d.limits;
  for (const name of ["maxLevels", "maxPrice", "maxPerLevel", "maxRounds"])
    count(FILE, `limits.${name}`, L[name], 1, Number.MAX_SAFE_INTEGER);
  number(FILE, "limits.maxDodgeCut", L.maxDodgeCut, 0);
  if (L.maxDodgeCut >= 1) fail(FILE, "limits.maxDodgeCut must be below 1");
  for (const name of ["refreshMs", "retryMs", "percentScale"]) number(FILE, name, d[name], 1);
  closed(d.api, ["timeoutMs", "authStatuses", "signedOutErrors", "serverErrorFrom", "calls"]);
  number(FILE, "api.timeoutMs", d.api.timeoutMs, 1);
  number(FILE, "api.serverErrorFrom", d.api.serverErrorFrom, 1);
  if (!Array.isArray(d.api.authStatuses) || !d.api.authStatuses.every(Number.isInteger))
    fail(FILE, "api.authStatuses must be integers");
  if (!Array.isArray(d.api.signedOutErrors) || !d.api.signedOutErrors.every((x) => typeof x === "string"))
    fail(FILE, "api.signedOutErrors must be codes");
  closed(d.api.calls, ["get", "buy"]);
  for (const [name, value] of Object.entries(d.api.calls))
    if (!/^[a-z_]+$/.test(value)) fail(FILE, `api.calls.${name} must be a writer route name`);
  if (!Array.isArray(d.upgrades) || !d.upgrades.length) fail(FILE, "upgrades must be a nonempty list");
  const ids = new Set(),
    kinds = new Set();
  for (const row of d.upgrades) {
    closed(row, ["id", "maxLevel", "prices", "effect"]);
    if (typeof row.id !== "string" || !SERVER_ID.test(row.id))
      fail(FILE, `${row.id}: id must be a lowercase server id`);
    if (ids.has(row.id)) fail(FILE, `${row.id}: duplicate id`);
    ids.add(row.id);
    count(FILE, `${row.id}.maxLevel`, row.maxLevel, 1, L.maxLevels);
    if (!Array.isArray(row.prices) || row.prices.length !== row.maxLevel)
      fail(FILE, `${row.id}: prices needs one price per level`);
    row.prices.forEach((price, i) => {
      count(FILE, `${row.id}.prices[${i}]`, price, 1, L.maxPrice);
      if (i && price <= row.prices[i - 1]) fail(FILE, `${row.id}: every level must cost more than the one before`);
    });
    const kind = row.effect?.kind;
    if (!effectFields(kind)) fail(FILE, `${row.id}: effect.kind must be reserveMagazines, maxStamina or dodgeRecovery`);
    if (kinds.has(kind)) fail(FILE, `${row.id}: effect ${kind} is already used`);
    kinds.add(kind);
    closed(row.effect, effectFields(kind));
    if (kind === "dodgeRecovery") {
      number(FILE, `${row.id}.effect.perLevel`, row.effect.perLevel, 0);
      if (row.effect.perLevel <= 0 || row.effect.perLevel * row.maxLevel > L.maxDodgeCut)
        fail(FILE, `${row.id}: dodge recovery may fall by at most limits.maxDodgeCut`);
    } else count(FILE, `${row.id}.effect.perLevel`, row.effect.perLevel, 1, L.maxPerLevel);
    if (kind === "reserveMagazines") {
      closed(row.effect.roundsPerMagazine, ["pistol-reserve", "rifle-reserve"]);
      for (const [resource, rounds] of Object.entries(row.effect.roundsPerMagazine))
        count(FILE, `${row.id}.roundsPerMagazine.${resource}`, rounds, 1, L.maxRounds);
    }
  }
}
