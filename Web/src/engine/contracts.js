// Public browser-session operation names. This contract is not the lifecycle
// implementation: Web owns moving the existing loop and resource owners behind it.
export const SESSION_OPERATIONS = Object.freeze([
  "start",
  "input",
  "step",
  "prepareArea",
  "activateArea",
  "state",
  "events",
  "pause",
  "retry",
  "dispose",
]);
export const SIMULATION_STEP_SECONDS = 1 / 60;
export function assertSession(session) {
  if (!session || typeof session !== "object") throw new TypeError("Session required");
  const missing = SESSION_OPERATIONS.filter((name) => typeof session[name] !== "function");
  if (missing.length) throw new TypeError(`Session operations missing: ${missing.join(", ")}`);
  return session;
}
