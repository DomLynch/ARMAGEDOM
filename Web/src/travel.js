import {initializeAreaResidents} from './combat.js';
// Thin orchestration for the existing three-area pilot. World owns atomic loading.
export async function travelTo(game, request,{isCurrent=()=>true}={}) {
  if(!isCurrent())return null;
  const previous = game.world.areaId,
    position = await game.world.loadArea(request.areaId, request.entryPoint);
  if(!isCurrent())return null;
  // Load succeeds before any source fight/player state is changed.
  if(game.areaHazards)game.areaHazards=[];
  game.activeGrenades=[];
  game.areaFights ??= {};
  for (const e of game.enemies) {e.swing=null;if(e.animalRole)e.completedAttack=null;}
  game.areaFights[previous] = {
    initialized: !!game.areaInitialized, cleared: !!game.encounterCleared,
    enemies: game.enemies, corpses: game.corpses, bolts: game.bolts, loot: game.loot,
    wave: game.wave, nextWave: game.nextWave, nextEnemyAttackAt: game.nextEnemyAttackAt,
    parkedAt: game.time,
  };
  const parked = game.areaFights[request.areaId];
  game.enemies = parked?.enemies ?? [];
  if (game.corpses) game.corpses = parked?.corpses ?? [];
  game.bolts = parked?.bolts ?? [];
  game.loot = parked?.loot ?? [];
  game.areaInitialized = parked?.initialized ?? false;
  game.encounterCleared = parked?.cleared ?? false;
  game.encounterActive = !game.encounterCleared && (game.areaResidents || request.areaId === 'westminster');
  game.wave = parked?.wave ?? (game.areaResidents ? 0 : game.wave);
  game.nextWave = parked?.nextWave ?? game.time + 2;
  game.nextEnemyAttackAt = parked?.nextEnemyAttackAt ?? game.time;
  if (parked) {
    const elapsed = game.time - parked.parkedAt;
    for (const field of ['nextWave', 'nextEnemyAttackAt'])
      if (Number.isFinite(game[field])) game[field] += elapsed;
    for (const e of [...game.enemies, ...(game.corpses ?? [])]) {
      for (const field of ['ready', 'recoverUntil', 'staggerUntil', 'guardRecoverAt', 'flashUntil', 'wokeAt'])
        if (Number.isFinite(e[field])) e[field] += elapsed;
      // Retained parts pause with the resident snapshot. Shift only a part that
      // was still alive at departure; expired parts must never reserve again.
      for(const field of ['finisherPartsUntil','finisherHeadUntil'])
        if(Number.isFinite(e[field])&&e[field]>parked.parkedAt)e[field]+=elapsed;
      if (Number.isFinite(e.response?.start)) e.response.start += elapsed;
      if(e.droneState){e.droneState.readyAt+=elapsed;if(e.droneState.warning){e.droneState.warning.start+=elapsed;e.droneState.warning.releaseAt+=elapsed;}}
      e.swing = null;if(e.animalRole)e.completedAttack=null;
    }
    for (const bolt of game.bolts) if (Number.isFinite(bolt.expires)) bolt.expires += elapsed;
  } else initializeAreaResidents(game);
  const p = game.player;
  p.pos = { ...position };
  p.velocity = { x: 0, z: 0 };
  p.swing = p.buffer = null;
  p.guarding = false;
  p.parryUntil = 0;
  p.dodgeUntil = p.invulnerableUntil = game.time;
  p.response = null;
  p.ready = Math.min(p.ready, game.time);
  game.message = `${request.areaId.toUpperCase()} · ${game.encounterCleared ? "Cleared · keep exploring." : "Explore London."}`;
  game.messageUntil = game.time + 4;
  return { ...position };
}

// Dismiss only a living player's victory; keep the cleared encounter parked.
export function continueExploring(game) {
  if (!game.finished || !game.won || game.player.hp <= 0) return false;
  game.finished = false;
  game.encounterCleared = true;
  game.encounterActive = false;
  game.player.swing = game.player.buffer = null;
  game.player.guarding = false;
  game.player.parryUntil = 0;
  game.events = [];
  return true;
}

// Snapshot only logical fields touched by travel; retain actor/object identities.
const travelFields=['activeGrenades','areaHazards','areaFights','enemies','corpses','bolts','loot','areaInitialized','encounterCleared','encounterActive','wave','nextWave','nextEnemyAttackAt','message','messageUntil','events'];
function restoreOwn(target,values){for(const key of Object.keys(target))if(!Object.hasOwn(values,key))delete target[key];Object.assign(target,values);}
export function captureTravelState(game){
 const entities=new Set([...(game.enemies??[]),...(game.corpses??[]),...Object.values(game.areaFights??{}).flatMap(f=>[...f.enemies,...(f.corpses??[]),...(f.bolts??[])]),...(game.bolts??[])]);
 return{fields:Object.fromEntries(travelFields.map(key=>[key,{present:Object.hasOwn(game,key),value:game[key]}])),areaFightsEntries:game.areaFights?{...game.areaFights}:null,player:{...game.player},entities:[...entities].map(entity=>({entity,values:{...entity},response:entity.response?{...entity.response}:null,drone:entity.droneState?{...entity.droneState}:null,warning:entity.droneState?.warning?{...entity.droneState.warning}:null}))};
}
export function restoreTravelState(game,snapshot){
 for(const[key,row]of Object.entries(snapshot.fields)){if(row.present)game[key]=row.value;else delete game[key];}
 if(snapshot.areaFightsEntries)restoreOwn(game.areaFights,snapshot.areaFightsEntries);
 restoreOwn(game.player,snapshot.player);
 for(const row of snapshot.entities){restoreOwn(row.entity,row.values);if(row.response)restoreOwn(row.entity.response,row.response);if(row.drone)restoreOwn(row.entity.droneState,row.drone);if(row.warning)restoreOwn(row.entity.droneState.warning,row.warning);}
}
