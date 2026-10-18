import{selectedPistolProfile}from'./expedition-core.js';
import{selectedMeleeVariant}from'../melee-equipment.js';
import{effectiveWeaponDamage}from'./progression-runtime.js';
import{createFlameView}from'./flame-view.js';
import{stopFlame}from'./flame-runtime.js';
import{createUniqueRewardView}from'../unique-reward-view.js';
import{createBossView}from'./boss-view.js';
import {createExpeditionView} from './expedition-runtime.js';
import {resetMobileControls} from '../combat.js';
import {stepPistol} from '../pistol.js';
import {VEST_BAG_POSITION} from './run-state.js';
import {createRunPersistence} from './run-core.js';
import {createSupplyView} from '../supplies-view.js';
import {createVestBagView} from '../vest-view.js';
import {vestAvailable,VEST_RULES} from '../vest.js';
export function dispatchEquipmentSelection(g,command,allowed,dispatch){const result=dispatch(g,command,allowed);if(result.ok&&(command.type==='equip'||command.type==='selectVariant'))stopFlame(g,{unequip:true});return result;}
export function createRunViews(s){
let storage;if("storage" in s)storage=s.storage;else try{storage=globalThis.localStorage;}catch{storage=null;}
const persistence=createRunPersistence({getRun:()=>s.game,setRun:value=>s.setGame(value),createFreshRun:options=>s.createFreshRun(options),storage});
const bossView=createBossView(s),flameView=createFlameView(s,persistence);
const uniqueView=createUniqueRewardView(s,(g,command,allowed)=>{const result=dispatchEquipmentSelection(g,command,allowed,persistence.dispatchUniqueReward);if(result.ok&&command.type==='equip')resetMobileControls(g);s.updateExpedition?.();return result;});
const expeditionView=createExpeditionView(s,(g,command,allowed)=>{const result=dispatchEquipmentSelection(g,command,allowed,persistence.dispatchExpedition);s.updateExpedition?.();return result;});
let vestBag=null;
function updateVestEquipment(){const node=document.getElementById('vest-state'),g=s.game;if(!node||!g)return;const text=g.vest?.equipped?`Worn vest · ${Math.round(VEST_RULES.reduction*100)}% hit protection`:`No vest · Westminster stash after ${VEST_RULES.requiredKills} kills; pickup equips it.`;if(node.textContent!==text)node.textContent=text;const active=document.getElementById('active-weapon');if(!active)return;let weapon;if(g.flame?.equipped){const data=g.world.flameData;weapon=`Flamethrower · ${Math.ceil(g.flameFuel.fuelUnits/data.capacity*100)}% fuel · ${data.contact.damage} damage per ${data.contact.interval}s contact`;}else if(g.pistol?.equipped){const profile=selectedPistolProfile(g);weapon=`${profile.name??'Starting Pistol'} · ${+effectiveWeaponDamage(g,'westminster-start-pistol-v1',profile.damage).toFixed(1)} damage · ${g.pistol.magazine}/${profile.capacity} loaded · ${g.pistol.reserve} reserve`;}else{const profile=selectedMeleeVariant(g);weapon=`${profile.name} · Slash ${+effectiveWeaponDamage(g,'knife',profile.moves.light_right.damage).toFixed(1)} · Heavy ${+effectiveWeaponDamage(g,'knife',profile.moves.heavy_overhead.damage).toFixed(1)}`;}if(active.textContent!==weapon)active.textContent=weapon;}
function clearVestBag(){vestBag?.dispose();vestBag=null;}
function updateVestBag(){
 const available=!s.contextLost&&!s.traveling&&!s.game.finished&&s.world.areaId==='westminster'&&vestAvailable(s.game.vest,s.game.supplies,s.game.lootRules);
 if(!available){clearVestBag();return;}
 if(!vestBag){vestBag=createVestBagView();s.scene.add(vestBag.root);vestBag.root.position.copy(s.world.toRender(VEST_BAG_POSITION));s.game.message='Supply bag by the pistol stash · Worn vest available.';s.game.messageUntil=s.game.time+4;}
 vestBag.update(s.game.time);
}
const supplyViews=new Map();
function updateSupplies(){
 const drops=s.game?.supplies?.pending.filter(d=>d.areaId===s.world.areaId)??[],ids=new Set(drops.map(d=>d.id));
 for(const [id,v] of supplyViews)if(!ids.has(id)){v.view.dispose();supplyViews.delete(id);}
 for(const drop of drops){let v=supplyViews.get(drop.id);if(v&&v.remaining!==drop.remaining){v.view.dispose();supplyViews.delete(drop.id);v=null;}
  if(!v){v={remaining:drop.remaining,view:drop.kind==='westminster-worn-vest-v1'?createVestBagView():createSupplyView({kind:drop.kind==='rounds'?'ammo':drop.kind==='westminster-start-pistol-v1'?'pistol':'dressing',count:drop.remaining})};supplyViews.set(drop.id,v);s.scene.add(v.view.root);}
  v.view.root.position.copy(s.world.toRender(drop.position));v.view.update(s.game.time);
 }
}
function clearSupplies(){for(const v of supplyViews.values())v.view.dispose();supplyViews.clear();}
function cancelPistol(g){stopFlame(g);s.effects?.clearFlameFeedback?.();resetMobileControls(g);s.actors?.resetFeedback();g.pistolTargetId=null;g.pistolTargetFacing=null;if(!g.flame?.equipped)g.pistol=stepPistol(g.pistol,{time:g.time,cancel:true,canAct:false}).state;s.effects?.clearPistolFeedback();s.effects?.update(g,{paused:true});}
return {updateExpedition(){updateVestEquipment();expeditionView.update();uniqueView.update();bossView.update();flameView.update();},interactFlame:flameView.interact,interactExpedition:expeditionView.interact,interactUniqueReward:uniqueView.interact,clearVestBag,updateVestBag,...persistence,updateSupplies,clearSupplies,cancelPistol,dispose(){flameView.dispose();uniqueView.dispose();bossView.dispose();expeditionView.dispose();clearSupplies();clearVestBag();}};
}
