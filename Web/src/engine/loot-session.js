import { createInventoryApi, lootFromReply } from "./inventory-api.js";
import { createInventoryView } from "./inventory-view.js";
import { createLootStore, lootOn } from "./loot.js";
// Wires rare drops into one page session (browser-session.js): the store, the inventory strip and the kill-credit hook. `request` is the save
// client's transport (a lazy function, because the client only exists once the online world starts); `getGame` answers the live run.
// Off (`?noloot=1`, or loot.json enabled false): the Items tab is hidden, no request is made and a reply's loot is ignored.
export function createLootSession({ search, doc, request, getGame, rules }) {
  const tab = doc.getElementById("menu-tab-items");
  if (!lootOn(search, rules)) {
    if (tab) tab.hidden = true;
    return { on: false, store: null, onLoot() {}, refresh() {}, dispose() {} };
  }
  const api = createInventoryApi({ send: (op, body) => request(op, body), rules }),
    store = createLootStore({ api, rules }),
    view = createInventoryView({ store, doc, rules });
  return {
    on: true,
    store,
    // The save client's onLoot: a kill credit paid `rows` at `at`.
    onLoot(rows, at) {
      const game = getGame();
      if (game) store.receive(game, lootFromReply({ loot: rows }), at);
    },
    refresh() {
      return store.refresh();
    },
    dispose() {
      view.dispose();
    },
  };
}
