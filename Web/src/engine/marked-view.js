import { safehouseInteraction } from "./safehouse.js";
import { markedShopEligible, effectiveBounty } from "./marked.js";
import { createHeadLabelPositioner } from "./boss-label.js";
import { WEAPON_VIEWS } from "./weapon-view-data.js";
import { GAME_DATA, fillText } from "./game-data.js";
const TEXT = GAME_DATA.safehouseText.marked;
const money = (n) => "$" + n.toLocaleString("en-US");
// Ephemeral presentation of the existing committed award ledger and total.
// Initial restores, menu transactions and area changes establish a baseline.
export function createMarkedHeadTotalView(s) {
  const host = document.getElementById("boss-labels");
  if (!host) return { update() {}, dispose() {} };
  const label = document.createElement("span"),
    positionHead = createHeadLabelPositioner();
  label.id = "marked-head-total";
  label.className = "boss-world-label marked-head-total";
  label.hidden = true;
  label.setAttribute("aria-hidden", "true");
  host.append(label);
  let owner = null,
    area = null,
    lastCount = 0,
    lastBounty = 0,
    until = 0,
    disposed = false;
  function update() {
    if (disposed) return;
    const g = s.game;
    if (!g) {
      label.hidden = true;
      owner = null;
      until = 0;
      return;
    }
    const id = s.world?.areaId ?? g.world?.areaId,
      bounty = effectiveBounty(g),
      count = g.progression?.awards?.length ?? 0,
      active =
        s.loaded &&
        !s.traveling &&
        !s.contextLost &&
        !s.resetting &&
        !s.paused &&
        g.player.hp > 0 &&
        !g.finished &&
        !g.runSaveInvalid &&
        !!g.marked;
    if (owner !== g || area !== id || !active) {
      owner = g;
      area = id;
      lastCount = count;
      lastBounty = bounty;
      until = 0;
      label.hidden = true;
      return;
    }
    if (count > lastCount && bounty >= lastBounty && bounty > 0) {
      label.textContent = money(bounty);
      until = g.time + WEAPON_VIEWS.marked.headTotalSeconds;
    }
    lastCount = count;
    lastBounty = bounty;
    label.hidden = g.time >= until;
    if (label.hidden) return;
    const position = positionHead(s.actors?.views?.get(g.player.id), label.getBoundingClientRect(), s.camera, {
      width: innerWidth,
      height: innerHeight,
    });
    label.hidden = !position;
    if (position) {
      label.style.left = `${position.left}px`;
      label.style.top = `${position.top}px`;
    }
  }
  return {
    update,
    dispose() {
      disposed = true;
      label.remove();
    },
  };
}
export function createMarkedView(s, dispatch) {
  const host = document.getElementById("marked-bank"),
    hud = document.getElementById("marked-status");
  if (!host || !hud) return { update() {}, dispose() {} };
  const headTotal = createMarkedHeadTotalView(s);
  let built = false,
    summary,
    status,
    bank,
    lastError = "";
  const buttons = new Map(),
    listeners = [];
  const listen = (button, action) => {
    const handler = () => {
      const result = dispatch(s.game, action, allowed());
      lastError = result.ok
        ? ""
        : result.code === "storage-unavailable"
          ? TEXT.saveUnavailable
          : TEXT.purchaseUnavailable;
      update();
      s.updateExpedition?.();
    };
    button.addEventListener("click", handler);
    listeners.push(() => button.removeEventListener("click", handler));
  };
  function allowed() {
    return (
      s.loaded &&
      !s.traveling &&
      !s.contextLost &&
      !s.resetting &&
      s.game?.player.hp > 0 &&
      !s.game.finished &&
      !s.game.runSaveInvalid &&
      safehouseInteraction(s.game)
    );
  }
  function build() {
    built = true;
    const title = document.createElement("h4");
    title.textContent = TEXT.title;
    summary = document.createElement("p");
    summary.id = "marked-bank-summary";
    status = document.createElement("p");
    status.id = "marked-shop-status";
    status.setAttribute("role", "status");
    bank = document.createElement("button");
    bank.id = "marked-deposit";
    bank.type = "button";
    bank.textContent = TEXT.bank;
    listen(bank, { type: "bank" });
    host.append(title, summary, bank);
    const hint = document.createElement("p");
    hint.className = "marked-hint";
    hint.textContent = TEXT.hint;
    host.append(hint);
    for (const [id, name] of Object.entries(TEXT.shopNames)) {
      const button = document.createElement("button");
      button.id = "marked-buy-" + id;
      button.type = "button";
      button.dataset.itemId = id;
      buttons.set(id, { button, name });
      listen(button, { type: "buy", itemId: id });
      host.append(button);
    }
    host.append(status);
  }
  function update() {
    const g = s.game,
      c = s.world?.markedData,
      m = g?.marked;
    host.hidden = !c;
    hud.hidden = !c;
    if (!c) return;
    if (!built) build();
    const current = m ?? { carried: 0, bank: 0, bounty: 0 },
      text = ""; // the money, bounty and hunter lines are not shown on the HUD for now (the state keeps the cash)
    hud.hidden = !text;
    if (hud.textContent !== text) hud.textContent = text;
    hud.dataset.marked = String(c.bounty !== false && effectiveBounty(g) >= c.hunterBounty);
    summary.textContent =
      fillText(TEXT.summary, { carried: money(current.carried), bank: money(current.bank) }) +
      (c.bounty === false ? "" : fillText(TEXT.bountySuffix, { bounty: money(current.bounty) }));
    bank.disabled = !allowed() || !current.carried;
    for (const [id, { button, name }] of buttons) {
      const row = c.shop[id];
      button.textContent = fillText(TEXT.shopButton, {
        name,
        amount: row.amount,
        unit: id === "dressing" ? TEXT.healUnit : TEXT.roundsUnit,
        price: money(row.price),
      });
      button.disabled = !allowed() || !markedShopEligible(g, id);
    }
    status.textContent = lastError || (!allowed() ? TEXT.statusUnavailable : TEXT.statusReady);
  }
  const updateAll = () => {
    headTotal.update();
    update();
  };
  return {
    update: updateAll,
    dispose() {
      headTotal.dispose();
      for (const remove of listeners) remove();
      host.replaceChildren();
      hud.hidden = true;
    },
  };
}
