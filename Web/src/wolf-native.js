// Own wolf skeleton and native Bite; no Dog retargeting or flame profile.
export const WOLF_RIG='original-wolf';
export const WOLF_BITE=Object.freeze({moveId:'wolf_bite',clip:'Bite',foundationRef:WOLF_RIG,windupTicks:20,activeTicks:12,recoveryTicks:24,windup:20/60,active:12/60,recovery:24/60,damage:8,staminaDamage:8,range:2.5,weapon:'teeth'});
export function wolfResponse(alive,start){return{clip:alive?'Hurt':'Death',start,ticks:alive?32:74};}
// The measured mouth surface is .24995m to the actor's right. Aim the
// existing native root so that surface, rather than the body centre, faces the torso.
export function wolfBiteDirection(direction){const angle=Math.atan2(.24995,2.375),c=Math.cos(angle),s=Math.sin(angle);return{x:direction.x*c-direction.z*s,z:direction.x*s+direction.z*c};}
// Build once from the unchanged player skin. The existing posed-triangle
// receiver remains the damage authority; this replaces the now-low calf faces.
export function wolfBodyReceiverBindings(model){
 const mesh=model.getObjectByName('Skin'),geometry=mesh.geometry,indices=geometry.index,skin=geometry.attributes.skinIndex,weights=geometry.attributes.skinWeight,names=new Set(['pelvis','spine_01','spine_02','spine_03']),body=new Set(mesh.skeleton.bones.flatMap((b,i)=>names.has(b.name)?[i]:[])),vertices=new Set();
 for(let i=0;i<skin.count;i++){let sum=0;for(let j=0;j<4;j++)if(body.has(skin.getComponent(i,j)))sum+=weights.getComponent(i,j);if(sum>=.5)vertices.add(i);}
 const faceBindings=[];for(let face=0;face<indices.count/3;face++){const row=[0,1,2].map(k=>indices.getX(face*3+k));if(row.some(i=>vertices.has(i)))faceBindings.push({face,vertices:row});}
 return[{runtimeName:'Skin',faceBindings}];
}
