import { reaperSelected, ownsReaper, REAPER_ITEM_ID } from "./reaper.js";
import { ownsEmberReward } from "./boss-equipment-data.js";
import { weaponTileIcon } from "./weapon-tile-icons.js";
import { lockerStored } from "./locker-core.js";
import { MELEE_VARIANTS } from "../melee-equipment.js";
import { WEAPON_TILES as TILES } from "./weapon-tiles-data.js";
import { GAME_DATA } from "./game-data.js";
import { fillText } from "./game-data-combat-text.js";
const GEAR_TEXT = GAME_DATA.combatText.gear; // data/combatText.json
const { pageSize: PAGE, pageWidthPx: STEP } = TILES;
// A weapon with nothing loaded and nothing in reserve says so instead of showing "0/8 · 0".
const dry = (magazine, reserve) => !magazine && !reserve;
const ammoText = (magazine, capacity, reserve) =>
  fillText(GEAR_TEXT.ammoCount, { magazine: magazine ?? 0, capacity, reserve: reserve ?? 0 });
const fuelText = (units, capacity) => `${Math.ceil((units / capacity) * 100)}${GEAR_TEXT.fuelSuffix}`;
const rounds = (magazine, capacity, reserve) => (dry(magazine, reserve) ? GEAR_TEXT.ammoEmpty : ammoText(magazine, capacity, reserve));
// Presentation only: every selection still uses its existing Gear control/writer.
export function carriedWeaponTiles(g) {
  if (!g?.world) return [];
  const rows = [],
    boss = g.bossEquipment ?? {},
    selected = Object.keys(boss).find((id) => boss[id]?.selected),
    emberOwned = ownsEmberReward(g),
    flameId = emberOwned ? "ember-flamethrower-v1" : "flamethrower-area8-v1";
  const active = g.flame?.equipped
    ? flameId
    : selected
      ? g.world.bossEquipmentData?.[selected]?.itemId
      : g.rifle?.selected
        ? g.world.rifleData?.itemId
        : g.pistol?.equipped
          ? g.world.reaperData
            ? "westminster-start-pistol-v1"
            : (g.expedition?.selectedPistolVariant ?? "westminster-start-pistol-v1")
          : (g.uniqueReward?.selectedMeleeVariant ?? "knife");
  const add = (id, name, control, owned, ammo = GEAR_TEXT.ammoMelee, empty = false) => {
    if (owned && !lockerStored(g, id)) rows.push({ id, name, control, active: id === active, ammo, empty });
  };
  for (const id of ["knife", g.world.uniqueRewardData?.itemId].filter(Boolean)) {
    const p = MELEE_VARIANTS[id];
    if (p) add(id, p.name, "melee-variant-" + id, id === "knife" || g.uniqueReward?.status === "owned");
  }
  for (const [id, p] of Object.entries(g.world.expeditionData?.variants ?? {}).filter(
    ([id]) => !g.world.reaperData || id !== REAPER_ITEM_ID,
  ))
    add(
      id,
      p.name,
      "variant-" + id,
      g.pistol?.collected && (id === "westminster-start-pistol-v1" || g.expedition?.status === "claimed"),
      rounds(g.pistol?.magazine, TILES.pistolCapacity, g.pistol?.reserve),
      dry(g.pistol?.magazine, g.pistol?.reserve),
    );
  const rifle = g.world.rifleData;
  if (rifle)
    add(
      rifle.itemId,
      rifle.name,
      "rifle-equip",
      g.rifle?.status === "owned",
      rounds(g.rifle?.magazine, rifle.rules.capacity, g.rifle?.reserve),
      dry(g.rifle?.magazine, g.rifle?.reserve),
    );
  add(
    flameId,
    GEAR_TEXT.emberProjector,
    emberOwned ? "boss-equip-emberProjector" : "flame-equip",
    g.flameFuel?.collected || emberOwned,
    g.flameFuel?.fuelUnits > 0
      ? fuelText(g.flameFuel.fuelUnits, g.world.flameData?.capacity ?? 1000)
      : GEAR_TEXT.ammoEmpty,
    !(g.flameFuel?.fuelUnits > 0),
  );
  for (const [field, p] of Object.entries(g.world.bossEquipmentData ?? {})) {
    if (p.family === "flamethrowers") continue;
    const state = boss[field],
      empty =
        p.family === "blades"
          ? false
          : p.family === "pistols"
            ? dry(g.pistol?.magazine, g.pistol?.reserve)
            : field === "grenade"
              ? !state?.magazine
              : dry(state?.magazine, state?.reserve),
      ammo =
        p.family === "flamethrowers"
          ? fuelText(g.flameFuel?.fuelUnits ?? 0, 1000)
          : p.family === "blades"
            ? GEAR_TEXT.ammoMelee
            : p.family === "pistols"
              ? ammoText(g.pistol?.magazine, TILES.pistolCapacity, g.pistol?.reserve)
              : field === "grenade"
                ? fillText(GEAR_TEXT.charges, { count: state?.magazine ?? 0 })
                : ammoText(state?.magazine, p.rules.capacity, state?.reserve);
    add(p.itemId, p.name, "boss-equip-" + field, state?.status === "owned", empty ? GEAR_TEXT.ammoEmpty : ammo, empty);
  }
  if (g.world.reaperData && ownsReaper(g) && !lockerStored(g, REAPER_ITEM_ID))
    rows.push({
      id: REAPER_ITEM_ID,
      name: g.world.reaperData.name,
      control: "reaper-equip",
      active: reaperSelected(g),
      owned: true,
      companion: true,
      empty: false,
      ammo: reaperSelected(g) ? GEAR_TEXT.ammoDeployed : GEAR_TEXT.recallDeploy,
    });
  return rows;
}
// A cancelled or dragged gesture cannot become an equip click.
export function tileGesture() {
  let start = null,
    blocked = false;
  return {
    down(e) {
      if (start) return;
      start = { id: e.pointerId, x: e.clientX, y: e.clientY };
      blocked = false;
    },
    move(e) {
      if (start?.id === e.pointerId && Math.hypot(e.clientX - start.x, e.clientY - start.y) > TILES.tapSlopPx) blocked = true;
    },
    end(e) {
      if (start?.id === e.pointerId) start = null;
    },
    cancel() {
      start = null;
      blocked = true;
    },
    accept() {
      const yes = !blocked;
      blocked = false;
      return yes;
    },
  };
}
// A weapon picked up for the first time makes the tiles flash for a few seconds, with a "switch" chevron beside them.
// "Seen" weapon ids live in their own localStorage key (like the first-time hints), never in the run save, and the
// first update only records what is already carried, so loading a save never flashes.
export const TILE_FLASH_KEY = "armagedom.weaponTileFlash.v1";
export const TILE_FLASH_SECONDS = TILES.flashSeconds;
export function createTileFlash(storage = globalThis.localStorage) {
  const seen = new Set();
  try {
    const stored = JSON.parse(storage?.getItem(TILE_FLASH_KEY) ?? "[]");
    if (Array.isArray(stored)) for (const id of stored) if (typeof id === "string") seen.add(id);
  } catch {
    /* Unreadable storage only means a flash may repeat. */
  }
  let known = null;
  // Returns true when a carried weapon is new this session and has never flashed.
  return (ids) => {
    const fresh = known ? ids.filter((id) => !known.has(id) && !seen.has(id)) : [];
    known = new Set(ids);
    if (!fresh.length) return false;
    for (const id of fresh) seen.add(id);
    try {
      storage?.setItem(TILE_FLASH_KEY, JSON.stringify([...seen]));
    } catch {
      /* The flash simply shows again next time. */
    }
    return true;
  };
}
export function createWeaponTiles(s, select) {
  const root = document.getElementById("weapon-tiles"),
    track = document.getElementById("weapon-tiles-track"),
    current = document.getElementById("weapon-tiles-current"),
    position = document.getElementById("weapon-tiles-position"),
    prev = document.getElementById("weapon-tiles-prev"),
    nextButton = document.getElementById("weapon-tiles-next");
  if (!root || !track || !current || !position || !prev || !nextButton) return { update() {}, dispose() {} };
  const gesture = tileGesture(),
    listeners = [],
    buttons = new Map();
  const newWeapon = createTileFlash();
  let flashUntil = 0,
    order = "",
    selecting = false,
    disposed = false;
  const listen = (node, type, fn, options) => {
    node.addEventListener(type, fn, options);
    listeners.push(() => node.removeEventListener(type, fn, options));
  };
  listen(track, "pointerdown", (e) => gesture.down(e));
  listen(track, "pointermove", (e) => gesture.move(e));
  listen(track, "pointerup", (e) => gesture.end(e));
  listen(track, "pointercancel", () => gesture.cancel());
  listen(track, "click", async (e) => {
    if (!gesture.accept()) {
      e.preventDefault();
      return;
    }
    const button = e.target.closest?.("[data-weapon-id]");
    if (!button || button.disabled || selecting || s.paused || !s.loaded || s.traveling || s.contextLost) return;
    const row = carriedWeaponTiles(s.game).find((r) => r.id === button.dataset.weaponId);
    if (!row || (row.active && !row.companion)) return;
    const control = document.getElementById(row.control);
    if (row.empty && control?.disabled) {
      // The Gear control refuses an empty weapon; say so instead of ignoring the tap.
      s.game.message = fillText(GEAR_TEXT.empty, { name: row.name });
      s.game.messageUntil = s.game.time + TILES.emptyMessageSeconds;
      return;
    }
    if (!control || control.disabled) return;
    selecting = true;
    try {
      await select(row);
    } finally {
      selecting = false;
      update();
    }
  });
  function hint() {
    const count = buttons.size,
      last = Math.max(0, Math.ceil(count / PAGE) - 1),
      page = Math.max(0, Math.min(last, Math.round(track.scrollLeft / STEP))),
      extra = count > PAGE;
    root.dataset.page = String(page);
    root.dataset.pages = String(last + 1);
    position.textContent = fillText(GEAR_TEXT.pageOf, { page: page + 1, total: last + 1 });
    for (const [button, disabled] of [
      [prev, page === 0],
      [nextButton, page === last],
    ]) {
      button.hidden = !extra;
      button.disabled = disabled;
      button.style.visibility = disabled ? "hidden" : "visible";
    }
  }
  function browse(delta) {
    if (root.hidden || s.paused || s.traveling || s.contextLost || !s.loaded) return;
    const last = Math.max(0, Math.ceil(buttons.size / PAGE) - 1),
      page = Math.round(track.scrollLeft / STEP),
      target = Math.max(0, Math.min(last, page + delta));
    track.scrollTo({ left: target * STEP, behavior: "smooth" });
  }
  listen(prev, "click", () => browse(-1));
  listen(nextButton, "click", () => browse(1));
  for (const button of [prev, nextButton])
    listen(button, "keydown", (event) => {
      if (["Space", "Enter"].includes(event.code)) event.stopPropagation();
    });
  listen(track, "scroll", hint, { passive: true });
  function update() {
    if (disposed) return;
    const g = s.game;
    root.hidden =
      !g || !s.loaded || s.paused || s.traveling || s.contextLost || g.finished || g.runSaveInvalid || g.player.hp <= 0;
    if (root.hidden) return;
    const rows = carriedWeaponTiles(g),
      next = rows.map((r) => r.id).join("|");
    const now = globalThis.performance?.now?.() ?? 0;
    if (newWeapon(rows.map((r) => r.id))) flashUntil = now + TILE_FLASH_SECONDS * 1000;
    root.classList?.toggle("flash", now < flashUntil);
    if (next !== order) {
      const oldPage = Math.round(track.scrollLeft / STEP);
      track.replaceChildren();
      buttons.clear();
      let page;
      for (const [index, row] of rows.entries()) {
        if (index % PAGE === 0) {
          page = document.createElement("div");
          page.className = "weapon-page";
          track.append(page);
        }
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.weaponId = row.id;
        const name = document.createElement("span"),
          ammo = document.createElement("small");
        const icon = weaponTileIcon(row.id);
        name.textContent = icon.caption;
        b.style.setProperty("--weapon-icon", icon.mask);
        b.dataset.iconFamily = icon.family;
        b.append(name, ammo);
        page.append(b);
        buttons.set(row.id, b);
      }
      track.scrollLeft = Math.min(oldPage, Math.max(0, Math.ceil(rows.length / PAGE) - 1)) * STEP;
      order = next;
    }
    for (const row of rows) {
      const b = buttons.get(row.id),
        control = document.getElementById(row.control);
      // An empty tile stays tappable so the tap can explain why it will not equip.
      const tellsEmpty = row.empty && !row.active && !selecting && !!control?.disabled;
      b.disabled = (row.companion || !row.active) && (selecting || !control || control.disabled) && !tellsEmpty;
      b.setAttribute("aria-pressed", String(row.active));
      b.setAttribute(
        "aria-label",
        fillText(GEAR_TEXT.tileLabel, { name: row.name, ammo: row.ammo }) + (row.active ? GEAR_TEXT.equippedSuffix : GEAR_TEXT.tapToEquip),
      );
      const ammo = b.querySelector("small");
      ammo.hidden = row.ammo === GEAR_TEXT.ammoMelee;
      ammo.textContent = ammo.hidden ? "" : row.ammo.replace(GEAR_TEXT.fuelSuffix, "%");
    }
    const active = rows.find((r) => r.active);
    current.textContent = active ? fillText(GEAR_TEXT.tileLabel, { name: active.name, ammo: active.ammo }) : GEAR_TEXT.weaponSelection;
    hint();
  }
  return {
    update,
    dispose() {
      disposed = true;
      for (const remove of listeners) remove();
      track.replaceChildren();
      root.hidden = true;
    },
  };
}
