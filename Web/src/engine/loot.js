import { GAME_DATA, fillText } from "./game-data.js";
// Rare drops, client side (data/loot.json). The server rolls loot and sends it back with the kill credit; nothing here rolls or asserts it.
// This file holds the rules: whether the feature is on, the owned-items store (what the inventory strip shows), and what a drop does to the
// run (a toast on the notice line, a glint where the body fell, the first-drop hint flag). Drawing is engine/loot-glint-view.js and
// engine/inventory-view.js. Each function takes the rules last so a test can pass its own copy.
export const LOOT = GAME_DATA.loot;
// On by default; `?noloot=1` (the switch named in the data) turns it off for this page load.
export function lootOn(search, rules) {
  const data = rules !== undefined ? rules : LOOT,
    query = typeof search === "string" ? search : "";
  return data.enabled === true && new URLSearchParams(query).get(data.offSwitch) !== "1";
}

const titleOf = (itemId) => itemId.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function createLootStore({ api, rules }) {
  const data = rules !== undefined ? rules : LOOT,
    listeners = new Set();
  let items = [],
    defs = new Map(),
    status = "idle"; // idle: not asked yet; ok: the server answered; offline: no answer (guest, closed world, no network)
  const emit = () => {
    for (const fn of listeners) fn();
  };
  // How one item looks: the server's row over the local fallback look, over a plain default for an id nobody has described.
  function describe(itemId) {
    const local = data.items[itemId] ?? {},
      remote = defs.get(itemId) ?? {},
      rarity = remote.rarity ?? local.rarity ?? data.defaultRarity,
      name = remote.name ?? local.name ?? titleOf(itemId);
    return {
      id: itemId,
      name,
      badge: local.badge ?? name.slice(0, data.badgeChars).toUpperCase(),
      colour: local.colour ?? data.rarities[rarity],
      rarity,
      rarityColour: data.rarities[rarity],
      kind: remote.kind ?? local.kind ?? data.defaultKind,
      flavour: local.flavour ?? "",
      sellPrice: remote.sellPrice ?? null,
    };
  }
  function add(loot) {
    for (const row of loot) {
      const have = items.find((r) => r.item_id === row.item_id);
      if (have) have.qty += row.qty;
      else items.push({ ...row });
    }
    emit();
  }
  const store = {
    get items() {
      return items;
    },
    get status() {
      return status;
    },
    describe,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    // Ask the server for the account's items and its item table. Never throws; an unanswered ask leaves the strip empty with its note.
    async refresh() {
      if (!api) {
        status = "offline";
        emit();
        return status;
      }
      try {
        const got = await api.get();
        status = got.ok ? "ok" : "offline";
        items = got.ok ? got.items : [];
        if (got.ok) defs = await api.itemDefs();
      } catch {
        status = "offline";
        items = [];
      }
      emit();
      return status;
    },
    // A kill credit paid `loot` (already checked by inventory-api.lootFromReply). `at` is {x, z} where the body fell, if known.
    receive(g, loot, at) {
      if (!loot.length) return false;
      const state = (g.loot ??= { glints: [], dropped: false }),
        where = at ?? g.player.pos;
      state.dropped = true;
      for (const row of loot) {
        const line = fillText(data.text.toast, { name: describe(row.item_id).name, qty: row.qty });
        g.message = g.message && g.messageUntil > g.time && state.toastUntil > g.time ? `${g.message}, ${line}` : line;
        state.toastUntil = g.messageUntil = g.time + data.toastSeconds;
      }
      state.glints.push({ x: where.x, z: where.z, from: g.time, until: g.time + data.glint.seconds });
      // The server answered, so it holds these: add them here when the list is known, otherwise learn the whole list.
      if (status === "ok") add(loot);
      else store.refresh();
      return true;
    },
  };
  return store;
}
