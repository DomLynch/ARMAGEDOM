import { ownsReaper, reaperSelected, stopReaper } from "./reaper.js";
import { GAME_DATA, fillText } from "./game-data.js";
const TEXT = GAME_DATA.weaponViewText.reaper;
export function createReaperView(s, dispatch) {
  const parent = document.getElementById("menu-gear");
  if (!parent) return { update() {}, equip() {}, dispose() {} };
  const panel = document.createElement("section"),
    title = document.createElement("h4"),
    stats = document.createElement("p"),
    button = document.createElement("button");
  button.type = "button";
  button.id = "reaper-equip";
  panel.append(title, stats, button);
  parent.append(panel);
  const safe = () =>
    s.loaded &&
    !s.traveling &&
    !s.contextLost &&
    s.game?.player.hp > 0 &&
    !s.game.finished &&
    !s.game.runSaveInvalid &&
    !s.game.player.swing &&
    s.game.time >= s.game.player.ready &&
    s.game.time >= s.game.player.hurtUntil &&
    s.game.time >= s.game.player.dodgeUntil;
  function equip() {
    const g = s.game;
    if (!safe() || !ownsReaper(g)) return;
    const selected = !reaperSelected(g);
    const result = dispatch(g, { type: "equip", itemId: g.world.reaperData.itemId, equipped: selected }, true);
    if (result.ok) {
      if (!selected) stopReaper(g, "recall");
      if (g.reaper) g.reaper.recalled = !selected;
      g.events.push(...result.events);
      s.input.clear();
    }
    s.updateExpedition?.();
    update();
    return result;
  }
  button.addEventListener("click", equip);
  function update() {
    const g = s.game,
      d = g?.world.reaperData;
    panel.hidden = !d;
    if (!d) return;
    title.textContent = d.name;
    stats.textContent = ownsReaper(g)
      ? fillText(TEXT.stateOwned, { damage: d.rules.damage, range: d.rules.range, cadence: d.rules.cadence })
      : TEXT.stateLocked;
    button.hidden = !ownsReaper(g);
    button.disabled = !safe() || (g.locker?.weapons ?? []).includes(d.itemId);
    button.textContent = (g.locker?.weapons ?? []).includes(d.itemId)
      ? TEXT.buttonStored
      : reaperSelected(g)
        ? TEXT.buttonRecall
        : TEXT.buttonDeploy;
    button.setAttribute("aria-pressed", String(reaperSelected(g)));
  }
  return {
    update,
    equip,
    dispose() {
      button.removeEventListener("click", equip);
      panel.remove();
    },
  };
}
