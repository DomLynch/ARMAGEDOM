// Reuse the existing pistol rules. The caller supplies current action eligibility;
// Core supplies the sole durable writer. No live ownership changes before commit.
export const PISTOL_ITEM_ID='westminster-start-pistol-v1';
export function createPistolOperation({getRun,collectPistol,equipPistol,canAct}){
 if([getRun,collectPistol,equipPistol,canAct].some(fn=>typeof fn!=='function'))
  throw TypeError('Missing pistol domain dependency');
 const deny=code=>({ok:false,code,events:[]});
 return (command,context)=>{
  const claim=command?.type==='claimPickup',equip=command?.type==='equip';
  if(!claim&&!equip||(claim?command.pickupId:command.itemId)!==PISTOL_ITEM_ID||
   equip&&typeof command.equipped!=='boolean')return deny('invalid-command');
  const g=getRun();
  if(!g?.pistol||g.runSaveInvalid||g.finished||!canAct(g))return deny('not-eligible');
  if(claim&&g.pistol.collected)return deny('already-collected');
  if(equip&&!g.pistol.collected)return deny('not-eligible');
  const result=claim?collectPistol(g.pistol,{areaId:g.world.areaId??'westminster',position:g.player.pos}):
   equipPistol(g.pistol,command.equipped);
  if(!result.events.length)return claim?deny('not-eligible'):{ok:true,changed:false,events:[]};
  const weapon=result.state.equipped?'pistol':'knife';
  const candidate={...g,pistol:result.state,player:{...g.player,weapon}};
  if(!context.writeRun(candidate))return deny('storage-unavailable');
  g.pistol=result.state;g.player.weapon=weapon;
  return {ok:true,changed:true,events:result.events.map(event=>({...event,itemId:PISTOL_ITEM_ID}))};
 };
}
