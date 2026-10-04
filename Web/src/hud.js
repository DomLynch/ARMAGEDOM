export function createHUD({ onRetry, onPause, onSound, onExplore = () => {}, onPistol = () => {} }) {
  const el = (id) => document.getElementById(id),
    menu = el("menu");
  let loaded = false,
    sound = true;
  function pause() {
    onPause(menu.open || document.hidden);
    document.body.classList.toggle("menu-open", menu.open);
  }
  function resize() {
    pause();
  }
  function toggleMenu() {
    if (!loaded) return;
    if (menu.open) menu.close();
    else menu.showModal();
    pause();
  }
  for (const id of ["resume", "close-menu"])
    el(id).onclick = () => menu.close();
  menu.addEventListener("close", pause);
  menu.addEventListener("cancel", pause);
  el("menu-button").onclick = toggleMenu;
  el("retry").onclick = () => {
    menu.close();
    onRetry();
  };
  el("again").onclick = onRetry;
  el("pistol-interact").onclick = onPistol;
  el("explore").onclick = onExplore;
  el("sound").onclick = () => {
    sound = !sound;
    el("sound").textContent = sound ? "Sound on" : "Sound off";
    el("sound").setAttribute("aria-pressed", String(sound));
    onSound(sound);
  };
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", pause);
  resize();
  let lastMessage = "",
    lastStaminaState = null, lastPistolEquipped = null;
  return {
    toggleMenu,
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
      el("enter").textContent = "Retry loading";
      el("loading").textContent = message;
    },
    update(g) {
      const p = g.player,
        donor = g.pilot === "donor-knife";
      el("health-fill").style.width = `${(p.hp / p.maxHP) * 100}%`;
      el("health-number").textContent = `${Math.ceil(p.hp)} / ${p.maxHP}`;
      const maximum =
        Number.isFinite(p.maxStamina) && p.maxStamina > 0 ? p.maxStamina : 100;
      const rawStamina = p.stamina ?? p.guard;
      const stamina = Math.min(
        maximum,
        Math.max(0, Number.isFinite(rawStamina) ? rawStamina : 0),
      );
      const exhausted = p.exhausted === true;
      const unaffordable = (id) => {
        const cost = g.staminaCosts?.[id];
        return id === "guard"
          ? stamina <= 0 || exhausted
          : Number.isFinite(cost) && cost > 0 && (stamina < cost || exhausted);
      };
      const low =
        stamina <= 0 ||
        ["slash", "stab", "heavy", "special", "dodge"].some(unaffordable);
      const staminaState = exhausted
        ? "EXHAUSTED"
        : p.guardBrokenUntil > g.time
          ? "GUARD BROKEN"
          : low
            ? "LOW"
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
      for (const id of [
        "slash",
        "stab",
        "heavy",
        "special",
        "dodge",
        "guard",
      ]) {
        const button = el(id),
          lowEnergy = unaffordable(id);
        button.classList.toggle("low-energy", lowEnergy);
        button.setAttribute(
          "aria-label",
          `${id}${lowEnergy ? " · Low stamina" : ""}`,
        );
        if (id === "slash" || id === "stab")
          button.querySelector("small").textContent = "";
      }
      const area = (g.world?.areaId ?? "westminster").toUpperCase();
      el("menu-area").textContent = `${area} · LONDON 2030`;
      el("objective").textContent =
        g.world?.areaId && g.world.areaId !== "westminster"
          ? `${area} · EXPLORING`
          : g.encounterCleared
            ? `${area} · CLEARED · EXPLORE LONDON`
            : donor
              ? `WESTMINSTER · ${g.encounter ? "HOLLOW SCAVENGERS" : "GOBLIN ENCOUNTER"} · ${g.enemies.length} HOSTILES`
              : `WESTMINSTER · WAVE ${g.wave} / 3 · ${g.enemies.length} HOSTILES`;
      const message = g.time < g.messageUntil ? g.message : "";
      if (message !== lastMessage) {
        el("notice").textContent = message;
        lastMessage = message;
      }
      for (const [id, ready, fallback] of [
        ["heavy", p.heavyReady, 1.6],
        ["special", p.specialReady, 7],
        ["dodge", p.dodgeReady, 1.05],
      ]) {
        const button = el(id),
          left = Math.max(0, ready - g.time),
          period = donor ? (g.cooldowns?.[id] ?? fallback) : fallback;
        button.classList.toggle("cooldown", left > 0);
        // Heavy has no extra cooldown in the pilot; its commitment is combat-owned.
        button.style.setProperty(
          "--ready",
          String(period > 0 ? 1 - left / period : 1),
        );
        button.querySelector("small").textContent =
          left > 0 ? `${left.toFixed(1)}s` : "";
      }
      el("guard").classList.toggle("pressed", p.guarding);
      const pistol=g.pistol;
      if(pistol){
        const equipped=pistol.equipped;
        if(equipped!==lastPistolEquipped){
          for(const [id,label] of Object.entries(equipped?{slash:'FIRE / AIM',stab:'RELOAD',heavy:'MELEE',special:'UNAVAILABLE',guard:'UNAVAILABLE'}:{slash:'SLASH',stab:'STAB',heavy:'HEAVY',special:'SPECIAL',guard:'GUARD'}))el(id).querySelector('span').textContent=label;
          el('special').disabled=el('guard').disabled=equipped;lastPistolEquipped=equipped;
        }
        el('ammo').hidden=!equipped;
        el('ammo').textContent=`PISTOL · ${pistol.magazine} / 6 · ${pistol.reserve} RESERVE${pistol.reloadingUntil?' · RELOADING':''}`;
        el('slash').querySelector('small').textContent=equipped?`${pistol.magazine}/6`:'';
        el('stab').querySelector('small').textContent=equipped&&pistol.reloadingUntil?`${Math.max(0,pistol.reloadingUntil-g.time).toFixed(1)}s`:'';
        if(equipped){el('heavy').querySelector('small').textContent='';el('heavy').classList.toggle('cooldown',false);for(const id of ['slash','stab','heavy']){el(id).classList.toggle('low-energy',id==='slash'&&!pistol.magazine);el(id).setAttribute('aria-label',id==='slash'?'Fire and aim':id==='stab'?'Reload':'Switch to melee');}}
        const nearby=!pistol.collected&&(g.world.areaId??'westminster')===pistol.pickupAreaId&&Math.hypot(p.pos.x-pistol.pickupPos.x,p.pos.z-pistol.pickupPos.z)<=1.3;
        el('pistol-interact').hidden=g.finished||(!nearby&&(!pistol.collected||equipped));
        el('pistol-interact').textContent=nearby?'PICK UP & EQUIP PISTOL · G':'EQUIP PISTOL · G';
        const icon=el('pistol-icon');icon.hidden=pistol.collected||(g.world.areaId??'westminster')!==pistol.pickupAreaId;
        if(!icon.hidden&&g.world.camera){const at=g.world.toRender(pistol.pickupPos,.65).project(g.world.camera);icon.style.left=`${(at.x+1)*innerWidth/2}px`;icon.style.top=`${(1-at.y)*innerHeight/2}px`;}
      }
      const boss = g.enemies.find((e) => e.kind === 3);
      el("boss").hidden = !boss;
      if (boss)
        el("boss-fill").style.width = `${(boss.hp / boss.maxHP) * 100}%`;
      el("ending").hidden = !g.finished;
      el("explore").hidden = !g.finished || !g.won;
      if (g.finished) {
        el("result").textContent = g.won
          ? "CHECKPOINT CLEARED"
          : "THE ASH CLAIMS YOU";
        el("result-hint").textContent = g.won
          ? donor
            ? g.encounter ? "The three Hollow scavengers have fallen." : "The Goblin has fallen."
            : "The warlord has fallen."
          : "Watch their wind-up. Dodge, then strike.";
      }
    },
  };
}
