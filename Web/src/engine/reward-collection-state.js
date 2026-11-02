// Fixed component DTO collection only; actual models retain their own rules.
import { closed } from "./shared-checks.js";
export function createRewardCollectionModel(models) {
  if (!models || Object.getPrototypeOf(models) !== Object.prototype)
    throw TypeError("Fixed own-key model map required");
  const keys = Reflect.ownKeys(models);
  if (
    !keys.length ||
    keys.some((key) => typeof key !== "string" || !key || ["__proto__", "constructor", "prototype"].includes(key)) ||
    !closed(models, keys)
  )
    throw TypeError("Invalid model keys");
  const entries = Object.fromEntries(keys.map((key) => [key, models[key]]));
  if (
    keys.some((key) =>
      ["freshState", "valid", "copy", "transition"].some((method) => typeof entries[key]?.[method] !== "function"),
    )
  )
    throw TypeError("Component model contract required");
  function valid(state) {
    try {
      return (
        closed(state, keys) &&
        keys.every((key) => entries[key].valid(state[key]) === true) &&
        keys.filter((key) => state[key]?.selected === true).length <= 1
      );
    } catch {
      return false;
    }
  }
  function copy(state) {
    if (!valid(state)) throw TypeError("Invalid reward collection");
    const next = Object.fromEntries(keys.map((key) => [key, entries[key].copy(state[key])]));
    if (!valid(next)) throw TypeError("Invalid component copy");
    return next;
  }
  function freshState() {
    const state = Object.fromEntries(keys.map((key) => [key, entries[key].freshState()]));
    return copy(state);
  }
  function transition(state, field, action) {
    if (
      !valid(state) ||
      typeof field !== "string" ||
      !Object.hasOwn(entries, field) ||
      !action ||
      Object.getPrototypeOf(action) !== Object.prototype
    )
      return null;
    const descriptors = Object.getOwnPropertyDescriptors(action);
    if (
      Reflect.ownKeys(descriptors).some(
        (key) => typeof key !== "string" || !descriptors[key].enumerable || !("value" in descriptors[key]),
      ) ||
      typeof descriptors.type?.value !== "string"
    )
      return null;
    try {
      const next = copy(state),
        proposed = entries[field].transition(next[field], structuredClone(action));
      if (!proposed || entries[field].valid(proposed) !== true) return null;
      next[field] = entries[field].copy(proposed);
      if (action.type === "select" && action.selected === true) {
        for (const key of keys)
          if (key !== field && next[key]?.selected === true) {
            const cleared = entries[key].transition(next[key], { type: "select", selected: false });
            if (!cleared || entries[key].valid(cleared) !== true || cleared.selected === true) return null;
            next[key] = entries[key].copy(cleared);
          }
      }
      return valid(next) ? next : null;
    } catch {
      return null;
    }
  }
  return Object.freeze({ freshState, valid, copy, transition });
}
