import{flameTouches}from'./engine/flame-contact.js';
import {createFlameFuelModel} from './engine/flame-fuel-state.js';
const EPS=1e-8;
export function initializeFlame(g){
 if(!g.world.flameData)return;
 g.flameFuel=createFlameFuelModel(g.world.flameData).freshState();
 g.flame={equipped:false,active:false,wantFire:false,elapsed:0,lastSpentTick:-1,lastDamageTick:-1,paidTick:-1,paidSeconds:0,aimPitch:0,pendingReturn:false};
}
export function stopFlame(g,{unequip=false}={}){if(!g.flame)return;g.flame.active=false;g.flame.wantFire=false;g.flame.elapsed=0;if(unequip){g.flame.equipped=false;g.flame.pendingReturn=false;}}
export function flameCanAct(g){const p=g.player;return !!p&&p.hp>0&&!g.finished&&!g.runSaveInvalid&&!p.swing&&g.time>=p.ready&&g.time>=p.hurtUntil&&g.time>=p.dodgeUntil;}
export function setFlameEquipped(g,value){
 if(!g.flame||typeof value!=='boolean')return false;
 if(!value){stopFlame(g,{unequip:true});return true;}
 if(!flameCanAct(g)||!g.flameFuel?.collected||!(g.flameFuel.fuelUnits>0))return false;
 stopFlame(g);g.flame.equipped=true;g.flame.pendingReturn=false;g.player.buffer=null;g.player.guarding=false;g.player.parryUntil=0;return true;
}
// Reuse the held Fire input. Other attack buttons return to the normal weapon;
// that same press cannot also launch a hidden Knife attack or pistol reload.
export function flameIntent(g,intent){
 const f=g.flame;if(!f?.equipped)return intent;
 if((intent.actions??[]).some(a=>['stab','heavy','special','pickup'].includes(a))){stopFlame(g,{unequip:true});return{...intent,guard:false,guardPressed:false,actions:[],held:[]};}
 f.wantFire=!intent.cancel&&!intent.guard&&!intent.dodge&&((intent.actions??[]).includes('fire')||(intent.held??[]).includes('fire'));
 if(!f.wantFire)stopFlame(g);
 return{...intent,guard:false,guardPressed:false,actions:[],held:[]};
}
export function stepFlame(g,dt,services,applyHit){
 const f=g.flame,data=g.world.flameData;if(!f||!data)return;
 if(f.pendingReturn&&flameCanAct(g)){
  if(g.player.weapon==='pistol'&&(!g.pistol?.collected||g.pistol.magazine+g.pistol.reserve<=0)){
   const result=services.dispatchPistol?.(g,{type:'equip',itemId:'westminster-start-pistol-v1',equipped:false},true);if(!result?.ok)return;
  }
  stopFlame(g,{unequip:true});return;
 }
 if(!f.equipped||!f.wantFire||!flameCanAct(g)||!(g.flameFuel?.fuelUnits>0)){stopFlame(g);return;}
 const source=services.flameSource?.(g);if(!source){stopFlame(g);return;}
 const result=services.dispatchFlame?.(g,{type:'save'},{seconds:dt,active:true},true),paid=result?.ok&&result.events.find(e=>e.type==='flame-fuel-spent');
 if(!paid||!(paid.activeSeconds>0)){stopFlame(g);return;}
 f.active=true;f.paidTick=g.tick;f.paidSeconds=paid.activeSeconds;f.elapsed+=paid.activeSeconds;
 for(const e of result.events)g.events.push({...e});
 if(f.elapsed+EPS>=data.contact.interval){
  f.elapsed=Math.max(0,f.elapsed-data.contact.interval);
  const horizontal=Math.hypot(source.direction.x,source.direction.z),aligned=horizontal>1e-8&&(source.direction.x*g.player.facing.x+source.direction.z*g.player.facing.z)/horizontal>=Math.cos(data.contact.coneDegrees*Math.PI/360);
  if(aligned)for(const target of [...g.enemies])if(flameTouches({source,target,time:g.time,profile:data.contact,lineClear:(a,b)=>g.world.lineClear(a,b),playerPosition:g.player.pos})){f.lastDamageTick=g.tick;applyHit(target,data.contact.damage,{source});}
 }
 if(paid.empty){f.pendingReturn=true;f.active=false;f.wantFire=false;}
}
