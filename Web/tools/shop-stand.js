// Dev stand (never shipped): the real shop panel (engine/shop-view.js + shop-core.js + the game's style.css) over a hub-coloured backdrop,
// backed by the test mock of the market adapter. window.stand.show("buy" | "sell" | "error" | "closed" | "offline") sets up that state.
import "../src/style.css";
import { createShopController } from "../src/engine/shop-core.js";
import { createShopView } from "../src/engine/shop-view.js";
import { createMockMarket } from "../tests/market-mock.js";

const wait = () => new Promise((resolve) => setTimeout(resolve, 30));
let current = null;

async function show(name) {
  current?.view.root.remove();
  const market = createMockMarket({ cash: 140, items: { scrap: 3, tape: 5, "medkit-pack": 1 }, errors: name === "offline" ? { stock: "offline" } : {} });
  const view = {};
  const controller = createShopController({
    api: () => market,
    isGuest: () => name === "closed",
    localCash: () => 140,
    onChange: (v) => view.value.render(v),
  });
  view.value = createShopView({ doc: document, controller });
  document.body.append(view.value.root);
  current = { view: view.value };
  controller.open("scrapper");
  await wait();
  if (name === "sell") controller.setTab("sell");
  if (name === "error") {
    controller.step("scrap", 40);
    await controller.confirm("scrap");
  }
  if (name === "sell") {
    controller.step("scrap", 1);
    await controller.confirm("scrap");
  }
  await wait();
}
window.stand = { ready: true, show };
