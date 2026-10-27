import { boneSawEquipped } from "./engine/bone-saw.js";
import { selectedBossRanged } from "./engine/boss-weapon-runtime.js";
import { bossExitGate } from "./engine/area-bosses.js";
import { createMenuTabs } from "./menu-tabs.js";
import { selectedPistolProfile } from "./engine/expedition-core.js";
import { pilotBonuses, DEFAULT_ATTRIBUTES } from "./engine/progression-rules.js";
import { PISTOL_RULES } from "./pistol.js";
import { keySuffix } from "./engine/key-hint.js";
import { GAME_DATA } from "./engine/game-data.js";
import { webText } from "./engine/web-text.js";
// Button cooldown fallbacks, the pistol prompt reach and the default grenade range: data/visual.json `hud`.
const HUD = GAME_DATA.visual.hud;
// The grenade lines quote the real fuse (weapons.json) and throw ranges (combatRules.json bossWeapon), written "3, 5 or 8".
const GRENADE_FUSE = GAME_DATA.weapons.ranged["standard-grenade-v1"].payload.fuseSeconds;
const THROW_RANGES = GAME_DATA.combatRules.bossWeapon.grenadeThrowRanges.reduce(
  (list, n, i, all) => list + (i === 0 ? "" : i === all.length - 1 ? " or " : ", ") + n,
  "",
);
const percentBonus = (multiplier) => Math.round((multiplier - 1) * 1000) / 10; // tuning-ok: a damage multiplier as a percent, to one decimal
// Lines the HUD never shows (Dom's text pass, 24 Oct): the hunter warnings, whichever system still sets them.
const HIDDEN_MESSAGE = /^(HUNTER INBOUND|A hunter is after you|Hunter in \d)/;
export const hudMessage = (message) => (HIDDEN_MESSAGE.test(message ?? "") ? "" : (message ?? ""));
// The HUD refreshes every frame. update() stages its writes (the last write to a slot
// wins, so a default overridden later in the frame never reaches the DOM) and flush()
// applies only values that differ from the DOM, or from the last style written (the
// browser normalises style strings). Unchanged frames therefore touch nothing, which
// also stops aria-live text being re-announced. update() must not read back a value it
// has just set: reads see the DOM as of the previous frame.
// Records, their maps and the view wrappers are created once per element and reused.
const records = new WeakMap(),
  dirty = [];
function mark(record) {
  if (!record.dirty) {
    record.dirty = true;
    dirty.push(record);
  }
}
function view(node) {
  if (!node) return node;
  let record = records.get(node);
  if (record) return record.view;
  record = {
    node,
    dirty: false,
    text: undefined,
    hidden: undefined,
    disabled: undefined,
    attrs: new Map(),
    classes: new Map(),
    styles: new Map(),
    written: new Map(),
    bound: new Map(),
  };
  const stageClass = (name, on) => {
      record.classes.set(name, on);
      mark(record);
    },
    stageStyle = (name, value) => {
      record.styles.set(name, value);
      mark(record);
    },
    style = {
      set width(value) {
        stageStyle("width", value);
      },
      setProperty: stageStyle,
    },
    classes = {
      toggle: (name, on) => stageClass(name, !!on),
      remove: (...names) => {
        for (const name of names) stageClass(name, false);
      },
      contains: (name) => node.classList.contains(name),
    },
    setAttribute = (name, value) => {
      record.attrs.set(name, String(value));
      mark(record);
    },
    querySelector = (selector) => view(node.querySelector(selector));
  record.view = new Proxy(node, {
    get(target, key) {
      if (key === "setAttribute") return setAttribute;
      if (key === "style") return style;
      if (key === "classList") return classes;
      if (key === "querySelector") return querySelector;
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      let bound = record.bound.get(key);
      if (!bound) record.bound.set(key, (bound = value.bind(target)));
      return bound;
    },
    set(target, key, value) {
      if (key === "textContent") {
        record.text = String(value);
        mark(record);
      } else if (key === "hidden") {
        record.hidden = value;
        mark(record);
      } else if (key === "disabled") {
        record.disabled = value;
        mark(record);
      } else target[key] = value;
      return true;
    },
  });
  records.set(node, record);
  return record.view;
}
function flush() {
  for (const record of dirty) {
    const node = record.node;
    record.dirty = false;
    if (record.text !== undefined) {
      if (node.textContent !== record.text) node.textContent = record.text;
      record.text = undefined;
    }
    if (record.hidden !== undefined) {
      if (node.hidden !== record.hidden) node.hidden = record.hidden;
      record.hidden = undefined;
    }
    if (record.disabled !== undefined) {
      if (node.disabled !== record.disabled) node.disabled = record.disabled;
      record.disabled = undefined;
    }
    if (record.attrs.size) {
      for (const [name, value] of record.attrs)
        if ((node.getAttribute ? node.getAttribute(name) : node.attributes?.get(name)) !== value)
          node.setAttribute(name, value);
      record.attrs.clear();
    }
    if (record.classes.size) {
      for (const [name, on] of record.classes)
        if (node.classList.contains(name) !== on) node.classList.toggle(name, on);
      record.classes.clear();
    }
    if (record.styles.size) {
      for (const [name, value] of record.styles) {
        if (record.written.get(name) === value) continue;
        record.written.set(name, value);
        if (name === "width") node.style.width = value;
        else node.style.setProperty(name, value);
      }
      record.styles.clear();
    }
  }
  dirty.length = 0;
}
export function createHUD({
  onRetry,
  onReset = async () => ({ ok: false }),
  onPause,
  onSound,
  onPistol = () => {},
  onFeedback = () => {},
  onAssist = () => {},
}) {
  const el = (id) => document.getElementById(id),
    menu = el("menu");
  const listeners = [];
  function listen(target, type, handler) {
    target.addEventListener(type, handler);
    listeners.push(() => target.removeEventListener?.(type, handler));
  }
  let loaded = false,
    sound = true,
    resetBusy = false;
  const menuTabs = createMenuTabs(el, { canSelect: () => !resetBusy });
  function pause() {
    onPause(menu.open || document.hidden);
    document.body.classList.toggle("menu-open", menu.open);
  }
  function resize() {
    pause();
  }
  function toggleMenu() {
    if (!loaded || resetBusy) return;
    if (menu.open) menu.close();
    else menu.showModal();
    pause();
  }
  // One way out of the menu (Dom, 26 Oct): the X. The labelled "Back to game" button duplicated it.
  el("close-menu").onclick = () => {
    if (!resetBusy) menu.close();
  };
  listen(menu, "close", pause);
  listen(menu, "cancel", pause);
  el("menu-button").onclick = toggleMenu;
  el("retry").onclick = () => {
    if (resetBusy) return;
    menu.close();
    onRetry();
  };
  const resetStatus = el("reset-status"),
    resetButton = el("reset-game");
  listen(menu, "cancel", (event) => {
    if (resetBusy) event.preventDefault();
  });
  // One tap resets (Dom, 26 Oct: no second "Reset the game?" box). The reset itself is unchanged.
  resetButton.onclick = async () => {
    if (!loaded || resetBusy) return;
    resetBusy = true;
    resetButton.disabled = true;
    resetStatus.textContent = webText("hud.resetting");
    let result;
    try {
      result = await onReset();
    } catch {
      result = { ok: false, message: webText("hud.resetFailed") };
    }
    if (!loaded) return;
    resetStatus.textContent = result?.message ?? webText("hud.resetFailed");
    if (!result?.ok) {
      resetBusy = false;
      resetButton.disabled = false;
    }
  };
  el("again").onclick = onRetry;
  el("pistol-interact").onclick = onPistol;
  el("sound").onclick = () => {
    sound = !sound;
    el("sound").textContent = webText(sound ? "hud.soundOn" : "hud.soundOff");
    el("sound").setAttribute("aria-pressed", String(sound));
    onSound(sound);
  };
  let assist = true;
  el("assist").onclick = () => {
    assist = !assist;
    el("assist").textContent = webText(assist ? "hud.assistOn" : "hud.assistOff");
    el("assist").setAttribute("aria-pressed", String(assist));
    onAssist(assist);
  };
  const feedback = el("feedback-mode");
  feedback.onchange = () => onFeedback(feedback.value);
  listen(window, "resize", resize);
  listen(document, "visibilitychange", pause);
  const handlers = [
    "close-menu",
    "menu-button",
    "retry",
    "reset-game",
    "again",
    "pistol-interact",
    "sound",
    "assist",
  ].map((id) => ({ element: el(id), key: "onclick", handler: el(id).onclick }));
  handlers.push({ element: feedback, key: "onchange", handler: feedback.onchange });
  resize();
  let lastMessage = "",
    lastGold = false,
    lastStaminaState = null,
    lastRifleEquipped = null,
    lastBossWeapon = null,
    lastPistolEquipped = null,
    lastFlameEquipped = false;
  return {
    dispose() {
      loaded = false;
      menuTabs.dispose();
      for (const remove of listeners.splice(0)) remove();
      for (const row of handlers) if (row.element[row.key] === row.handler) row.element[row.key] = null;
    },
    toggleMenu,
    get menuPage() {
      return menuTabs.current;
    },
    showMenuPage(id) {
      if (!loaded || resetBusy) return false;
      const selected = menuTabs.select(id);
      if (selected && !menu.open) toggleMenu();
      return selected;
    },
    resize,
    ready() {
      loaded = true;
      el("entry").hidden = true;
      el("hud").hidden = false;
      resize();
    },
    loading(text) {
      el("loading").textContent = text;
    },
    failed(message) {
      el("enter").disabled = false;
      el("enter").textContent = webText("hud.retryLoading");
      el("loading").textContent = message;
    },
    update(g, hint = "", hintFirst = false) {
      try {
        const el = (id) => view(document.getElementById(id));
        const p = g.player,
          donor = g.pilot === "donor-knife";
        el("health-fill").style.width = `${(p.hp / p.maxHP) * 100}%`;
        el("health-number").textContent = `${Math.ceil(p.hp)} / ${p.maxHP}`;
        const maximum = Number.isFinite(p.maxStamina) && p.maxStamina > 0 ? p.maxStamina : 100;
        const rawStamina = p.stamina ?? p.guard;
        const stamina = Math.min(maximum, Math.max(0, Number.isFinite(rawStamina) ? rawStamina : 0));
        const exhausted = p.exhausted === true;
        const unaffordable = (id) => {
          if (g.weaponsLowered && id !== "dodge") return true;
          const cost = g.staminaCosts?.[id];
          return id === "guard"
            ? stamina <= 0 || exhausted
            : Number.isFinite(cost) && cost > 0 && (stamina < cost || exhausted);
        };
        const low = stamina <= 0 || ["slash", "stab", "heavy", "dodge"].some(unaffordable);
        const staminaState = exhausted
          ? webText("hud.label.exhausted")
          : p.guardBrokenUntil > g.time
            ? webText("hud.guardBroken")
            : low
              ? webText("hud.label.low")
              : "";
        el("guard-fill").style.width = `${(stamina / maximum) * 100}%`;
        el("guard-number").textContent = `${Math.ceil(stamina)} / ${maximum}`;
        const bar = el("stamina-bar");
        bar.setAttribute("aria-valuenow", String(stamina));
        bar.setAttribute("aria-valuemax", String(maximum));
        bar.classList.toggle("low-energy", low || exhausted);
        if (staminaState !== lastStaminaState) {
          el("stamina-state").textContent = staminaState;
          lastStaminaState = staminaState;
        }
        for (const id of ["slash", "stab", "heavy", "dodge", "guard"]) {
          const button = el(id),
            lowEnergy = unaffordable(id);
          button.classList.toggle("low-energy", lowEnergy);
          const actionLabel = id === "dodge" ? webText("hud.dodgeRoll") : id;
          button.setAttribute("aria-label", lowEnergy ? webText("hud.lowStamina", { label: actionLabel }) : actionLabel);
          if (id === "slash" || id === "stab" || id === "guard") button.querySelector("small").textContent = "";
        }
        const area = (g.world?.areaId ?? "westminster").toUpperCase();
        el("menu-area").textContent = webText("hud.menuArea", { area });
        // The expedition objective owns next-step guidance; this line keeps region
        // status. Actual crossing checks and transient warnings remain unchanged.
        const guided = !!g.world?.safehouseData,
          exitGate = guided ? null : bossExitGate(g);
        const areaName = area[0] + area.slice(1).toLowerCase(),
          enemyCount = webText(g.enemies.length === 1 ? "hud.enemyCount.one" : "hud.enemyCount.other", { count: g.enemies.length });
        el("objective").textContent =
          exitGate && !exitGate.allowed
            ? exitGate.message
            : g.encounterCleared && !g.enemies.some((e) => e.hp > 0 && e.hostile !== false)
              ? webText("hud.areaCleared", { area: areaName })
              : webText("hud.areaEnemies", { area: areaName, count: enemyCount });
        const progression = g.progression,
          model = g.progressionModel;
        // Mastery detail lives in the progression panel; the HUD keeps it hidden.
        el("mastery").hidden = true;
        el("progression-panel").hidden = !model;
        if (model) {
          const weapon = p.weapon === "pistol" ? "westminster-start-pistol-v1" : "knife",
            label = webText(weapon === "knife" ? "hud.label.knife" : "hud.label.pistol");
          const bonus = (id) =>
            percentBonus(
              pilotBonuses(g.world.progressionData, DEFAULT_ATTRIBUTES, id, progression.proficiency[id]).damageMultiplier,
            );
          el("mastery").textContent = ["rifle", "shotgun", "grenade", "rocket"].includes(p.weapon)
            ? webText("hud.masteryNone", { weapon: p.weapon.toUpperCase() })
            : webText("hud.mastery", { label, level: progression.proficiency[weapon], bonus: bonus(weapon) });
          el("progression-attributes").textContent = webText("hud.attributes", {
            attributes: Object.entries(progression.attributes)
              .map(([id, value]) => `${id[0].toUpperCase() + id.slice(1)} ${value}`)
              .join(" · "),
          });
          el("progression-weapons").textContent = webText("hud.weaponMastery", {
            knife: progression.proficiency.knife,
            knifeBonus: bonus("knife"),
            pistol: progression.proficiency["westminster-start-pistol-v1"],
            pistolBonus: bonus("westminster-start-pistol-v1"),
            combined: ["rifle", "shotgun", "grenade", "rocket"].includes(p.weapon)
              ? 0
              : percentBonus(model.bonuses(progression, weapon).damageMultiplier),
          });
        }
        // A survival hint (hintFirst) outranks even a live game message; every other hint waits for it.
        const message =
          hintFirst && hint
            ? hint
            : g.time < g.messageUntil
              ? hudMessage(g.message)
              : hint || g.airdrop?.hud || g.world?.exitHint?.(p.pos) || "";
        // A first-time hint is a gold pop-up in the route arrow's colour; game messages keep the plain style.
        const gold = !!hint && message === hint;
        if (message !== lastMessage || gold !== lastGold) {
          el("notice").textContent = message;
          el("notice").classList.toggle("hint", gold);
          lastMessage = message;
          lastGold = gold;
        }
        for (const [id, ready, fallback] of [
          ["heavy", p.heavyReady, HUD.heavyFallbackSeconds],
          ["dodge", p.dodgeReady, HUD.dodgeFallbackSeconds],
        ]) {
          const button = el(id),
            left = Math.max(0, ready - g.time),
            period = donor ? (g.cooldowns?.[id] ?? fallback) : fallback;
          button.classList.toggle("cooldown", left > 0);
          // Heavy has no extra cooldown in the pilot; its commitment is combat-owned.
          button.style.setProperty("--ready", String(period > 0 ? 1 - left / period : 1));
          button.querySelector("small").textContent = left > 0 ? `${left.toFixed(1)}s` : "";
        }
        el("guard").classList.toggle("pressed", p.guarding);
        const flameEquipped = !!g.flame?.equipped;
        for (const id of ["stab", "heavy"]) el(id).hidden = flameEquipped;
        if (flameEquipped !== lastFlameEquipped) {
          lastPistolEquipped = null;
          lastFlameEquipped = flameEquipped;
        }
        if (!!g.rifle?.selected !== lastRifleEquipped) {
          lastPistolEquipped = null;
          lastRifleEquipped = !!g.rifle?.selected;
        }
        const bossWeapon = selectedBossRanged(g);
        if (bossWeapon !== lastBossWeapon) {
          lastPistolEquipped = null;
          lastBossWeapon = bossWeapon;
        }
        const pistol = g.pistol;
        if (pistol) {
          const equipped = pistol.equipped;
          if (equipped !== lastPistolEquipped) {
            for (const [id, label] of Object.entries(
              equipped
                ? {
                    slash: webText("hud.label.fire"),
                    stab: webText("hud.label.reload"),
                    heavy: webText("hud.label.melee"),
                    guard: webText("hud.noGuard"),
                  }
                : {
                    slash: webText("hud.label.slash"),
                    stab: webText("hud.label.stab"),
                    heavy: webText("hud.label.heavy"),
                    guard: webText("hud.label.guard"),
                  },
            ))
              el(id).querySelector("span").textContent = label;
            el("guard").disabled = equipped;
            if (!equipped) el("guard").setAttribute("aria-label", webText("hud.aria.guard"));
            lastPistolEquipped = equipped;
          }
          if (equipped) {
            el("guard").setAttribute("aria-label", webText("hud.guardUnavailable.pistol"));
          }
          // The pistol tile and FIRE button already show the magazine; the top-left line is a duplicate.
          el("ammo").hidden = true;
          el("ammo").textContent = webText("hud.ammo.pistol", {
            name: (selectedPistolProfile(g).name ?? webText("hud.label.pistol")).toUpperCase(),
            magazine: pistol.magazine,
            capacity: PISTOL_RULES.capacity,
            reserve: pistol.reserve,
            reloading: pistol.reloadingUntil ? webText("hud.reloadingSuffix") : "",
          });
          const fireLeft = Math.max(0, pistol.nextFireAt - g.time);
          el("slash").classList.toggle("pistol-aim", equipped);
          el("slash").classList.toggle("cooldown", equipped && fireLeft > 0);
          el("slash").style.setProperty(
            "--ready",
            String(equipped ? 1 - Math.min(1, fireLeft / PISTOL_RULES.cadence) : 1),
          );
          el("slash").querySelector("small").textContent = equipped
            ? `${pistol.magazine}/${PISTOL_RULES.capacity}`
            : "";
          el("stab").querySelector("small").textContent =
            equipped && pistol.reloadingUntil ? `${Math.max(0, pistol.reloadingUntil - g.time).toFixed(1)}s` : "";
          if (equipped) {
            el("heavy").querySelector("small").textContent = "";
            el("heavy").classList.toggle("cooldown", false);
            for (const id of ["slash", "stab", "heavy"]) {
              el(id).classList.toggle("low-energy", id === "slash" && !pistol.magazine);
              el(id).setAttribute(
                "aria-label",
                id === "slash"
                  ? webText("hud.fire.pistolLabel", {
                      magazine: pistol.magazine,
                      capacity: PISTOL_RULES.capacity,
                      reserve: pistol.reserve,
                      reloading: pistol.reloadingUntil ? webText("hud.reloadingAria") : "",
                    })
                  : id === "stab"
                    ? webText("hud.aria.reload")
                    : webText("hud.switchToMelee"),
              );
            }
          }
          const nearby =
            !pistol.collected &&
            (g.world.areaId ?? "westminster") === pistol.pickupAreaId &&
            Math.hypot(p.pos.x - pistol.pickupPos.x, p.pos.z - pistol.pickupPos.z) <= HUD.pistolInteractRadius;
          el("pistol-interact").hidden = g.finished || (!nearby && (!pistol.collected || equipped));
          el("pistol-interact").textContent = webText(nearby ? "hud.pickUpAndEquipPistol" : "hud.equipPistol") + keySuffix();
          el("pistol-icon").hidden = true;
        }
        if (g.rifle?.selected && !flameEquipped) {
          const rifle = g.rifle,
            rules = g.world.rifleData.rules,
            clock = g.rifleAction ?? {},
            left = Math.max(0, (clock.nextFireAt ?? 0) - g.time);
          for (const [id, text] of Object.entries({
            slash: webText("hud.label.fire"),
            stab: webText("hud.label.reload"),
            heavy: webText("hud.label.melee"),
            guard: webText("hud.noGuard"),
          }))
            el(id).querySelector("span").textContent = text;
          el("guard").disabled = true;
          el("guard").setAttribute("aria-label", webText("hud.guardUnavailable.rifle"));
          el("ammo").hidden = false;
          el("ammo").textContent = webText("hud.ammo.standard", {
            name: webText("hud.label.rifle"),
            magazine: rifle.magazine,
            capacity: rules.capacity,
            reserve: rifle.reserve,
            reloading: clock.reloadingUntil ? webText("hud.reloadingSuffix") : "",
          });
          for (const id of ["slash", "stab", "heavy"]) {
            el(id).classList.toggle("low-energy", false);
            el(id).classList.toggle("cooldown", id === "slash" && left > 0);
            el(id).querySelector("small").textContent =
              id === "slash"
                ? `${rifle.magazine}/${rules.capacity}`
                : id === "stab" && clock.reloadingUntil
                  ? `${Math.max(0, clock.reloadingUntil - g.time).toFixed(1)}s`
                  : "";
          }
          el("slash").classList.toggle("pistol-aim", true);
          el("slash").style.setProperty("--ready", String(1 - Math.min(1, left / rules.cadence)));
          el("slash").setAttribute(
            "aria-label",
            webText("hud.fire.rifle", { magazine: rifle.magazine, reserve: rifle.reserve }),
          );
          el("stab").setAttribute("aria-label", webText("hud.reload.rifle"));
        }
        if (bossWeapon && !flameEquipped) {
          const state = g.bossEquipment[bossWeapon],
            data = g.world.bossEquipmentData[bossWeapon],
            clock = g.bossEquipmentAction?.[bossWeapon] ?? {},
            left = Math.max(0, (clock.nextFireAt ?? 0) - g.time),
            grenade = bossWeapon === "grenade",
            rocket = bossWeapon === "rocketLauncher",
            capacity = data.rules.capacity;
          for (const [id, text] of Object.entries({
            slash: webText(grenade ? "hud.label.throw" : "hud.label.fire"),
            stab: webText(grenade ? "hud.label.range" : "hud.label.reload"),
            heavy: webText("hud.label.melee"),
            guard: grenade ? webText("hud.label.mode") : webText("hud.noGuard"),
          }))
            el(id).querySelector("span").textContent = text;
          el("guard").disabled = !grenade;
          el("guard").setAttribute(
            "aria-label",
            grenade
              ? webText("hud.grenadeMode", {
                  mode: webText(g.grenadeMode === "sticky" ? "hud.aria.stickyMode" : "hud.aria.standardMode"),
                })
              : webText("hud.guardUnavailable.weapon", { name: data.name }),
          );
          if (grenade) {
            el("guard").classList.remove("low-energy", "cooldown", "pressed");
            el("guard").querySelector("small").textContent = webText(
              g.grenadeMode === "sticky" ? "hud.label.sticky" : "hud.label.standard",
            );
          }
          el("ammo").hidden = false;
          el("ammo").textContent = grenade
            ? webText("hud.ammo.grenade", {
                mode: webText(g.grenadeMode === "sticky" ? "hud.label.sticky" : "hud.label.standard"),
                magazine: state.magazine,
                fuse: GRENADE_FUSE,
              })
            : webText("hud.ammo.standard", {
                name: webText(rocket ? "hud.label.rocket" : "hud.label.shotgun"),
                magazine: state.magazine,
                capacity,
                reserve: state.reserve,
                reloading: clock.reloadingUntil ? webText("hud.reloadingSuffix") : "",
              });
          for (const id of ["slash", "stab", "heavy"]) {
            el(id).classList.toggle("low-energy", id === "slash" && state.magazine === 0);
            el(id).classList.toggle("cooldown", id === "slash" && left > 0);
            el(id).querySelector("small").textContent =
              id === "slash"
                ? grenade
                  ? webText("hud.left", { count: state.magazine })
                  : `${state.magazine}/${capacity}`
                : id === "stab"
                  ? grenade
                    ? `${g.grenadeThrowRange ?? HUD.grenadeDefaultRange}m`
                    : clock.reloadingUntil
                      ? `${Math.max(0, clock.reloadingUntil - g.time).toFixed(1)}s`
                      : ""
                  : "";
          }
          el("slash").classList.toggle("pistol-aim", true);
          el("slash").style.setProperty("--ready", String(1 - Math.min(1, left / data.rules.cadence)));
          el("slash").setAttribute(
            "aria-label",
            grenade
              ? webText("hud.fire.grenade", { magazine: state.magazine })
              : webText("hud.fire.boss", {
                  kind: webText(rocket ? "hud.aria.rocket" : "hud.aria.shotgun"),
                  magazine: state.magazine,
                }),
          );
          el("stab").setAttribute(
            "aria-label",
            grenade
              ? webText("hud.grenadeRange", { ranges: THROW_RANGES })
              : webText(rocket ? "hud.reload.rocket" : "hud.reload.shotgun"),
          );
        }
        if (g.player.weapon === "railgun" && g.bossEquipment?.commanderPistol?.selected) {
          const data = g.world.bossEquipmentData.commanderPistol,
            state = g.bossEquipment.commanderPistol,
            clock = g.bossEquipmentAction?.commanderPistol ?? {},
            charge = g.railgunCharge,
            progress = charge ? Math.min(1, (g.time - charge.startedAt) / data.charge.seconds) : 0,
            ready = charge && g.time + 1e-8 >= charge.readyAt,
            left = Math.max(0, (clock.nextFireAt ?? 0) - g.time);
          el("slash").querySelector("span").textContent = webText(ready ? "hud.label.release" : "hud.label.charge");
          el("slash").querySelector("small").textContent = charge
            ? ready
              ? webText("hud.label.ready")
              : `${Math.floor(progress * 100)}%`
            : g.railgunStatus?.until > g.time &&
                ["early-release", "cancel", "expired", "interrupted"].includes(g.railgunStatus.reason)
              ? webText("hud.label.cancelled")
              : `${state.magazine}/${data.rules.capacity}`;
          el("slash").style.setProperty(
            "--ready",
            String(charge ? progress : 1 - Math.min(1, left / data.rules.cadence)),
          );
          el("slash").classList.toggle("cooldown", left > 0 || !!clock.reloadingUntil);
          el("slash").classList.toggle("low-energy", state.magazine === 0);
          el("slash").setAttribute(
            "aria-label",
            webText("hud.arcCharge", { seconds: data.charge.seconds }),
          );
          el("stab").setAttribute("aria-label", webText("hud.reload.arc"));
          el("ammo").textContent = webText("hud.ammo.standard", {
            name: webText("hud.arcGunName"),
            magazine: state.magazine,
            capacity: data.rules.capacity,
            reserve: state.reserve,
            reloading: clock.reloadingUntil ? webText("hud.reloadingSuffix") : "",
          });
        }
        if (flameEquipped) {
          const percent = Math.ceil((g.flameFuel.fuelUnits / g.world.flameData.capacity) * 100);
          el("ammo").hidden = false;
          el("ammo").textContent = webText("hud.ammo.ember", { percent });
          for (const [id, text] of Object.entries({
            slash: webText("hud.label.flame"),
            stab: webText("hud.label.return"),
            heavy: webText("hud.label.return"),
            guard: webText("hud.noGuard"),
          }))
            el(id).querySelector("span").textContent = text;
          el("guard").disabled = true;
          el("guard").setAttribute("aria-label", webText("hud.guardUnavailable.flamethrower"));
          for (const id of ["slash", "stab", "heavy"]) {
            el(id).classList.toggle("cooldown", false);
            el(id).classList.toggle("low-energy", false);
            el(id).querySelector("small").textContent = id === "slash" ? `${percent}%` : "";
            el(id).setAttribute(
              "aria-label",
              id === "slash" ? webText("hud.flameFire", { percent }) : webText("hud.flameReturn"),
            );
          }
          el("slash").classList.toggle("pistol-aim", true);
          el("slash").style.setProperty("--ready", "1");
        }
        if (boneSawEquipped(g)) {
          el("slash").querySelector("span").textContent = webText("hud.label.cut");
          el("slash").querySelector("small").textContent = webText("hud.label.hold");
          el("slash").classList.toggle("low-energy", p.stamina <= 0);
          el("slash").classList.toggle("cooldown", false);
          el("slash").setAttribute("aria-label", webText("hud.boneSawCut"));
          el("stab").hidden = el("heavy").hidden = true;
          lastPistolEquipped = null;
        }
        const boss = g.enemies.find((e) => e.kind === 3); // tuning-ok: creature kind 3 is the boss
        el("boss").hidden = !boss;
        if (boss) el("boss-fill").style.width = `${(boss.hp / boss.maxHP) * 100}%`;
        el("ending").hidden = !g.finished || g.player.hp > 0;
        if (g.finished && g.player.hp <= 0) {
          el("result").textContent = webText("hud.ashClaimsYou");
          el("result-hint").textContent = webText(g.runSaveInvalid ? "runCore.savedRunUnreadable" : "hud.deathHint");
        }

        el("safehouse-status").hidden = !g.weaponsLowered;
        if (g.weaponsLowered) {
          el("ammo").hidden = false;
          el("ammo").textContent = webText("hud.safehouseLowered");
        }
      } finally {
        flush();
      }
    },
  };
}
