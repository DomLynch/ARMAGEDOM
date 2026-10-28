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
  const wallet = { cash: 140 },
    market = createMockMarket({
      cash: 140,
      items: { "ammo-pack": 3, "hunter-cpu": 3, "roach-mandibles": 5, "medkit-pack": 1 },
      errors: name === "offline" ? { stock: "offline" } : {},
    });
  const view = {};
  const controller = createShopController({
    api: () => market,
    isGuest: () => name === "closed",
    localCash: () => wallet.cash,
    onCash: (delta) => (wallet.cash += delta),
    onChange: (v) => view.value.render(v),
  });
  view.value = createShopView({ doc: document, controller });
  document.body.append(view.value.root);
  current = { view: view.value };
  controller.open("scrapper");
  await wait();
  if (name === "sell") controller.setTab("sell");
  if (name === "error") {
    controller.step("ammo-pack", 2);
    await controller.confirm("ammo-pack");
  }
  if (name === "sell") {
    controller.step("hunter-cpu", 1);
    await controller.confirm("hunter-cpu");
  }
  await wait();
}
window.stand = { ready: true, show };
