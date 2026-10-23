// One local unique reward. Actual death/proximity checks and durable IO belong to Web/Core.
const fields = ["version", "status", "dropPosition", "rewardReceipt", "selectedMeleeVariant"];
const id = (value) => typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(value);
function closed(value, keys) {
  return (
    !!value &&
    Object.getPrototypeOf(value) === Object.prototype &&
    Reflect.ownKeys(value).length === keys.length &&
    keys.every((key) => {
      const d = Object.getOwnPropertyDescriptor(value, key);
      return !!d && d.enumerable && "value" in d;
    })
  );
}
const position = (value) => closed(value, ["x", "z"]) && Number.isFinite(value.x) && Number.isFinite(value.z);
export function createUniqueRewardModel({ placementKey, areaId, itemId, baseVariantId, receiptId }) {
  if (![placementKey, areaId, itemId, baseVariantId, receiptId].every(id) || itemId === baseVariantId)
    throw TypeError("Invalid unique reward catalogue");
  const clone = (state) => ({ ...state, dropPosition: state.dropPosition === null ? null : { ...state.dropPosition } });
  const freshState = () => ({
    version: 1,
    status: "eligible",
    dropPosition: null,
    rewardReceipt: null,
    selectedMeleeVariant: baseVariantId,
  });
  function valid(state) {
    try {
      return (
        closed(state, fields) &&
        state.version === 1 &&
        ["eligible", "legacy-dead", "pending", "owned"].includes(state.status) &&
        (state.status === "pending" ? position(state.dropPosition) : state.dropPosition === null) &&
        (state.status === "owned" ? state.rewardReceipt === receiptId : state.rewardReceipt === null) &&
        (state.selectedMeleeVariant === baseVariantId ||
          (state.status === "owned" && state.selectedMeleeVariant === itemId))
      );
    } catch {
      return false;
    }
  }
  function copy(state) {
    if (!valid(state)) throw TypeError("Invalid unique reward state");
    return clone(state);
  }
  function restoreState(raw, options) {
    if (raw !== undefined) return valid(raw) ? clone(raw) : null;
    // Missing legacy data needs explicit death knowledge. Never invent an old kill/drop.
    if (typeof options?.sourceDead !== "boolean") return null;
    return { ...freshState(), status: options.sourceDead ? "legacy-dead" : "eligible" };
  }
  function ownsVariant(state, variantId) {
    return valid(state) && (variantId === baseVariantId || (state.status === "owned" && variantId === itemId));
  }
  function transition(state, action) {
    if (!valid(state) || !action) return null;
    const type = Object.getOwnPropertyDescriptor(action, "type");
    if (
      !type ||
      !("value" in type) ||
      !closed(
        action,
        type.value === "drop"
          ? ["type", "placementKey", "areaId", "position"]
          : type.value === "select"
            ? ["type", "variantId"]
            : ["type"],
      )
    )
      return null;
    const next = clone(state);
    switch (type.value) {
      // Only an actual NEW confirmed death may call this, including a kill after Retry.
      case "drop":
        if (
          !["eligible", "legacy-dead"].includes(state.status) ||
          action.placementKey !== placementKey ||
          action.areaId !== areaId ||
          !position(action.position)
        )
          return null;
        next.status = "pending";
        next.dropPosition = { ...action.position };
        break;
      case "pickup":
        if (state.status !== "pending") return null;
        next.status = "owned";
        next.dropPosition = null;
        next.rewardReceipt = receiptId;
        break;
      case "select":
        if (!ownsVariant(state, action.variantId)) return null;
        next.selectedMeleeVariant = action.variantId;
        break;
      default:
        return null;
    }
    return next;
  }
  return Object.freeze({ freshState, restoreState, valid, copy, transition, ownsVariant });
}
