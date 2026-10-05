import {PISTOL_RULES,tracePistol} from './pistol.js';
const DEG=Math.PI/180;
export const MOBILE_AIM=Object.freeze({steeringRate:10,headingRate:24,gain:.4125,acquire:6*DEG,retain:9*DEG,near:2,far:6,deadzone:.13,pistolGain:1,pistolRange:PISTOL_RULES.range,acquireMargin:.60,retainMargin:.90});
const arc=angle=>Math.atan2(Math.sin(angle),Math.cos(angle));
const point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z);
const vector=angle=>({x:Math.sin(angle),z:Math.cos(angle)});
export function followMobileAngle(current,target,dt,rate=24){return current+arc(target-current)*(1-Math.exp(-dt*rate));}
export function mobileStickVector(x,y,radius){
  if(!Number.isFinite(x)||!Number.isFinite(y)||!Number.isFinite(radius)||radius<=0)throw RangeError('Invalid stick');
  const length=Math.hypot(x,y);if(length<=radius*.13)return {x:0,y:0};
  const strength=Math.min(1,(length/radius-.13)/.87);return {x:x/length*strength,y:y/length*strength};
}
export function createMobileAimState(heading=0){
  if(!Number.isFinite(heading))throw RangeError('Invalid heading');
  return {rawHeading:heading,heading,steering:null,previousMove:null,targetId:null,bearing:null};
}
// Move has already been mapped through ARM's camera basis, in domain x/z.
export function stepMobileAim(state,{dt=1/60,move={x:0,z:0},position,targets=[],areaId,
  lineClear,mobile=false,moveHeld=false,pointerHeading=null,cancel=false,alive=true,deliberateExit=false,assistEnabled=true,pistolEquipped=false}={}){
  if(!state||!Number.isFinite(state.heading)||!Number.isFinite(state.rawHeading)||!Number.isFinite(dt)||dt<0||dt>.1||!point(move))throw RangeError('Invalid aim step');
  const pointer=Number.isFinite(pointerHeading),active=mobile&&moveHeld&&!pointer&&!cancel&&alive;
  const assistEligible=mobile&&!pointer&&!cancel&&alive&&assistEnabled;
  const moving=Math.hypot(move.x,move.z)>.01,strength=Math.min(1,Math.hypot(move.x,move.z));
  let steering=active?(moving?(state.steering===null?Math.atan2(move.x,move.z):followMobileAngle(state.steering,Math.atan2(move.x,move.z),dt,10)):state.steering):null;
  const movement=cancel||!alive||mobile&&!moveHeld?{x:0,z:0}:steering!==null?{x:Math.sin(steering)*strength,z:Math.cos(steering)*strength}:{...move};
  const pistol=pistolEquipped===true,range=pistol?MOBILE_AIM.pistolRange:MOBILE_AIM.far,cohort=[];
  if(assistEligible&&point(position)&&typeof areaId==='string'&&typeof lineClear==='function'){
    const counts=new Map();for(const t of targets)if(typeof t?.id==='string')counts.set(t.id,(counts.get(t.id)??0)+1);
    for(const t of targets){
      if(typeof t?.id!=='string'||!t.id||counts.get(t.id)!==1||!point(t.pos)||!Number.isFinite(t.hp)||t.hp<=0||t.hostile!==true||t.visible!==true||t.areaId!==areaId)continue;
      const distance=Math.hypot(t.pos.x-position.x,t.pos.z-position.z);
      if(distance<.01||distance>=range-1e-8||!lineClear(position,t.pos))continue;
      if(pistol&&(!Number.isFinite(t.radius)||t.radius<=0))continue;
      const acquire=pistol&&MOBILE_AIM.pistolGain<1?Math.min(MOBILE_AIM.acquire,Math.asin(Math.min(1,MOBILE_AIM.acquireMargin*t.radius/distance))/(1-MOBILE_AIM.pistolGain)):MOBILE_AIM.acquire,retain=pistol&&MOBILE_AIM.pistolGain<1?Math.min(MOBILE_AIM.retain,Math.asin(Math.min(1,MOBILE_AIM.retainMargin*t.radius/distance))/(1-MOBILE_AIM.pistolGain)):MOBILE_AIM.retain;
      cohort.push({id:t.id,distance,acquire,retain,bearing:Math.atan2(t.pos.x-position.x,t.pos.z-position.z)});
    }
  }
  let retained=!active||deliberateExit?null:cohort.find(t=>t.id===state.targetId),raw=state.rawHeading;
  if(pointer)raw=pointerHeading;
  else if(active){
    if(retained&&Number.isFinite(state.bearing)){
      raw+=arc(retained.bearing-state.bearing);
      if(steering!==null&&state.previousMove!==null)raw+=arc(steering-state.previousMove);
    }else if(steering!==null)raw=steering;
  }else if(assistEligible)raw=state.rawHeading;
  else raw=moving&&!mobile&&!cancel&&alive?Math.atan2(move.x,move.z):state.heading;
  if(retained&&Math.abs(arc(retained.bearing-raw))>=retained.retain-1e-10)retained=null;
  if(!retained&&!deliberateExit&&(!active||moving)){
    const candidates=cohort.filter(t=>Math.abs(arc(t.bearing-raw))<t.acquire-1e-10);
    candidates.sort((a,b)=>Math.abs(arc(a.bearing-raw))-Math.abs(arc(b.bearing-raw))||a.distance-b.distance||(a.id<b.id?-1:a.id>b.id?1:0));
    retained=candidates[0]??null;
  }
  const correction=retained?arc(retained.bearing-raw)*(pistol?MOBILE_AIM.pistolGain:MOBILE_AIM.gain*Math.max(0,Math.min(1,(MOBILE_AIM.far-retained.distance)/(MOBILE_AIM.far-MOBILE_AIM.near)))):0;
  const heading=cancel||!alive?state.heading:followMobileAngle(state.heading,raw+correction,dt,24);
  return {state:{rawHeading:raw,heading,steering,previousMove:active?steering:null,
    targetId:active?retained?.id??null:null,bearing:active?retained?.bearing??null:null},move:movement,direction:vector(heading),correction};
}
// Visible body heading drives the actual unchanged ARM ray; no second aim snap.
export function mobileAimRay(position,heading,targets,lineClear){return tracePistol(position,vector(heading),targets,lineClear);}
