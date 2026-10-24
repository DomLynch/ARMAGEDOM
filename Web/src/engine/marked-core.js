import { closedData } from "./progression-state.js";
import { freshMarked, validMarked, copyMarked, markedShopEligible } from "./marked.js";
import { safehouseInteraction } from "./safehouse.js";
import { LOCKER_RESOURCE_RULES } from "./locker-state.js";
export const MARKED_SAVE_KEY = "armagedom:marked-run:v18";
const same = (a, b) => a.version === b.version && a.carried === b.carried && a.bank === b.bank && a.bounty === b.bounty;
const fail = (code) => ({ ok: false, code, events: [] });
// One passive envelope over Hub17. Existing progression owns kill credit and
// existing inventory codecs own ammo/HP; all sides commit through Core once.
export function createMarkedComponent({ base, getRun, getAction = () => null, canDispatch = () => false }) {
  if (base?.codec.RUN_SAVE_KEY !== "armagedom:central-hub-run:v17") throw TypeError("Marked requires Hub17");
  let legacy = false;
  const state = (g) => g.marked ?? freshMarked(),
    rules = () => getRun().world.markedData;
  const codec = {
    RUN_SAVE_KEY: MARKED_SAVE_KEY,
    get PISTOL_SAVE_KEY() {
      return base.codec.PISTOL_SAVE_KEY;
    },
    encodeRun(g) {
      if (!validMarked(state(g), rules().maxMoney)) throw TypeError("Invalid Marked envelope");
      const old = JSON.parse(base.codec.encodeRun(g));
      if (old.version !== 17) throw TypeError("Unexpected Marked foundation");
      return JSON.stringify({ ...old, version: 18, marked: copyMarked(state(g)) });
    },
    restoreRun(g, raw, previous) {
      const older = legacy;
      legacy = false;
      try {
        if (older) {
          const saved = base.codec.restoreRun(g, raw, previous);
          return saved ? { ...saved, marked: freshMarked() } : null;
        }
        const data = JSON.parse(raw);
        if (!data || data.version !== 18 || !validMarked(data.marked, rules().maxMoney)) return null;
        const old = { ...data, version: 17 };
        delete old.marked;
        const saved = base.codec.restoreRun(g, JSON.stringify(old), null);
        return saved ? { ...saved, marked: copyMarked(data.marked) } : null;
      } catch {
        return null;
      }
    },
    captureRunState: (g) => ({ base: base.codec.captureRunState(g), marked: copyMarked(state(g)) }),
    isRunStateUnchanged: (g, s) => same(state(g), s.marked) && base.codec.isRunStateUnchanged(g, s.base),
  };
  function wrapDomain(execute) {
    return (command, context) => {
      const g = getRun();
      if (!g || !validMarked(state(g), rules().maxMoney)) return fail("invalid-save");
      const before = copyMarked(state(g)),
        oldAwards = new Set((g.progression?.awards ?? []).map((a) => a.placementKey)),
        action = command.type === "save" ? getAction(g) : null;
      if (
        action &&
        (!canDispatch(g) ||
          !safehouseInteraction(g) ||
          g.runSaveInvalid ||
          g.player.hp <= 0 ||
          g.finished ||
          g.player.swing ||
          g.time < (g.player.ready ?? 0) ||
          g.time < (g.player.hurtUntil ?? 0) ||
          g.time < (g.player.dodgeUntil ?? 0))
      )
        return fail("not-eligible");
      if (action && !closedData(action, action.type === "bank" ? ["type"] : ["type", "itemId"]))
        return fail("invalid-command");
      if (
        action &&
        ((action.type === "bank" && (!before.carried || before.bank + before.carried > rules().maxMoney)) ||
          (action.type === "buy" && !markedShopEligible(g, action.itemId)))
      )
        return fail("not-eligible");
      let committed = null,
        earned = 0;
      const result = execute(command, {
        ...context,
        writeRun(candidate) {
          if (command.type !== "retry" && candidate.marked !== undefined && !same(candidate.marked, before))
            return false;
          const next = { ...candidate },
            money = copyMarked(before),
            config = rules();
          earned = 0;
          if (command.type === "retry") {
            next.pistol = g.pistol?.collected ? { ...g.pistol, reloadingUntil: 0, nextFireAt: 0 } : candidate.pistol;
            next.vest = { ...g.vest }; // Retain the existing supply provenance required by earned armour validation.
            if (g.vest?.equipped) next.supplies = structuredClone(g.supplies);
            if (next.pistol?.equipped) next.player = { ...next.player, weapon: "pistol" };
          }
          if (command.type === "retry" || candidate.player.hp <= 0) {
            money.carried = 0;
            money.bounty = 0;
          } else
            for (const row of candidate.progression?.awards ?? []) {
              if (oldAwards.has(row.placementKey)) continue;
              const boss = g.world.bossData?.placements.some(
                  (p) => p.key === row.placementKey && p.areaId === row.areaId,
                ),
                amount = boss ? config.bossCash : config.cashPerKill;
              money.carried = Math.min(config.maxMoney, money.carried + amount);
              if (config.bounty !== false) money.bounty = Math.min(config.maxMoney, money.bounty + amount);
              earned += amount;
            }
          if (action) {
            if (action.type === "bank") {
              if (!money.carried || money.bank + money.carried > config.maxMoney) return false;
              money.bank += money.carried;
              money.carried = 0;
            } else if (action.type === "buy") {
              const row = config.shop[action.itemId];
              if (!row || money.bank < row.price) return false;
              if (action.itemId === "pistol") {
                if (
                  !next.pistol?.collected ||
                  next.pistol.reserve + row.amount > LOCKER_RESOURCE_RULES["pistol-reserve"].carryCap
                )
                  return false;
                next.pistol = { ...next.pistol, reserve: next.pistol.reserve + row.amount };
              } else if (action.itemId === "rifle") {
                if (
                  next.rifle?.status !== "owned" ||
                  next.rifle.reserve + row.amount > LOCKER_RESOURCE_RULES["rifle-reserve"].carryCap
                )
                  return false;
                next.rifle = { ...next.rifle, reserve: next.rifle.reserve + row.amount };
              } else if (action.itemId === "dressing") {
                if (next.player.hp >= next.player.maxHP) return false;
                next.player = { ...next.player, hp: Math.min(next.player.maxHP, next.player.hp + row.amount) };
              }
              money.bank -= row.price;
            } else return false;
          }
          next.marked = money;
          if (!context.writeRun(next)) return false;
          committed = next;
          return true;
        },
      });
      // Inner owners may publish their normal callbacks after IO; apply this one
      // committed bank/resource proposal last, never before a successful write.
      if (result.ok && committed) {
        const current = getRun();
        current.marked = copyMarked(committed.marked);
        if (action || command.type === "retry") {
          current.player.hp = committed.player.hp;
          current.pistol = committed.pistol;
          if (committed.vest) current.vest = committed.vest;
          if (command.type === "retry" && committed.supplies) current.supplies = committed.supplies;
          if (committed.rifle) current.rifle = committed.rifle;
        }
      }
      return result.ok && committed
        ? {
            ...result,
            changed: result.changed || !same(before, committed.marked),
            events: [
              ...result.events,
              ...(earned ? [{ type: "marked-earned", amount: earned }] : []),
              ...(action ? [{ type: "marked-" + action.type, itemId: action.itemId }] : []),
            ],
          }
        : result;
    };
  }
  return {
    codec,
    wrapDomain,
    applySavedRun(g, saved) {
      base.applySavedRun(g, saved);
      g.marked = copyMarked(saved.marked);
    },
    storageAdapter(storage) {
      const b = base.storageAdapter(storage);
      return !b
        ? b
        : {
            getItem(key) {
              if (key !== MARKED_SAVE_KEY) return b.getItem(key);
              legacy = false;
              const raw = b.getItem(key);
              if (raw != null) return raw;
              legacy = true;
              return b.getItem(base.codec.RUN_SAVE_KEY);
            },
            setItem: (key, raw) => b.setItem(key, raw),
          };
    },
  };
}
