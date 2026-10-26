import { RIFLE_PROFILE, validateRangedWeaponCatalog } from "./weapon-catalog.js";
const fields = ["version", "status", "dropPosition", "rewardReceipt", "magazine", "reserve", "selected"];
const closed = (value, names) =>
  !!value &&
  Object.getPrototypeOf(value) === Object.prototype &&
  Reflect.ownKeys(value).length === names.length &&
  names.every((name) => {
    const d = Object.getOwnPropertyDescriptor(value, name);
    return d && d.enumerable && "value" in d;
  });
const point = (p) => closed(p, ["x", "z"]) && Object.values(p).every((n) => Number.isFinite(n) && Math.abs(n) <= 10000); // tuning-ok: a validation bound on a position field (metres), not a value
export function createRifleModel(profile = RIFLE_PROFILE) {
  const data = validateRangedWeaponCatalog({ [profile.itemId]: profile })[profile.itemId];
  if (data.family !== "rifles" || !data.source) throw TypeError("Rifle reward source required");
  return createAmmoRewardModel(data);
}
export function createAmmoRewardModel(profile) {
  const data = validateRangedWeaponCatalog({ [profile.itemId]: profile })[profile.itemId];
  if (!data.source) throw TypeError("Boss reward source required");
  const { placementKey, areaId, receiptId } = data.source,
    { capacity, reserve: initialReserve } = data.rules;
  const clone = (s) => ({ ...s, dropPosition: s.dropPosition === null ? null : { ...s.dropPosition } });
  const freshState = () => ({
    version: 1,
    status: "eligible",
    dropPosition: null,
    rewardReceipt: null,
    magazine: 0,
    reserve: 0,
    selected: false,
  });
  function valid(s) {
    try {
      return (
        closed(s, fields) &&
        s.version === 1 &&
        ["eligible", "legacy-dead", "pending", "owned"].includes(s.status) &&
        typeof s.selected === "boolean" &&
        Number.isSafeInteger(s.magazine) &&
        s.magazine >= 0 &&
        s.magazine <= capacity &&
        Number.isSafeInteger(s.reserve) &&
        s.reserve >= 0 &&
        s.reserve <= initialReserve &&
        (s.status === "pending" ? point(s.dropPosition) : s.dropPosition === null) &&
        (s.status === "owned"
          ? s.rewardReceipt === receiptId
          : s.rewardReceipt === null && !s.selected && s.magazine === 0 && s.reserve === 0)
      );
    } catch {
      return false;
    }
  }
  function copy(s) {
    if (!valid(s)) throw TypeError("Invalid rifle state");
    return clone(s);
  }
  function restoreState(raw, options) {
    if (raw !== undefined) return valid(raw) ? clone(raw) : null;
    if (typeof options?.sourceDead !== "boolean") return null;
    return { ...freshState(), status: options.sourceDead ? "legacy-dead" : "eligible" };
  }
  function transition(state, action) {
    if (!valid(state) || !action) return null;
    const type = Object.getOwnPropertyDescriptor(action, "type");
    if (!type || !("value" in type)) return null;
    const names =
      type.value === "drop"
        ? ["type", "placementKey", "areaId", "position"]
        : type.value === "select"
          ? ["type", "selected"]
          : ["type"];
    if (!closed(action, names)) return null;
    const next = clone(state);
    switch (type.value) {
      case "drop":
        if (
          !["eligible", "legacy-dead"].includes(state.status) ||
          action.placementKey !== placementKey ||
          action.areaId !== areaId ||
          !point(action.position)
        )
          return null;
        next.status = "pending";
        next.dropPosition = { ...action.position };
        break;
      case "pickup":
        if (state.status !== "pending") return null;
        Object.assign(next, {
          status: "owned",
          dropPosition: null,
          rewardReceipt: receiptId,
          magazine: capacity,
          reserve: initialReserve,
          selected: false,
        });
        break;
      case "select":
        if (typeof action.selected !== "boolean" || (action.selected && state.status !== "owned")) return null;
        next.selected = action.selected;
        break;
      case "fire":
        if (state.status !== "owned" || !state.selected || state.magazine === 0) return null;
        next.magazine--;
        break;
      case "reload": {
        if (state.status !== "owned" || !state.selected || state.magazine === capacity || state.reserve === 0)
          return null;
        const rounds = Math.min(capacity - state.magazine, state.reserve);
        next.magazine += rounds;
        next.reserve -= rounds;
        break;
      }
      default:
        return null;
    }
    return next;
  }
  return Object.freeze({ freshState, valid, copy, restoreState, transition });
}
