import {createSuppliesState,isSuppliesState,collectSupply} from './supplies.js';
// Only this pilot's ownership and finite ammunition; no inventory/run framework.
export const PISTOL_SAVE_KEY='armagedom:pistol:v1';
export function encodePistol(state){return JSON.stringify({version:1,pickupId:'westminster-start-pistol-v1',collected:state.collected,equipped:state.equipped,magazine:state.magazine,reserve:state.reserve});}
export function restorePistol(state,raw){
 if(raw==null)return state;
 let saved;try{saved=JSON.parse(raw)}catch{return null}
 if(!saved||saved.version!==1||saved.pickupId!=='westminster-start-pistol-v1'||typeof saved.collected!=='boolean'||typeof saved.equipped!=='boolean'||!Number.isInteger(saved.magazine)||saved.magazine<0||saved.magazine>6||!Number.isInteger(saved.reserve)||saved.reserve<0||saved.reserve>12||(!saved.collected&&(saved.equipped||saved.magazine||saved.reserve)))return null;
 return {...state,collected:saved.collected,equipped:saved.equipped,magazine:saved.magazine,reserve:saved.reserve,reloadingUntil:0,nextFireAt:0};
}

// One authoritative successor record: ammunition, health and Area1 reward ledger.
export const RUN_SAVE_KEY='armagedom:area1-run:v1';
export function encodeRun(g){return JSON.stringify({version:1,pistol:JSON.parse(encodePistol(g.pistol)),hp:g.player.hp,supplies:g.supplies});}
export function restoreRun(g,raw,legacyRaw){
 if(raw==null){const pistol=restorePistol(g.pistol,legacyRaw);return pistol?{pistol,hp:g.player.hp,supplies:createSuppliesState()}:null;}
 let saved;try{saved=JSON.parse(raw)}catch{return null}
 if(saved?.version!==1||!saved.pistol||typeof saved.pistol!=='object'||!Number.isFinite(saved.hp)||saved.hp<0||saved.hp>g.player.maxHP||!isSuppliesState(saved.supplies))return null;
 const pistol=restorePistol(g.pistol,JSON.stringify(saved.pistol));
 return pistol?{pistol,hp:saved.hp,supplies:saved.supplies}:null;
}
export function applySavedRun(g,saved){
 g.pistol=saved.pistol;g.player.hp=saved.hp;g.supplies=saved.supplies;g.player.weapon=g.pistol.equipped?'pistol':'knife';
 if(g.world.areaId==='westminster'&&g.areaResidents){g.enemies=g.enemies.filter(e=>!g.supplies.issued.includes(e.placementKey));g.kills=g.supplies.issued.length;g.encounterCleared=!g.enemies.length;g.encounterActive=!g.encounterCleared;}
 if(!g.player.hp){g.finished=true;g.won=false;}
}
// Main supplies the sole synchronous writer. Commit rewards only AFTER durable write.
export function collectNearbySupplies(g,save){
 if(!g.supplies||g.runSaveInvalid||g.finished)return;
 for(const drop of g.supplies.pending.slice()){
  const result=collectSupply(g.supplies,{dropId:drop.id,areaId:g.world.areaId,position:g.player.pos,
   resources:{hp:g.player.hp,maxHP:g.player.maxHP,pistolOwned:g.pistol.collected,reserve:g.pistol.reserve},lineClear:(a,b)=>g.world.lineClear(a,b)});
  if(result.award){
   const proposed={...g,player:{...g.player,hp:result.resources.hp},pistol:{...g.pistol,reserve:result.resources.reserve},supplies:result.state};
   if(!save(proposed))continue;
   g.player.hp=result.resources.hp;g.pistol.reserve=result.resources.reserve;g.supplies=result.state;
   g.events.push({type:'supply-pickup',...result.award});g.message=result.award.kind==='rounds'?`Scavenged ${result.award.amount} spare rounds.`:`Dressing restored ${Math.ceil(result.award.amount)} health.`;g.messageUntil=g.time+3;
  }else if(['pistol-required','reserve-full','health-full'].includes(result.reason)){
   const notice=drop.id+result.reason;if(g.supplyNotice===notice&&g.time<g.supplyNoticeUntil)continue;
   g.supplyNotice=notice;g.supplyNoticeUntil=g.time+4;g.message={ 'pistol-required':'Collect the pistol first. Rounds kept.', 'reserve-full':'Spare rounds full. Supply kept.', 'health-full':'Health full. Dressing kept.' }[result.reason];g.messageUntil=g.time+2;
  }
 }
}
