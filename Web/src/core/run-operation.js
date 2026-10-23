// Domain commands only. Core supplies validated IO; Web owns session/view choreography.
export function createRunOperation({ getRun, setRun, createFreshRun, applySavedRun, claimPickup, equip }) {
  if ([getRun, setRun, createFreshRun, applySavedRun, claimPickup].some((fn) => typeof fn !== "function"))
    throw TypeError("Missing run domain dependency");
  if (equip !== undefined && typeof equip !== "function") throw TypeError("Invalid equip domain dependency");
  const deny = (code) => ({ ok: false, code, events: [] });
  const success = (changed) => ({ ok: true, changed, events: [] });
  return (command, context) => {
    if (command?.type === "claimPickup") return claimPickup(command, context);
    if (command?.type === "equip") return equip ? equip(command, context) : deny("invalid-command");
    const g = getRun();
    if (!g) return deny("not-eligible");
    switch (command?.type) {
      case "save":
        if (g.runSaveInvalid) return deny("invalid-save");
        return context.writeRun(g) ? success(false) : deny("storage-unavailable");
      case "restore": {
        const saved = context.readRun();
        if (!saved) return deny("invalid-save");
        applySavedRun(g, saved);
        return success(true);
      }
      case "reset":
      case "retry": {
        const candidate = createFreshRun({ reset: command.type === "reset" });
        if (!candidate || candidate === g) return deny("not-eligible");
        if (!context.writeRun(candidate)) return deny("storage-unavailable");
        setRun(candidate);
        return success(true);
      }
      default:
        return deny("invalid-command");
    }
  };
}
