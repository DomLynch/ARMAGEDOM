import assert from 'node:assert/strict';
// Based on the proven Rocket169 guard; no game-state writes or weapon marker reuse.
export function assertWeaponAdapter(snapshot, adapter) {
 const rows={rifle:snapshot.rifle,pistol:snapshot.pistol,rocket:snapshot.bossEquipment?.rocketLauncher};
 assert(Object.hasOwn(rows,adapter),'known weapon adapter');
 assert.equal(snapshot.weapon,adapter,'equipped weapon/observer adapter mismatch');
 const row=rows[adapter];assert(row,'actual weapon resource state present');
 assert.equal(adapter==='pistol'?row.equipped:row.selected,true,'actual equipped selection');
 if(adapter==='rocket')assert.equal(snapshot.assetReady,true,'actual launcher and projectile assets ready');
 return row;
}
async function bounded(work, wallMs, phase) {
 let timer;
 try{return await Promise.race([Promise.resolve().then(work),new Promise((_,reject)=>{
  timer=setTimeout(()=>reject(Error('missing '+phase+' acknowledgement within wall limit')),wallMs);
 })]);}finally{clearTimeout(timer);}
}
// waitStart/waitResult use the existing simulation-bounded observer. The independent
// wall cap also releases held input when an observer never resolves.
export async function weaponAction({adapter,read,press,release,waitStart,waitResult,wallMs=90000}) {
 assert(Number.isFinite(wallMs)&&wallMs>0,'finite action wall limit');
 const before=await read();assertWeaponAdapter(before,adapter);
 let phase='dispatch',result,error;
 try{
  await press();phase='start';
  const start=await bounded(()=>waitStart(before),wallMs,phase);assert(start,'actual start acknowledgement required');
  phase='result';result={before,start,result:await bounded(()=>waitResult(before,start),wallMs,phase)};
  assert(result.result,'actual action result required');
 }catch(cause){error=Object.assign(new Error('QA_WEAPON_ACTION_'+phase.toUpperCase()+': '+cause.message,{cause}),{classification:'unknown',phase,before});}
 finally{try{await release();}catch(cause){if(error)error.releaseError=String(cause);else error=cause;}}
 if(error){try{error.after=await read();}catch(cause){error.observationError=String(cause);}throw error;}
 return result;
}
