// The shop panel's DOM (styled in style.css, .shop-*): one dialog with a Buy / Sell tab pair, ONE list of rows, a message line and the
// carried strip. It only draws what shop-core's view() says and forwards taps to the controller. All words come from data/shops.json.
import { GAME_DATA, fillText } from "./game-data.js";

const DATA = GAME_DATA.shops;
const TEXT = DATA.text;

export function createShopView({ doc, controller }) {
  const make = (tag, className, text = "") => {
    const node = doc.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };
  const button = (className, text, onTap, label = "") => {
    const node = make("button", className, text);
    node.type = "button";
    if (label) node.setAttribute("aria-label", label);
    node.addEventListener("click", onTap);
    return node;
  };
  const root = make("div", "shop-panel"),
    head = make("header", "shop-head"),
    title = make("h2", "shop-title"),
    cash = make("p", "shop-cash"),
    tabs = make("div", "shop-tabs"),
    body = make("div", "shop-body"),
    note = make("p", "shop-note"),
    strip = make("div", "shop-strip");
  root.id = "shop-panel";
  root.hidden = true;
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-modal", "true");
  note.setAttribute("role", "status");
  strip.setAttribute("aria-label", TEXT.inventoryTitle);
  tabs.setAttribute("role", "tablist");
  const tabButtons = new Map(
    [
      [DATA.buyTabId, TEXT.buyTab],
      [DATA.sellTabId, TEXT.sellTab],
    ].map(([id, text]) => {
      const tab = button("shop-tab", text, () => controller.setTab(id));
      tab.setAttribute("role", "tab");
      return [id, tab];
    }),
  );
  tabs.append(...tabButtons.values());
  const close = button("shop-close", "×", () => controller.close(), TEXT.close);
  const heading = make("div", "shop-heading");
  heading.append(title, cash);
  head.append(heading, close);
  root.append(head, tabs, body, note, strip);

  function row(v, tab) {
    const item = make("div", "shop-row"),
      info = make("div", "shop-info"),
      controls = make("div", "shop-controls"),
      verb = TEXT[tab === DATA.buyTabId ? "confirmBuy" : "confirmSell"],
      confirm = button("shop-confirm", `${verb} ${v.totalText}`, () => controller.confirm(v.itemId));
    info.append(make("strong", "shop-name", v.name), make("span", "shop-price", v.priceText), make("span", "shop-owned", v.ownedText));
    controls.append(
      button("shop-step", "−", () => controller.step(v.itemId, -1), fillText(TEXT.fewer, { name: v.name })),
      make("span", "shop-qty", String(v.qty)),
      button("shop-step", "+", () => controller.step(v.itemId, 1), fillText(TEXT.more, { name: v.name })),
      confirm,
    );
    item.append(info, controls);
    return item;
  }
  function render(v) {
    root.hidden = !v.open;
    if (!v.open) return;
    title.textContent = v.phase === "closed" ? TEXT.closedTitle : v.shop.title;
    cash.textContent = v.cashText;
    cash.hidden = v.phase !== "ready";
    const ready = v.phase === "ready";
    tabs.hidden = !ready;
    strip.hidden = !ready;
    for (const [id, tab] of tabButtons) tab.setAttribute("aria-selected", String(v.tab === id));
    const children = [];
    if (!ready) {
      children.push(make("p", "shop-state", v.stateText));
      if (v.phase === "offline") children.push(button("shop-retry", TEXT.retry, () => controller.retry()));
    } else if (v.rows.length) children.push(...v.rows.map((r) => row(r, v.tab)));
    else children.push(make("p", "shop-state", v.emptyText));
    body.replaceChildren(...children);
    note.textContent = v.message ? v.message.text : v.busy ? TEXT.working : "";
    note.className = `shop-note ${v.message?.kind ?? ""}`;
    strip.replaceChildren(...v.slots.map((text) => make("span", "shop-slot", text)));
  }
  return { root, render, dispose: () => root.remove() };
}
