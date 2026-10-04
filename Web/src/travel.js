// Thin orchestration for the existing three-area pilot. World owns atomic loading.
export async function travelTo(game,request){
 const previous=game.world.areaId,position=await game.world.loadArea(request.areaId,request.entryPoint);
 if(previous==='westminster'&&request.areaId!=='westminster'){
  game.parkedFight={enemies:game.enemies,bolts:game.bolts,loot:game.loot,time:game.time,nextWave:game.nextWave};game.enemies=[];game.bolts=[];game.loot=[];game.encounterActive=false;
 }else if(request.areaId==='westminster'){
  const parked=game.parkedFight;if(parked){const elapsed=game.time-parked.time;game.enemies=parked.enemies;game.bolts=parked.bolts;game.loot=parked.loot;game.nextWave=parked.nextWave+elapsed;
   for(const e of game.enemies){e.ready+=elapsed;e.recoverUntil+=elapsed;e.staggerUntil+=elapsed;e.swing=null;}
   for(const b of game.bolts)b.expires+=elapsed;game.parkedFight=null;
  }game.encounterActive=true;
 }
 const p=game.player;p.pos={...position};p.velocity={x:0,z:0};p.swing=p.buffer=null;p.guarding=false;p.parryUntil=0;p.ready=Math.min(p.ready,game.time);
 game.message=`${request.areaId.toUpperCase()} · ${request.areaId==='westminster'?'Encounter resumed.':'Westminster fight is parked.'}`;game.messageUntil=game.time+4;return {...position};
}
