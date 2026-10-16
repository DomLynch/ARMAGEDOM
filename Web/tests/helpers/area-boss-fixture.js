// Controlled logic fixture only; these paths/anchors are NOT exported models or public placements.
export function bossFixture(){
 const profiles={},paths={},placements=[];
 for(const[id,area,action]of[['surgeon','lambeth','stab'],['butcher','elephant-and-castle','slash'],['warden','east-bridge','heavy']]){
  const path=id+'-native',attack={clip:'NativeAttack',path,windupTicks:24,activeTicks:6,recoveryTicks:30,damage:10,staminaDamage:12,staggerTicks:6,chip:0,range:1.3,stepIn:0,knockback:0,stamina:10,parryable:true};
  profiles[id]={name:'Test '+id,modelRef:'boss-'+id,health:80,radius:.4,moveSpeed:1,wakeDistance:3,homeLeash:4,recoveryDelay:.5,contactScale:1,attackPattern:[action],attacks:{[action]:attack},hazard:null};paths[path]=Array.from({length:61},()=>[0,1,0,0,1,1.2]);placements.push({key:'fixture-'+id,areaId:area,profileRef:id,pos:{x:0,z:-5},patrol:[{x:0,z:-5},{x:.1,z:-5}]});
 }
 return{version:1,profiles,placements,paths};
}
