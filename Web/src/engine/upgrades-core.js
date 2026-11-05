// The upgrades panel's brain, with no DOM: what the server says the player owns, one purchase at a time against the upgrades adapter
// (engine/upgrades-api.js or a mock with the same shape), and the rows the view draws. The view only reads view().
// Offline-safe: no server answer means a locked panel, never a guess; the last answer is kept in storage so the levels still APPLY offline.
// An order that never reached a verdict keeps its request id, so pressing the button again is a safe replay and can never charge twice.
// Words come from webText.json (upgrades.*); prices and effects from data/safehouseUpgrades.json.
import { GAME_DATA } from "./game-data.js";
import { webText } from "./web-text.js";
import { UPGRADE_ROWS, effectAt, setUpgradeLevels, upgradeLevel, upgradeLevels } from "./upgrades-state.js";

const DATA = GAME_DATA.safehouseUpgrades;
const signedOut = (code) => DATA.api.signedOutErrors.includes(code);
const errorText = (code) =>
  webText(
    Object.hasOwn(GAME_DATA.webText.texts, `upgrades.error.${code}`)
      ? `upgrades.error.${code}`
      : "upgrades.error.refused",
  );

// On unless the data switches it off or the URL carries the off switch (improvements ship default-on).
export const upgradesOn = (search = globalThis.location?.search ?? "", enabled = DATA.enabled) =>
  enabled && new URLSearchParams(search).get(DATA.offParam) !== DATA.offValue;

/** "Spare magazines +2" for a row at a level; level 0 reads "none yet". */
export function effectText(row, level) {
  if (level <= 0) return webText("upgrades.none");
  const value = effectAt(row, level);
  return webText(`upgrades.effect.${row.effect.kind}`, {
    amount: row.effect.kind === "dodgeRecovery" ? Math.round(value * DATA.percentScale) : value,
  });
}

// The levels of the last server answer, kept so the effects still apply with no connection. Storage may be missing or full: never fatal.
export function readCachedLevels(storage) {
  try {
    const raw = storage?.getItem(DATA.cacheKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function cacheLevels(storage) {
  try {
    storage?.setItem(DATA.cacheKey, JSON.stringify(upgradeLevels()));
  } catch {
    /* a full or blocked storage only loses the offline copy */
  }
}

// api: () => adapter | null (null = the server cannot be reached at all); isGuest: () => bool; localCash: () => number | null (carried + banked);
// onCash(delta): the run's cash moves by the purchase's signed delta (the server settled the price, the phone applies the change).
export function createUpgradesController({
  api,
  isGuest,
  localCash = () => null,
  onCash = () => {},
  newId = () => globalThis.crypto.randomUUID(),
  onChange = () => {},
  now = Date.now,
  storage = null,
  enabled = DATA.enabled,
}) {
  let phase = enabled ? "idle" : "closed",
    closedGuest = false,
    serverCash = null,
    busy = false,
    message = null,
    pending = null, // { key, id } of an order that got no verdict
    askedAt = null,
    failedAt = null,
    ticket = 0;
  if (enabled) {
    const cached = readCachedLevels(storage);
    if (cached) setUpgradeLevels(cached);
  }
  const emit = () => onChange(view());
  const cash = () => localCash() ?? serverCash;
  const shut = (guest) => {
    phase = "closed";
    closedGuest = guest;
  };
  function row(spec) {
    const level = upgradeLevel(spec.id),
      maxed = level >= spec.maxLevel,
      price = maxed ? null : spec.prices[level],
      money = cash(),
      poor = price !== null && money !== null && money < price;
    return {
      id: spec.id,
      name: webText(`upgrades.name.${spec.id}`),
      desc: webText(`upgrades.desc.${spec.id}`),
      level,
      max: spec.maxLevel,
      levelText: webText("upgrades.level", { level, max: spec.maxLevel }),
      nowText: webText("upgrades.now", { effect: effectText(spec, level) }),
      nextText: maxed ? "" : webText("upgrades.next", { effect: effectText(spec, level + 1) }),
      price,
      maxed,
      buttonText: maxed
        ? webText("upgrades.maxed")
        : poor
          ? webText("upgrades.tooPoor", { price })
          : webText("upgrades.buy", { price }),
      canBuy: phase === "ready" && !busy && !maxed && !poor,
    };
  }
  function view() {
    const money = cash();
    return {
      phase,
      stateText:
        phase === "closed"
          ? webText(closedGuest ? "upgrades.lockedGuest" : "upgrades.lockedOffline")
          : phase === "loading" || phase === "idle"
            ? webText("upgrades.loading")
            : phase === "offline"
              ? webText("upgrades.lockedOffline")
              : "",
      cashText: money === null ? webText("upgrades.cashUnknown") : webText("upgrades.cash", { amount: money }),
      rows: phase === "ready" ? UPGRADE_ROWS.map(row) : [],
      busy,
      message,
    };
  }
  /** True when an answer is missing or old enough that the next safehouse visit should ask again (and a failed ask has waited its retry time). */
  function due() {
    if (!enabled || phase === "loading" || busy) return false;
    const t = now();
    if (failedAt !== null && t - failedAt < DATA.retryMs) return false;
    return askedAt === null || t - askedAt >= DATA.refreshMs;
  }
  async function refresh() {
    if (!enabled) return;
    const mine = ++ticket,
      server = api();
    if (isGuest()) shut(true);
    else if (!server) shut(false);
    else {
      phase = "loading";
      emit();
      const answer = await server.levels();
      if (mine !== ticket) return;
      if (signedOut(answer.error)) shut(true);
      else if (!answer.ok) {
        phase = "offline";
        failedAt = now();
      } else {
        setUpgradeLevels(answer.levels);
        cacheLevels(storage);
        serverCash = answer.cash === null && answer.bank === null ? null : (answer.cash ?? 0) + (answer.bank ?? 0);
        askedAt = now();
        failedAt = null;
        phase = "ready";
      }
    }
    if (phase === "closed") askedAt = now();
    emit();
  }
  async function buy(id) {
    const spec = UPGRADE_ROWS.find((r) => r.id === id),
      server = api();
    if (busy || phase !== "ready" || !spec) return;
    const level = upgradeLevel(id),
      toLevel = level + 1,
      fail = (code) => {
        message = { kind: "error", text: errorText(code) };
        emit();
      };
    if (level >= spec.maxLevel) return fail("max-level");
    if (!server) return fail("offline");
    if (cash() !== null && spec.prices[level] > cash()) return fail("insufficient-cash");
    const key = `${id}:${toLevel}`,
      requestId = pending?.key === key ? pending.id : newId(),
      mine = ticket;
    pending = { key, id: requestId };
    busy = true;
    message = null;
    emit();
    const reply = await server.buy(id, toLevel, requestId);
    if (reply.ok) {
      setUpgradeLevels(reply.levels);
      cacheLevels(storage);
      if (serverCash !== null) serverCash += reply.delta;
      onCash(reply.delta); // applied even if the panel was closed meanwhile: the server has already settled it
    }
    busy = false;
    if (mine !== ticket) return;
    if (reply.offline) return fail("offline"); // no verdict: the id is kept for the retry
    pending = null;
    if (!reply.ok) {
      if (signedOut(reply.error)) shut(true);
      return fail(reply.error);
    }
    message = {
      kind: "ok",
      text: reply.replayed
        ? webText("upgrades.replayed")
        : webText("upgrades.bought", { name: webText(`upgrades.name.${id}`), level: reply.level }),
    };
    emit();
    if (reply.replayed) refresh(); // a replayed answer carries the first call's snapshot: read the present levels
  }
  return { view, refresh, buy, due, retry: () => phase !== "ready" && refresh() };
}
