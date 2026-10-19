import{selectedBossRanged}from'./engine/boss-weapon-runtime.js';
import{bossExitGate}from'./engine/area-bosses.js';
import{createMenuTabs}from'./menu-tabs.js';
import {selectedPistolProfile} from './engine/expedition-core.js';
import {pilotBonuses,DEFAULT_ATTRIBUTES} from './engine/progression-rules.js';
import {PISTOL_RULES} from './pistol.js';
import {vestAvailable} from './vest.js';
export function createHUD({ onRetry, onReset=async()=>({ok:false}), onPause, onSound, onPistol = () => {}, onFeedback = () => {}, onAssist = () => {} }) {
  const el = (id) => document.getElementById(id),
    menu = el("menu");
  const listeners=[];
  function listen(target,type,handler){target.addEventListener(type,handler);listeners.push(()=>target.removeEventListener?.(type,handler));}
  let loaded = false,
    sound = true, resetBusy=false;
  const menuTabs=createMenuTabs(el,{canSelect:()=>!resetBusy});
  function pause() {
    onPause(menu.open || document.hidden);
    document.body.classList.toggle("menu-open", menu.open);
  }
  function resize() {
    pause();
  }
  function toggleMenu() {
    if (!loaded||resetBusy) return;
    if (menu.open) menu.close();
    else menu.showModal();
    pause();
  }
  for (const id of ["resume", "close-menu"])
    el(id).onclick = () => {if(!resetBusy)menu.close();};
  listen(menu,"close", pause);
  listen(menu,"cancel", pause);
  el("menu-button").onclick = toggleMenu;
  el("retry").onclick = () => {
    if(resetBusy)return;menu.close();
    onRetry();
  };
  const resetPanel=el('reset-confirmation'),resetStatus=el('reset-status'),confirmReset=el('confirm-reset'),cancelReset=el('cancel-reset'),resetButton=el('reset-game');resetPanel.hidden=true;
  resetButton.onclick=()=>{if(!loaded||resetBusy)return;resetPanel.hidden=false;resetStatus.textContent='';};
  cancelReset.onclick=()=>{if(!resetBusy){resetPanel.hidden=true;resetStatus.textContent='';}};
  listen(menu,'cancel',event=>{if(resetBusy)event.preventDefault();});
  confirmReset.onclick=async()=>{
    if(resetBusy||resetPanel.hidden)return;resetBusy=true;confirmReset.disabled=cancelReset.disabled=resetButton.disabled=true;resetStatus.textContent='Starting fresh…';
    let result;try{result=await onReset();}catch{result={ok:false,message:'Reset failed. Your current run was kept.'};}
    if(!loaded)return;resetStatus.textContent=result?.message??'Reset failed. Your current run was kept.';
    if(!result?.ok){resetBusy=false;confirmReset.disabled=cancelReset.disabled=resetButton.disabled=false;}
  };
  el("again").onclick = onRetry;
  el("pistol-interact").onclick = onPistol;
  el("sound").onclick = () => {
    sound = !sound;
    el("sound").textContent = sound ? "Sound on" : "Sound off";
    el("sound").setAttribute("aria-pressed", String(sound));
    onSound(sound);
  };
  let assist=true;el("assist").onclick=()=>{assist=!assist;el("assist").textContent=assist?"Assist: 100%":"Assist: Off";el("assist").setAttribute("aria-pressed",String(assist));onAssist(assist);};
  const feedback=el('feedback-mode');
  feedback.onchange=()=>onFeedback(feedback.value);
  listen(window,"resize", resize);
  listen(document,"visibilitychange", pause);
  const handlers=['resume','close-menu','menu-button','retry','reset-game','confirm-reset','cancel-reset','again','pistol-interact','sound','assist'].map(id=>({element:el(id),key:'onclick',handler:el(id).onclick}));handlers.push({element:feedback,key:'onchange',handler:feedback.onchange});
  resize();
  let lastMessage = "",
    lastStaminaState = null,lastRifleEquipped=null,lastBossWeapon=null, lastPistolEquipped = null, lastFlameEquipped=false;
  return {
    dispose(){loaded=false;menuTabs.dispose();for(const remove of listeners.splice(0))remove();for(const row of handlers)if(row.element[row.key]===row.handler)row.element[row.key]=null;},
    toggleMenu,
    get menuPage(){return menuTabs.current;},
    showMenuPage(id){if(!loaded||resetBusy)return false;const selected=menuTabs.select(id);if(selected&&!menu.open)toggleMenu();return selected;},
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
        if(g.weaponsLowered&&id!=='dodge')return true;
        const cost = g.staminaCosts?.[id];
        return id === "guard"
          ? stamina <= 0 || exhausted
          : Number.isFinite(cost) && cost > 0 && (stamina < cost || exhausted);
      };
      const low =
        stamina <= 0 ||
        ["slash", "stab", "heavy", "dodge"].some(unaffordable);
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
        "dodge",
        "guard",
      ]) {
        const button = el(id),
          lowEnergy = unaffordable(id);
        button.classList.toggle("low-energy", lowEnergy);
        button.setAttribute(
          "aria-label",
          `${id === "dodge" ? "Dodge Roll" : id}${lowEnergy ? " · Low stamina" : ""}`,
        );
        if (id === "slash" || id === "stab" || id === "guard")
          button.querySelector("small").textContent = "";
      }
      const area = (g.world?.areaId ?? "westminster").toUpperCase();
      el("menu-area").textContent = `${area} · LONDON 2030`;
      // The existing story line owns next-step guidance; this line keeps region
      // status. Actual crossing checks and transient warnings remain unchanged.
      const story=!!g.world?.safehouseData,exitGate=story?null:bossExitGate(g);
      el("objective").textContent = exitGate&&!exitGate.allowed ? `${area} · ${exitGate.message}` : g.encounterCleared
        ? `${area} · CLEARED${story?'':' · EXPLORE LONDON'}`
        : donor
          ? `${area} · ${g.encounter ? "HOLLOW SCAVENGERS" : "GOBLIN ENCOUNTER"} · ${g.enemies.length} HOSTILES`
          : `${area} · WAVE ${g.wave} / 3 · ${g.enemies.length} HOSTILES`;
      const progression=g.progression,model=g.progressionModel;
      el('mastery').hidden=!model;el('progression-panel').hidden=!model;
      if(model){
        const weapon=p.weapon==='pistol'?'westminster-start-pistol-v1':'knife',label=weapon==='knife'?'KNIFE':'PISTOL';
        const bonus=id=>Math.round((pilotBonuses(g.world.progressionData,DEFAULT_ATTRIBUTES,id,progression.proficiency[id]).damageMultiplier-1)*1000)/10;
        el('mastery').textContent=['rifle','shotgun','grenade','rocket'].includes(p.weapon)?`${p.weapon.toUpperCase()} · no mastery bonus`:`${label} MASTERY ${progression.proficiency[weapon]}/100 · +${bonus(weapon)}% damage`;
        el('progression-attributes').textContent=Object.entries(progression.attributes).map(([id,value])=>`${id[0].toUpperCase()+id.slice(1)} ${value}`).join(' · ')+'. Intelligence has no effect in this pilot.';
        el('progression-weapons').textContent=`Knife ${progression.proficiency.knife}/100 (+${bonus('knife')}% mastery damage) · Pistol ${progression.proficiency['westminster-start-pistol-v1']}/100 (+${bonus('westminster-start-pistol-v1')}% mastery damage). Combined damage bonus: +${(['rifle','shotgun','grenade','rocket'].includes(p.weapon)?0:Math.round((model.bonuses(progression,weapon).damageMultiplier-1)*1000)/10)}%.`;
      }
      const vestNotice = !g.finished && p.hp > 0
        ? g.vest?.equipped
          ? "VEST EQUIPPED · 10% protection"
          : g.world?.areaId === "westminster" && vestAvailable(g.vest, g.supplies,g.lootRules)
            ? "VEST BY PISTOL STASH · Walk near to equip"
            : ""
        : "";
      const message = g.time < g.messageUntil ? g.message : (g.world?.exitHint?.(p.pos) || vestNotice);
      if (message !== lastMessage) {
        el("notice").textContent = message;
        lastMessage = message;
      }
      for (const [id, ready, fallback] of [
        ["heavy", p.heavyReady, 1.6],
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
      const flameEquipped=!!g.flame?.equipped;for(const id of ['stab','heavy'])el(id).hidden=flameEquipped;if(flameEquipped!==lastFlameEquipped){lastPistolEquipped=null;lastFlameEquipped=flameEquipped;}
      if(!!g.rifle?.selected!==lastRifleEquipped){lastPistolEquipped=null;lastRifleEquipped=!!g.rifle?.selected;}
      const bossWeapon=selectedBossRanged(g);if(bossWeapon!==lastBossWeapon){lastPistolEquipped=null;lastBossWeapon=bossWeapon;}
      const pistol=g.pistol;
      if(pistol){
        const equipped=pistol.equipped;
        if(equipped!==lastPistolEquipped){
          for(const [id,label] of Object.entries(equipped?{slash:'FIRE',stab:'RELOAD',heavy:'MELEE',guard:'NO GUARD'}:{slash:'SLASH',stab:'STAB',heavy:'HEAVY',guard:'GUARD'}))el(id).querySelector('span').textContent=label;
          el('guard').disabled=equipped;if(!equipped)el('guard').setAttribute('aria-label','Guard');lastPistolEquipped=equipped;
        }
        if(equipped){el('guard').setAttribute('aria-label','Guard unavailable with pistol');}
        el('ammo').hidden=!equipped;
        el('ammo').textContent=`${(selectedPistolProfile(g).name??'PISTOL').toUpperCase()} · ${pistol.magazine} / 6 · ${pistol.reserve} RESERVE${pistol.reloadingUntil?' · RELOADING':''}`;
        const fireLeft=Math.max(0,pistol.nextFireAt-g.time);
        el('slash').classList.toggle('pistol-aim',equipped);
        el('slash').classList.toggle('cooldown',equipped&&fireLeft>0);
        el('slash').style.setProperty('--ready',String(equipped?1-Math.min(1,fireLeft/PISTOL_RULES.cadence):1));
        el('slash').querySelector('small').textContent=equipped?`${pistol.magazine}/${PISTOL_RULES.capacity}`:'';
        el('stab').querySelector('small').textContent=equipped&&pistol.reloadingUntil?`${Math.max(0,pistol.reloadingUntil-g.time).toFixed(1)}s`:'';
        if(equipped){el('heavy').querySelector('small').textContent='';el('heavy').classList.toggle('cooldown',false);for(const id of ['slash','stab','heavy']){el(id).classList.toggle('low-energy',id==='slash'&&!pistol.magazine);el(id).setAttribute('aria-label',id==='slash'?`Fire; ${pistol.magazine} of ${PISTOL_RULES.capacity} loaded, ${pistol.reserve} reserve${pistol.reloadingUntil?'; reloading':''}; left stick aims, Fire only shoots, mouse aims on desktop`:id==='stab'?'Reload':'Switch to melee');}}
        const nearby=!pistol.collected&&(g.world.areaId??'westminster')===pistol.pickupAreaId&&Math.hypot(p.pos.x-pistol.pickupPos.x,p.pos.z-pistol.pickupPos.z)<=1.3;
        el('pistol-interact').hidden=g.finished||(!nearby&&(!pistol.collected||equipped));
        el('pistol-interact').textContent=nearby?'PICK UP & EQUIP PISTOL · G':'EQUIP PISTOL · G';
        el('pistol-icon').hidden=true;

      }
      if(g.rifle?.selected&&!flameEquipped){
        const rifle=g.rifle,rules=g.world.rifleData.rules,clock=g.rifleAction??{},left=Math.max(0,(clock.nextFireAt??0)-g.time);
        for(const[id,text]of Object.entries({slash:'FIRE',stab:'RELOAD',heavy:'MELEE',guard:'NO GUARD'}))el(id).querySelector('span').textContent=text;
        el('guard').disabled=true;el('guard').setAttribute('aria-label','Guard unavailable with rifle');el('ammo').hidden=false;el('ammo').textContent=`RIFLE · ${rifle.magazine}/${rules.capacity} · ${rifle.reserve} RESERVE${clock.reloadingUntil?' · RELOADING':''}`;
        for(const id of ['slash','stab','heavy']){el(id).classList.toggle('low-energy',false);el(id).classList.toggle('cooldown',id==='slash'&&left>0);el(id).querySelector('small').textContent=id==='slash'?`${rifle.magazine}/${rules.capacity}`:id==='stab'&&clock.reloadingUntil?`${Math.max(0,clock.reloadingUntil-g.time).toFixed(1)}s`:'';}
        el('slash').classList.toggle('pistol-aim',true);el('slash').style.setProperty('--ready',String(1-Math.min(1,left/rules.cadence)));el('slash').setAttribute('aria-label',`Fire rifle once; ${rifle.magazine} loaded and ${rifle.reserve} reserve`);el('stab').setAttribute('aria-label','Reload rifle');
      }
      if(bossWeapon&&!flameEquipped){
        const state=g.bossEquipment[bossWeapon],data=g.world.bossEquipmentData[bossWeapon],clock=g.bossEquipmentAction?.[bossWeapon]??{},left=Math.max(0,(clock.nextFireAt??0)-g.time),grenade=bossWeapon==='grenade',rocket=bossWeapon==='rocketLauncher',capacity=data.rules.capacity;
        for(const[id,text]of Object.entries({slash:grenade?'THROW':'FIRE',stab:grenade?'RANGE':'RELOAD',heavy:'MELEE',guard:grenade?'MODE':'NO GUARD'}))el(id).querySelector('span').textContent=text;
        el('guard').disabled=!grenade;el('guard').setAttribute('aria-label',grenade?'Switch grenade mode; '+(g.grenadeMode==='sticky'?'Sticky':'Standard')+' selected':'Guard unavailable with '+data.name);if(grenade){el('guard').classList.remove('low-energy','cooldown','pressed');el('guard').querySelector('small').textContent=g.grenadeMode==='sticky'?'STICKY':'STANDARD';}el('ammo').hidden=false;el('ammo').textContent=grenade?`${g.grenadeMode==='sticky'?'STICKY':'STANDARD'} GRENADES · ${state.magazine} LEFT · 1s FUSE`:`${rocket?'ROCKET':'SHOTGUN'} · ${state.magazine}/${capacity} · ${state.reserve} RESERVE${clock.reloadingUntil?' · RELOADING':''}`;
        for(const id of ['slash','stab','heavy']){el(id).classList.toggle('low-energy',id==='slash'&&state.magazine===0);el(id).classList.toggle('cooldown',id==='slash'&&left>0);el(id).querySelector('small').textContent=id==='slash'?grenade?`${state.magazine} left`:`${state.magazine}/${capacity}`:id==='stab'?grenade?`${g.grenadeThrowRange??5}m`:clock.reloadingUntil?`${Math.max(0,clock.reloadingUntil-g.time).toFixed(1)}s`:'':'';}
        el('slash').classList.toggle('pistol-aim',true);el('slash').style.setProperty('--ready',String(1-Math.min(1,left/data.rules.cadence)));el('slash').setAttribute('aria-label',grenade?`Throw one grenade; ${state.magazine} left`:`Fire ${rocket?'rocket':'shotgun'} once; ${state.magazine} loaded`);el('stab').setAttribute('aria-label',grenade?'Cycle touch throw range: 3, 5 or 8 metres':rocket?'Reload rocket launcher':'Reload shotgun');
      }
      if(flameEquipped){
        const percent=Math.ceil(g.flameFuel.fuelUnits/g.world.flameData.capacity*100);el('ammo').hidden=false;el('ammo').textContent=`EMBER · FUEL ${percent}%`;
        for(const[id,text]of Object.entries({slash:'FLAME',stab:'RETURN',heavy:'RETURN',guard:'NO GUARD'}))el(id).querySelector('span').textContent=text;
        el('guard').disabled=true;el('guard').setAttribute('aria-label','Guard unavailable with flamethrower');
        for(const id of ['slash','stab','heavy']){el(id).classList.toggle('cooldown',false);el(id).classList.toggle('low-energy',false);el(id).querySelector('small').textContent=id==='slash'?`${percent}%`:'';el(id).setAttribute('aria-label',id==='slash'?`Hold to fire flamethrower; fuel ${percent} percent`:'Return to normal weapon');}
        el('slash').classList.toggle('pistol-aim',true);el('slash').style.setProperty('--ready','1');
      }
      const boss = g.enemies.find((e) => e.kind === 3);
      el("boss").hidden = !boss;
      if (boss)
        el("boss-fill").style.width = `${(boss.hp / boss.maxHP) * 100}%`;
      el("ending").hidden = !g.finished || g.player.hp > 0;
      if (g.finished && g.player.hp <= 0) {
        el("result").textContent = "THE ASH CLAIMS YOU";
        el("result-hint").textContent = g.runSaveInvalid ? "Saved run invalid. Retry to start fresh." : "Watch their wind-up. Dodge, then strike.";
      }

      el('safehouse-status').hidden=!g.weaponsLowered;
      if(g.weaponsLowered){el('ammo').hidden=false;el('ammo').textContent='SAFEHOUSE · WEAPONS LOWERED';}

    },
  };
}
