// The upgrades panel's DOM (styled in style.css, .upgrades-*): a section inside the safehouse Storage page (#upgrades-panel in index.html) with a
// heading, the cash line, one card per upgrade and a status line. It only draws what upgrades-core's view() says and forwards taps to the
// controller. Phone first: one column of full-width cards with 44px buttons; wider or landscape screens lay the cards out in a grid (CSS).
import { webText } from "./web-text.js";

export function createUpgradesView({ doc, host, controller }) {
  if (!host) return { render() {}, dispose() {} };
  const make = (tag, className, text = "") => {
    const node = doc.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };
  const head = make("div", "upgrades-head"),
    cash = make("p", "upgrades-cash"),
    list = make("div", "upgrades-list"),
    note = make("p", "upgrades-note");
  head.append(make("h4", "upgrades-title", webText("upgrades.title")), cash);
  note.setAttribute("role", "status");
  host.replaceChildren(head, make("p", "upgrades-intro", webText("upgrades.intro")), list, note);

  function card(v) {
    const item = make("article", "upgrades-card"),
      buy = make("button", "upgrades-buy", v.buttonText);
    buy.type = "button";
    buy.disabled = !v.canBuy;
    buy.addEventListener("click", () => controller.buy(v.id));
    item.append(
      make("h5", "upgrades-name", v.name),
      make("p", "upgrades-desc", v.desc),
      make("p", "upgrades-level", v.levelText),
      make("p", "upgrades-now", v.nowText),
      make("p", "upgrades-next", v.nextText),
      buy,
    );
    return item;
  }
  function render(v) {
    cash.hidden = v.phase !== "ready";
    cash.textContent = v.cashText;
    const children = [];
    if (v.phase === "ready") children.push(...v.rows.map(card));
    else {
      children.push(make("p", "upgrades-state", v.stateText));
      if (v.phase === "offline") {
        const retry = make("button", "upgrades-retry", webText("upgrades.retry"));
        retry.type = "button";
        retry.addEventListener("click", () => controller.retry());
        children.push(retry);
      }
    }
    list.replaceChildren(...children);
    note.textContent = v.message ? v.message.text : v.busy ? webText("upgrades.working") : "";
    note.className = `upgrades-note ${v.message?.kind ?? ""}`;
  }
  return { render, dispose: () => host.replaceChildren() };
}
