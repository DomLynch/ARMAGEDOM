// Selected-ID domain operation only. Existing helpers own eligibility; Core owns IO.
// Injection avoids a second resource ledger or a dependency on the browser bootstrap.
export function createPickupOperation({
  getRun,
  collectSupply,
  collectVest,
  vestRules,
  vestBagPosition,
  canCollectGear = () => false,
  collectGearSupply,
  gearItems = [],
  grantPistol,
  grantVest,
}) {
  if ([getRun, collectSupply, collectVest].some((fn) => typeof fn !== "function") || !vestRules?.itemId)
    throw Error("Missing pickup domain dependency");
  const deny = (code) => ({ ok: false, code, events: [] });
  return (command, context) => {
    if (command?.type !== "claimPickup" || typeof command.pickupId !== "string") return deny("invalid-command");
    const g = getRun();
    if (!g || g.runSaveInvalid || g.finished) return deny("not-eligible");
    const id = command.pickupId;
    if (id === vestRules.itemId) {
      if (g.vest?.equipped) return deny("already-collected");
      const r = collectVest(g.vest, {
        supplies: g.supplies,
        supplyRules: g.lootRules,
        areaId: g.world.areaId,
        position: g.player.pos,
        bagPosition: vestBagPosition,
        hp: g.player.hp,
        lineClear: (a, b) => g.world.lineClear(a, b),
      });
      if (!r.equipped) return deny("not-eligible");
      if (!context.writeRun({ ...g, vest: r.state })) return deny("storage-unavailable");
      g.vest = r.state;
      return { ok: true, changed: true, events: [{ type: "vest-pickup", itemId: id }] };
    }
    if (g.supplies?.collected.includes(id)) return deny("already-collected");
    if (!g.supplies?.pending.some((drop) => drop.id === id)) return deny("invalid-command");
    const drop = g.supplies.pending.find((d) => d.id === id);
    if (gearItems.includes(drop.kind)) {
      const r = collectGearSupply(g.supplies, {
        dropId: id,
        areaId: g.world.areaId,
        position: g.player.pos,
        hp: g.player.hp,
        pistolOwned: g.pistol.collected,
        vestEquipped: g.vest.equipped,
        lineClear: (a, b) => g.world.lineClear(a, b),
        rules: g.lootRules,
        canAct: canCollectGear(g),
      });
      if (!r.award) return deny("not-eligible");
      const pistol = drop.kind === gearItems[0] ? grantPistol(g.pistol).state : g.pistol;
      const vest = drop.kind === gearItems[1] ? grantVest(g.vest).state : g.vest;
      const candidate = {
        ...g,
        pistol,
        vest,
        player: { ...g.player, weapon: pistol.equipped ? "pistol" : "knife" },
        supplies: r.state,
      };
      if (!context.writeRun(candidate)) return deny("storage-unavailable");
      g.pistol = pistol;
      g.vest = vest;
      g.player.weapon = candidate.player.weapon;
      g.supplies = r.state;
      return {
        ok: true,
        changed: true,
        events: [
          { type: "supply-pickup", ...r.award },
          ...(drop.kind === gearItems[0]
            ? [
                { type: "pickup", itemId: drop.kind },
                { type: "equip", itemId: drop.kind },
              ]
            : [{ type: "vest-pickup", itemId: drop.kind }]),
        ],
      };
    }
    const r = collectSupply(g.supplies, {
      dropId: id,
      areaId: g.world.areaId,
      position: g.player.pos,
      rules: g.lootRules,
      resources: { hp: g.player.hp, maxHP: g.player.maxHP, pistolOwned: g.pistol.collected, reserve: g.pistol.reserve },
      lineClear: (a, b) => g.world.lineClear(a, b),
    });
    if (!r.award) return deny("not-eligible");
    const candidate = {
      ...g,
      player: { ...g.player, hp: r.resources.hp },
      pistol: { ...g.pistol, reserve: r.resources.reserve },
      supplies: r.state,
    };
    if (!context.writeRun(candidate)) return deny("storage-unavailable");
    g.player.hp = r.resources.hp;
    g.pistol.reserve = r.resources.reserve;
    g.supplies = r.state;
    return { ok: true, changed: true, events: [{ type: "supply-pickup", ...r.award }] };
  };
}
