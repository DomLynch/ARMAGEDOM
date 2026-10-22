export const SALAMANDER_RIG='giant-salamander';
export const SALAMANDER_BITE=Object.freeze({moveId:'salamander_bite',clip:'Bite',foundationRef:SALAMANDER_RIG,windupTicks:20,activeTicks:12,recoveryTicks:24,windup:20/60,active:12/60,recovery:24/60,damage:4,staminaDamage:4,range:1.25,weapon:'teeth'});
export function salamanderResponse(alive,start){return{clip:alive?'Hurt':'Death',start,ticks:alive?32:74};}
