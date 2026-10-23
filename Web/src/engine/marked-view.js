import { safehouseInteraction } from "./safehouse.js";
import { markedShopEligible } from "./marked.js";
import { createHeadLabelPositioner } from "./boss-label.js";
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
      bounty = g.marked?.bounty ?? 0,
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
      until = g.time + 2.5;
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
          ? "Saving unavailable. Cash and supplies were kept."
          : "This purchase is unavailable. Bank cash and check supply capacity.";
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
    title.textContent = "Cash & supplies";
    summary = document.createElement("p");
    summary.id = "marked-bank-summary";
    status = document.createElement("p");
    status.id = "marked-shop-status";
    status.setAttribute("role", "status");
    bank = document.createElement("button");
    bank.id = "marked-deposit";
    bank.type = "button";
    bank.textContent = "Bank carried cash";
    listen(bank, { type: "bank" });
    host.append(title, summary, bank);
    const hint = document.createElement("p");
    hint.className = "marked-hint";
    hint.textContent =
      "Banking does not clear your bounty. Death loses carried cash and clears the hunt; banked cash and earned gear stay.";
    host.append(hint);
    for (const [id, name] of Object.entries({ pistol: "Pistol reserve", rifle: "Rifle reserve", dressing: "Heal" })) {
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
      active = g.enemies.some((e) => e.markedHunter && e.hp > 0),
      warning = g.markedHunt?.warning,
      text = `CARRY ${money(current.carried)} · BANK ${money(current.bank)} · BOUNTY ${money(current.bounty)}${warning ? "\nHUNTER INBOUND · " + Math.max(1, Math.ceil(warning.arrivesAt - g.time)) + "s" : active ? "\nHUNTER ACTIVE" : ""}`;
    if (hud.textContent !== text) hud.textContent = text;
    hud.dataset.marked = String(current.bounty >= c.hunterBounty);
    summary.textContent = `Carried ${money(current.carried)} · Bank ${money(current.bank)} · Bounty ${money(current.bounty)}`;
    bank.disabled = !allowed() || !current.carried;
    for (const [id, { button, name }] of buttons) {
      const row = c.shop[id];
      button.textContent = `${name} +${row.amount}${id === "dressing" ? " HP" : " rounds"} · ${money(row.price)}`;
      button.disabled = !allowed() || !markedShopEligible(g, id);
    }
    status.textContent =
      lastError ||
      (!allowed()
        ? "Banking and purchases are available inside a protected safehouse."
        : "Purchases use banked cash and save immediately.");
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
