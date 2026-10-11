import {resetMobileControls} from '../combat.js';
import {stepPistol} from '../pistol.js';
import {PISTOL_SAVE_KEY,RUN_SAVE_KEY,encodeRun,restoreRun,applySavedRun,VEST_BAG_POSITION} from './run-state.js';
import {createSupplyView} from '../supplies-view.js';
import {createVestBagView} from '../vest-view.js';
import {vestAvailable} from '../vest.js';
export function createRunViews(s){
let vestBag=null;
function clearVestBag(){vestBag?.dispose();vestBag=null;}
function updateVestBag(){
 const available=!s.contextLost&&!s.traveling&&!s.game.finished&&s.world.areaId==='westminster'&&vestAvailable(s.game.vest,s.game.supplies);
 if(!available){clearVestBag();return;}
 if(!vestBag){vestBag=createVestBagView();s.scene.add(vestBag.root);vestBag.root.position.copy(s.world.toRender(VEST_BAG_POSITION));s.game.message='Supply bag by the pistol stash · Worn vest available.';s.game.messageUntil=s.game.time+4;}
 vestBag.update(s.game.time);
}
let runSaveCache=null;
function persistRun(g){
 if(g.runSaveInvalid)return false;
 const raw=encodeRun(g);if(raw===runSaveCache)return true;
 try{localStorage.setItem(RUN_SAVE_KEY,raw);runSaveCache=raw;return true;}catch{g.message='Run saving unavailable. Supplies kept.';g.messageUntil=g.time+5;return false;}
}
function restoreSavedRun(g){
 try{const raw=localStorage.getItem(RUN_SAVE_KEY),saved=restoreRun(g,raw,raw==null?localStorage.getItem(PISTOL_SAVE_KEY):null);
  if(saved)applySavedRun(g,saved);else{g.runSaveInvalid=true;g.supplies=null;g.player.hp=0;g.finished=true;g.message='Saved run invalid. Retry to start fresh.';g.messageUntil=5;}
 }catch{g.runSaveInvalid=true;g.message='Run saving unavailable. Supplies kept.';g.messageUntil=5;}
 persistRun(g);
}
const supplyViews=new Map();
function updateSupplies(){
 const drops=s.game?.supplies?.pending.filter(d=>d.areaId===s.world.areaId)??[],ids=new Set(drops.map(d=>d.id));
 for(const [id,v] of supplyViews)if(!ids.has(id)){v.view.dispose();supplyViews.delete(id);}
 for(const drop of drops){let v=supplyViews.get(drop.id);if(v&&v.remaining!==drop.remaining){v.view.dispose();supplyViews.delete(drop.id);v=null;}
  if(!v){v={remaining:drop.remaining,view:createSupplyView({kind:drop.kind==='rounds'?'ammo':'dressing',count:drop.remaining})};supplyViews.set(drop.id,v);s.scene.add(v.view.root);}
  v.view.root.position.copy(s.world.toRender(drop.position));v.view.update(s.game.time);
 }
}
function clearSupplies(){for(const v of supplyViews.values())v.view.dispose();supplyViews.clear();}
function cancelPistol(g){resetMobileControls(g);s.actors?.resetFeedback();g.pistolTargetId=null;g.pistolTargetFacing=null;g.pistol=stepPistol(g.pistol,{time:g.time,cancel:true,canAct:false}).state;s.effects?.clearPistolFeedback();s.effects?.update(g,{paused:true});}
return {clearVestBag,updateVestBag,persistRun,restoreSavedRun,updateSupplies,clearSupplies,cancelPistol,dispose(){clearSupplies();clearVestBag();}};
}
