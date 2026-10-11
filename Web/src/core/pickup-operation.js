// Selected-ID domain operation only. Existing helpers own eligibility; Core owns IO.
// Injection avoids a second resource ledger or a dependency on the browser bootstrap.
export function createPickupOperation({getRun,collectSupply,collectVest,vestRules,vestBagPosition}){
 if([getRun,collectSupply,collectVest].some(fn=>typeof fn!=='function')||!vestRules?.itemId)
  throw Error('Missing pickup domain dependency');
 const deny=code=>({ok:false,code,events:[]});
 return (command,context)=>{
  if(command?.type!=='claimPickup'||typeof command.pickupId!=='string')return deny('invalid-command');
  const g=getRun();
  if(!g||g.runSaveInvalid||g.finished)return deny('not-eligible');
  const id=command.pickupId;
  if(id===vestRules.itemId){
   if(g.vest?.equipped)return deny('already-collected');
   const r=collectVest(g.vest,{supplies:g.supplies,areaId:g.world.areaId,position:g.player.pos,
    bagPosition:vestBagPosition,hp:g.player.hp,lineClear:(a,b)=>g.world.lineClear(a,b)});
   if(!r.equipped)return deny('not-eligible');
   if(!context.writeRun({...g,vest:r.state}))return deny('storage-unavailable');
   g.vest=r.state;
   return {ok:true,changed:true,events:[{type:'vest-pickup',itemId:id}]};
  }
  if(g.supplies?.collected.includes(id))return deny('already-collected');
  if(!g.supplies?.pending.some(drop=>drop.id===id))return deny('invalid-command');
  const r=collectSupply(g.supplies,{dropId:id,areaId:g.world.areaId,position:g.player.pos,
   resources:{hp:g.player.hp,maxHP:g.player.maxHP,pistolOwned:g.pistol.collected,reserve:g.pistol.reserve},
   lineClear:(a,b)=>g.world.lineClear(a,b)});
  if(!r.award)return deny('not-eligible');
  const candidate={...g,player:{...g.player,hp:r.resources.hp},pistol:{...g.pistol,reserve:r.resources.reserve},supplies:r.state};
  if(!context.writeRun(candidate))return deny('storage-unavailable');
  g.player.hp=r.resources.hp;g.pistol.reserve=r.resources.reserve;g.supplies=r.state;
  return {ok:true,changed:true,events:[{type:'supply-pickup',...r.award}]};
 };
}
