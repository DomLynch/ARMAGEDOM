const closed = (value, keys) =>
  !!value &&
  Object.getPrototypeOf(value) === Object.prototype &&
  Reflect.ownKeys(value).length === keys.length &&
  keys.every((key) => {
    const d = Object.getOwnPropertyDescriptor(value, key);
    return d?.enumerable && "value" in d;
  });
const id = (value) =>
  typeof value === "string" &&
  /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,159}$/.test(value) &&
  !["__proto__", "constructor", "prototype"].includes(value);
const point = (value) => closed(value, ["x", "z"]) && Number.isFinite(value.x) && Number.isFinite(value.z);
const fields = ["version", "status", "dropPosition", "rewardReceipt", "selected"];
export function createUnlockRewardModel(config) {
  if (
    !closed(config, ["itemId", "source"]) ||
    !id(config.itemId) ||
    !closed(config.source, ["placementKey", "areaId", "receiptId"])
  )
    throw TypeError("Exact unlock reward source required");
  const { itemId } = config,
    { placementKey, areaId, receiptId } = config.source;
  if (![placementKey, areaId, receiptId].every(id) || receiptId !== placementKey + ":" + itemId)
    throw TypeError("Stable source:item receipt required");
  const clone = (state) => ({ ...state, dropPosition: state.dropPosition === null ? null : { ...state.dropPosition } });
  const freshState = () => ({
    version: 1,
    status: "eligible",
    dropPosition: null,
    rewardReceipt: null,
    selected: false,
  });
  function valid(state) {
    try {
      return (
        closed(state, fields) &&
        state.version === 1 &&
        ["eligible", "legacy-dead", "pending", "owned"].includes(state.status) &&
        typeof state.selected === "boolean" &&
        (state.status === "pending" ? point(state.dropPosition) : state.dropPosition === null) &&
        (state.status === "owned" ? state.rewardReceipt === receiptId : state.rewardReceipt === null && !state.selected)
      );
    } catch {
      return false;
    }
  }
  function copy(state) {
    if (!valid(state)) throw TypeError("Invalid unlock reward state");
    return clone(state);
  }
  function restoreState(raw, options) {
    if (raw !== undefined) return valid(raw) ? clone(raw) : null;
    if (!closed(options, ["sourceDead"]) || typeof options.sourceDead !== "boolean") return null;
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
        Object.assign(next, { status: "owned", dropPosition: null, rewardReceipt: receiptId, selected: false });
        break;
      case "select":
        if (typeof action.selected !== "boolean" || (action.selected && state.status !== "owned")) return null;
        next.selected = action.selected;
        break;
      default:
        return null;
    }
    return next;
  }
  return Object.freeze({ freshState, valid, copy, restoreState, transition });
}
