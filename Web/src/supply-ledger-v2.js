// Bounded reward decisions only; callers own actual death and Core persistence.
const point = (p) => p && Number.isFinite(p.x) && Number.isFinite(p.z);
const object = (x) => x && Object.getPrototypeOf(x) === Object.prototype;
const closed = (x, fields) =>
  object(x) && Object.keys(x).length === fields.length && fields.every((k) => Object.hasOwn(x, k));
const lootTableStamp = (rule) =>
  JSON.stringify(rule.outcomes.map((o) => [o.itemId, o.quantity, o.weight, o.conditions]));
export function isExtendedSupplies(s, rules) {
  if (!rules || !closed(s, ["version", "issued", "collected", "pending", "rolls"]) || s.version !== 2) return false;
  for (const field of ["issued", "collected", "pending", "rolls"])
    if (!Array.isArray(s[field]) || s[field].length > 32) return false;
  if (
    new Set(s.issued).size !== s.issued.length ||
    new Set(s.collected).size !== s.collected.length ||
    s.rolls.length !== s.issued.length
  )
    return false;
  const rolls = new Map();
  for (const r of s.rolls) {
    if (
      !closed(r, ["placementKey", "tableRef", "tableStamp", "outcomeIndex"]) ||
      !s.issued.includes(r.placementKey) ||
      rolls.has(r.placementKey) ||
      !Object.hasOwn(rules, r.placementKey) ||
      !Number.isInteger(r.outcomeIndex) ||
      r.outcomeIndex < 0
    )
      return false;
    const rule = rules[r.placementKey],
      outcome = rule.outcomes[r.outcomeIndex];
    if (!outcome || r.tableRef !== rule.tableRef || r.tableStamp !== lootTableStamp(rule)) return false;
    rolls.set(r.placementKey, r);
  }
  const seen = new Set();
  for (const id of s.collected) {
    const roll = s.rolls.find((r) => rules[r.placementKey].dropId === id);
    if (!roll || !rules[roll.placementKey].outcomes[roll.outcomeIndex].itemId || seen.has(id)) return false;
    seen.add(id);
  }
  for (const d of s.pending) {
    if (
      !closed(d, ["id", "areaId", "placementKey", "kind", "position", "remaining"]) ||
      !rolls.has(d.placementKey) ||
      !point(d.position) ||
      !closed(d.position, ["x", "z"]) ||
      !Number.isInteger(d.remaining)
    )
      return false;
    const r = rolls.get(d.placementKey),
      rule = rules[d.placementKey],
      o = rule.outcomes[r.outcomeIndex];
    if (
      !o.itemId ||
      d.kind !== o.itemId ||
      d.areaId !== rule.areaId ||
      d.id !== rule.dropId ||
      d.remaining < 1 ||
      d.remaining > o.quantity ||
      seen.has(d.id)
    )
      return false;
    seen.add(d.id);
  }
  return s.rolls.every(
    (r) => !rules[r.placementKey].outcomes[r.outcomeIndex].itemId || seen.has(rules[r.placementKey].dropId),
  );
}
export function upgradeSupplies(s, rules) {
  const rolls = s.issued.map((key) => {
    const rule = rules[key],
      o = rule?.outcomes[0];
    if (!rule?.legacy || rule.outcomes.length !== 1 || !o) return null;
    return { placementKey: key, tableRef: rule.tableRef, tableStamp: lootTableStamp(rule), outcomeIndex: 0 };
  });
  if (rolls.some((r) => !r)) return null;
  const next = {
    version: 2,
    issued: [...s.issued],
    collected: [...s.collected],
    pending: s.pending.map((d) => ({ ...d, position: { ...d.position } })),
    rolls,
  };
  return isExtendedSupplies(next, rules) ? next : null;
}
export function issueExtendedSupply(state, { areaId, placementKey, position, hp, rules, cycle = "A" } = {}) {
  if (
    !isExtendedSupplies(state, rules) ||
    !Object.hasOwn(rules, placementKey) ||
    rules[placementKey].areaId !== areaId ||
    !point(position) ||
    !Number.isFinite(hp) ||
    hp > 0 ||
    state.issued.includes(placementKey) ||
    state.issued.length >= 32
  )
    return { state, drop: null };
  const rule = rules[placementKey];
  let seed = 2166136261; // tuning-ok: FNV-1a offset basis (a hash constant, not tuning)
  for (const char of placementKey + ":" + rule.tableRef + ":" + cycle)
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0; // tuning-ok: FNV-1a prime (a hash constant, not tuning)
  const sum = rule.outcomes.reduce((n, o) => n + o.weight, 0);
  let value = (seed / 4294967296) * sum, // tuning-ok: 2^32, the 32-bit hash range
    index = rule.outcomes.length - 1;
  for (let i = 0; i < rule.outcomes.length; i++) {
    value -= rule.outcomes[i].weight;
    if (value < 0) {
      index = i;
      break;
    }
  }
  const o = rule.outcomes[index],
    roll = { placementKey, tableRef: rule.tableRef, tableStamp: lootTableStamp(rule), outcomeIndex: index },
    drop = o.itemId
      ? {
          id: rule.dropId,
          areaId,
          placementKey,
          kind: o.itemId,
          position: { x: position.x, z: position.z },
          remaining: o.quantity,
        }
      : null;
  return {
    state: {
      ...state,
      issued: [...state.issued, placementKey],
      rolls: [...state.rolls, roll],
      pending: drop ? [...state.pending, drop] : state.pending,
    },
    drop,
  };
}
