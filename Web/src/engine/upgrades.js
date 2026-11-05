// Permanent safehouse upgrades, wired into the session (data/safehouseUpgrades.json): the panel inside the safehouse Storage page, the levels the
// server reports, and the one per-frame hook that keeps the stamina upgrade on the player. Created next to the hub shops in browser-session.js and
// updated every frame from engine/loop.js. The panel shows only while the player stands at the safehouse (the same place the Storage works);
// with no server or a guest account it shows the locked text instead of rows. The effects themselves live in engine/upgrades-state.js.
import { upgradesOn, createUpgradesController } from "./upgrades-core.js";
import { createUpgradesView } from "./upgrades-view.js";
import { safehouseInteraction } from "./safehouse.js";
import { applyStaminaUpgrade } from "./upgrades-state.js";

// api: () => adapter | null; isGuest: () => bool; localCash: () => number | null; onCash(delta); storage: localStorage or null.
export function createUpgrades({
  doc = globalThis.document,
  host = doc?.getElementById("upgrades-panel"),
  api,
  isGuest,
  localCash,
  onCash,
  storage,
  search,
  enabled,
  now,
}) {
  const on = upgradesOn(search, enabled),
    controller = createUpgradesController({
      api,
      isGuest,
      localCash,
      onCash,
      storage,
      now,
      enabled: on,
      onChange: (v) => view.render(v),
    }),
    view = createUpgradesView({ doc, host, controller });
  if (host) host.hidden = true;
  if (on) view.render(controller.view());
  return {
    controller,
    // Every frame, after the world has moved: s is the loop's context (game, loaded, paused ...).
    update(s) {
      const g = s.game;
      if (g?.player) applyStaminaUpgrade(g.player); // cheap: a no-op while the bonus is unchanged
      if (!on || !g || !s.loaded) {
        if (host) host.hidden = true;
        return;
      }
      const here = safehouseInteraction(g);
      if (host) host.hidden = !here;
      // Ask when the answer is old: at the safehouse always, elsewhere only when a signed-in player has a server to ask.
      if (controller.due() && (here || (api() && !isGuest()))) controller.refresh();
    },
    dispose: () => view.dispose(),
  };
}
