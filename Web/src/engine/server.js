// Renderer-free simulation entry. The world supplies domain movement/area IO.
import { createGame, stepGame } from "../combat.js";
import { travelTo } from "../travel.js";
import { GAME_DATA } from "./game-data.js";
import { SIMULATION_STEP_SECONDS, assertSession } from "./contracts.js";
import { readonlyState, eventSnapshot } from "./state.js";
export function createSession({ world, pilot } = {}) {
  if (!world) throw new TypeError("Domain world required");
  let game = null,
    paused = false,
    disposed = false,
    accumulator = 0,
    pending = {};
  const listeners = new Set();
  const live = () => {
    if (disposed) throw Error("Session disposed");
    if (!game) throw Error("Session not started");
  };
  const session = {
    start() {
      if (disposed) throw Error("Session disposed");
      game ??= createGame(world, pilot);
      return session.state();
    },
    input(value) {
      live();
      pending = { ...value };
    },
    step(seconds) {
      live();
      if (!Number.isFinite(seconds) || seconds < 0) throw new TypeError("Finite nonnegative step required");
      if (paused || game.finished) return;
      accumulator += Math.min(GAME_DATA.browserSession.maxStepSeconds, seconds);
      while (accumulator >= SIMULATION_STEP_SECONDS) {
        stepGame(game, pending, SIMULATION_STEP_SECONDS);
        pending = { ...pending, actions: [], guardPressed: false, dodge: false };
        accumulator -= SIMULATION_STEP_SECONDS;
        for (const event of game.events) {
          const value = eventSnapshot(event);
          for (const fn of [...listeners]) fn(value);
        }
        if (game.finished) break;
      }
    },
    async prepareArea(id) {
      live();
      if (!world.prepareArea) throw Error("Domain area preparation unavailable");
      await world.prepareArea(id);
    },
    async activateArea(request) {
      live();
      const owner = game,
        position = await travelTo(owner, request, { isCurrent: () => !disposed && game === owner });
      if (!position) return false;
      accumulator = 0;
      pending = {};
      return true;
    },
    state() {
      return readonlyState(game, { areaId: world.areaId, loaded: !!game, paused, disposed });
    },
    events(fn) {
      if (disposed) throw Error("Session disposed");
      if (typeof fn !== "function") throw new TypeError("Event listener required");
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    pause(value) {
      live();
      paused = !!value;
      accumulator = 0;
      pending = {};
    },
    retry() {
      live();
      game = createGame(world, pilot);
      accumulator = 0;
      pending = {};
      return session.state();
    },
    dispose() {
      disposed = true;
      paused = true;
      accumulator = 0;
      pending = {};
      listeners.clear();
    },
  };
  return Object.freeze(assertSession(session));
}

export {
  VEST_BAG_POSITION,
  PISTOL_SAVE_KEY,
  RUN_SAVE_KEY,
  encodePistol,
  restorePistol,
  encodeRun,
  restoreRun,
  applySavedRun,
  commitFreshRun,
  collectNearbySupplies,
  collectNearbyVest,
} from "./run-state.js";
