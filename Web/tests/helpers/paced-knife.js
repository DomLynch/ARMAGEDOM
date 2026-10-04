// Test controller uses only normal aim, fresh Slash and Guard press/release.
// Keep a reserve, parry the visible tell, then counter during its recovery.
export function pacedKnifeIntent(g){
 const e=g.enemies[0],p=g.player;
 const aim=e?{x:e.pos.x-p.pos.x,z:e.pos.z-p.pos.z}:{x:0,z:1};
 if(!e)return {aim,actions:['slash']};
 const parried=g.events.some(event=>event.type==='parry');
 if(!p.swing&&p.stamina>=36&&(parried||e.staggerUntil>g.time+.65))return {aim,actions:['slash']};
 if(e.swing&&e.swing.ageTicks>=e.swing.def.windupTicks-8)return {aim,guard:true,guardPressed:!p.guarding};
 return {aim};
}
