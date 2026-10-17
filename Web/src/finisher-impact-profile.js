import {FINISHER_DATA,goreProfile} from './engine/finisher-data.js';
import{SEVER_BLOOD_DATA}from'./engine/sever-blood-data.js';
// Cosmetic admission only. Caller supplies the ACTUALLY presented lethal recipe
// and sampled render-world anchors, after native pose/root/part matrices update.
const rows=Object.fromEntries(FINISHER_DATA.recipes.filter(r=>r.impact).map(r=>[r.id,[r.damageType,...r.impact]]));
export const FINISHER_IMPACT_LIMITS=Object.freeze({...FINISHER_DATA.impactLimits,lifetime:SEVER_BLOOD_DATA.headDropletLifetime});
const palette=Object.freeze([0x650c1b,0x831428,0x430812]);
const point=p=>p&&['x','y','z'].every(k=>Number.isFinite(p[k]));
const victim=id=>Number.isSafeInteger(id)&&id>0||typeof id==='string'&&id.trim().length>0;

export function finisherImpactProfile(event,anchors){
  const row=Object.hasOwn(rows,event?.recipeId)?rows[event.recipeId]:null;
  if(!row||event.lethal!==true||!victim(event.victimId)||event.damageType!==row[0])return null;
  const gore=goreProfile(event.recipeId)&&anchors?.gore;if(goreProfile(event.recipeId)&&!gore)return null;
  const d=event.impactDirection,length=d&&Math.hypot(d.x,d.z),origin=anchors?.[row[1]],headSever=['decapitation','pistol-decapitation'].includes(event.recipeId);
  if(!Number.isFinite(length)||length<=1e-8||!point(origin))return null;
  return Object.freeze({victimId:event.victimId,recipeId:event.recipeId,anchor:row[1],
    origin:Object.freeze({x:origin.x,y:origin.y,z:origin.z}),
    // ARM direction x/z -> render x/-z ONCE. Anchor is already render space.
    direction:Object.freeze({x:d.x/length,y:0,z:-d.z/length}),
    droplets:row[2],trails:row[3],lifetime:headSever?SEVER_BLOOD_DATA.headDropletLifetime:row[4],speed:row[5],spreadDegrees:row[6],
    trailLifetime:headSever?.28:.18,trailLength:headSever?.34:.22,dropSize:gore?.dropSize??(headSever?.13:row[1]==='head'||event.recipeId==='opened'?.10:.055),gravity:headSever?SEVER_BLOOD_DATA.headDropletGravity:8,groundClip:headSever,
    palette:gore?.palette??palette,...(gore?{gore:{mode:gore.mode,spreadDegrees:gore.spreadDegrees,emitSeconds:gore.emitSeconds,verticalSpeed:gore.verticalSpeed,jet:gore.jet,pool:gore.pool},groundClip:true}:{}),depthTest:true,depthWrite:false,additive:false,bloom:false});
}

// One gate per scene. Weak identity prevents duplicate/replayed corpse starts
// without retaining every dead actor. Renderer owns slots/materials and clocks.
export function createFinisherImpactGate(){
  const seen=new WeakSet(),active=new Map();let disposed=false;
  function release(token){const effect=active.get(token);active.delete(token);return effect??null;}
  return {
    start(token,event,anchors,{now,restored=false,freeParticles=0,freeTrails=0}={}){
      if(disposed||!token||typeof token!=='object'||seen.has(token)||!Number.isFinite(now)||now<0)return null;
      if(restored){seen.add(token);return null;}
      const profile=finisherImpactProfile(event,anchors);if(!profile)return null;
      seen.add(token); // Capacity rejection is terminal, never a delayed burst.
      if(active.size>=FINISHER_IMPACT_LIMITS.bursts||!Number.isSafeInteger(freeParticles)
          ||!Number.isSafeInteger(freeTrails)||freeParticles<profile.droplets||freeTrails<profile.trails)return null;
      const effect=Object.freeze({...profile,startedAt:now,expiresAt:now+profile.lifetime});
      active.set(token,effect);return effect;
    },
    expire(now){if(!Number.isFinite(now))return[];const expired=[];
      for(const[token,effect]of active)if(now>=effect.expiresAt){expired.push(release(token));}
      return expired;
    },
    cancel:release,
    clear(){const removed=[...active.values()];active.clear();return removed;},
    dispose(){disposed=true;const removed=[...active.values()];active.clear();return removed;},
  };
}
