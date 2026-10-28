import { LOOT } from "./loot.js";
import { fillText } from "./game-data.js";
// The inventory strip on the field menu's Items tab (index.html #menu-items): the first `slots` item kinds the account owns, each a coloured
// badge with its quantity; tap one for its card (name, kind and rarity, flavour line, sell value when the server's table has one). No grid or
// bag in v1. All words come from data/loot.json; item look and names come from the store (server table over the local fallback).
// An unanswered server (guest, closed world, offline) shows the empty strip with its friendly note and never throws.
export function createInventoryView({ store, doc, rules }) {
  const data = rules !== undefined ? rules : LOOT,
    $ = (id) => doc.getElementById(id),
    root = $("menu-items");
  if (!root) return { render() {}, dispose() {} };
  const strip = $("items-strip"),
    card = $("items-card"),
    status = $("items-status"),
    more = $("items-more");
  let openId = null;
  const text = (id, value) => {
    const node = $(id);
    if (node) node.textContent = value;
  };
  text("menu-tab-items", data.text.tab);
  text("items-title", data.text.title);
  text("items-intro", data.text.intro);
  const make = (tag, className, content) => {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (content !== undefined) node.textContent = content;
    return node;
  };
  function badge(info) {
    const node = make("span", "item-badge", info.badge);
    node.style.setProperty("--badge", `#${info.colour}`);
    node.style.setProperty("--rarity", `#${info.rarityColour}`);
    return node;
  }
  function renderCard() {
    card.replaceChildren();
    const row = store.items.find((r) => r.item_id === openId);
    card.hidden = !row;
    if (!row) return;
    const info = store.describe(row.item_id),
      sell = info.sellPrice === null ? data.text.sellUnknown : fillText(data.text.sellValue, { value: info.sellPrice }),
      close = make("button", "item-close", data.text.cardClose);
    close.type = "button";
    close.onclick = () => {
      openId = null;
      renderCard();
    };
    card.append(
      badge(info),
      make("h4", "", `${info.name} ${fillText(data.text.qty, { qty: row.qty })}`),
      make("p", "eyebrow", fillText(data.text.kindRarity, { kind: info.kind, rarity: info.rarity })),
      make("p", "", info.flavour),
      make("p", "item-sell", sell),
      close,
    );
  }
  function render() {
    strip.replaceChildren();
    for (let slot = 0; slot < data.slots; slot++) {
      const row = store.items[slot],
        button = make("button", row ? "item-slot" : "item-slot empty");
      button.type = "button";
      button.setAttribute("role", "listitem");
      if (row) {
        const info = store.describe(row.item_id);
        button.append(badge(info), make("span", "item-qty", fillText(data.text.qty, { qty: row.qty })), make("span", "item-name", info.name));
        button.setAttribute("aria-label", fillText(data.text.slotAria, { name: info.name, qty: row.qty }));
        button.onclick = () => {
          openId = openId === row.item_id ? null : row.item_id;
          renderCard();
        };
      } else {
        button.disabled = true;
        button.setAttribute("aria-label", data.text.emptySlot);
      }
      strip.append(button);
    }
    const extra = store.items.length - data.slots;
    more.textContent = extra > 0 ? fillText(data.text.more, { count: extra }) : "";
    status.textContent = store.status === "offline" ? data.text.offline : store.status === "ok" && !store.items.length ? data.text.empty : "";
    renderCard();
  }
  const stop = store.subscribe(render),
    tab = $("menu-tab-items"),
    refresh = () => {
      store.refresh();
    };
  if (tab) tab.addEventListener("click", refresh);
  render();
  return {
    render,
    dispose() {
      stop();
      if (tab) tab.removeEventListener("click", refresh);
    },
  };
}
