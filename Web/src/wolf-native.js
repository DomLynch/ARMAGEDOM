// Own wolf skeleton and native Bite; no Dog retargeting or flame profile.
export const WOLF_RIG='original-wolf';
export const WOLF_BITE=Object.freeze({moveId:'wolf_bite',clip:'Bite',foundationRef:WOLF_RIG,windupTicks:20,activeTicks:12,recoveryTicks:24,windup:20/60,active:12/60,recovery:24/60,damage:8,staminaDamage:8,range:1.0,weapon:'teeth'});
export function wolfResponse(alive,start){return{clip:alive?'Hurt':'Death',start,ticks:alive?32:74};}
// The measured mouth surface is .09998m to the actor's right. Aim the
// existing native root so that surface, rather than the body centre, faces calf.
export function wolfBiteDirection(direction){const angle=Math.atan2(.09998,.95),c=Math.cos(angle),s=Math.sin(angle);return{x:direction.x*c-direction.z*s,z:direction.x*s+direction.z*c};}
