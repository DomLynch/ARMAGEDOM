import{selectCombatTarget,combatTargetHeight}from'../pistol-targeting.js';
import{flameTouches}from'./flame-contact.js';
import * as T from 'three';
import {attachPistol} from '../pistol-pose.js';
import profile from '../donor/flame-right-digit-profile.json' with {type:'json'};
const names=['middle','ring','pinky','index','thumb'].flatMap(f=>[1,2,3].map(i=>`${f}_0${i}_r`));
const validated=new WeakMap();
// The one accepted profile is bound to this exact hero, not retargeted or fitted.
export function flameGripProfile(model,heroSHA){
 if(validated.has(model))return validated.get(model);
 if(profile.schemaVersion!==1||profile.hand!=='right'||profile.source.heroSHA256!==heroSHA||Object.keys(profile.digitLocalQuaternions).length!==names.length)throw Error('Flame grip provenance/schema mismatch');
 for(const name of names){const q=profile.digitLocalQuaternions[name];if(!model.getObjectByName(name)?.isBone||!Array.isArray(q)||q.length!==4||!q.every(Number.isFinite)||Math.abs(Math.hypot(...q)-1)>1e-5)throw Error('Flame grip bone/quaternion mismatch');}
 let skin;model.traverse(n=>{if(!skin&&n.isSkinnedMesh)skin=n;});if(!skin||profile.source.jointOrder.some((name,i)=>skin.skeleton.bones[i]?.name!==name)||skin.skeleton.bones.length!==profile.source.jointOrder.length)throw Error('Flame grip joint order mismatch');
 validated.set(model,profile);return profile;
}
export function attachFlame(model,source){
 if(!source?.scene?.getObjectByName('Grip')||!source.scene.getObjectByName('Muzzle'))throw Error('Flame grip/muzzle source missing');
 const mount=attachPistol(model,source.scene);mount.name='FlamethrowerMount';
 // Art's one measured scene-child offset is not baked into the immutable GLB.
 mount.children[0].position.add({x:-.01262174057948523,y:.07164552251435374,z:.014197067151910436});mount.visible=false;return mount;
}

// Solve the barrel ray about the shoulder pivot, including the muzzle's
// perpendicular offset. Aiming from the old muzzle before moving it undershoots.
export function flameTargetPitch(model,mount,target){
 if(!target?.isVector3||!target.toArray().every(Number.isFinite))throw Error('Finite flame target required');
 return projectedPitch(flameAimBasis(model,mount),target);
}
function projectedPitch({shoulder,muzzle,axis,forward},target){
 const down=new T.Vector3().crossVectors(axis,forward).normalize(),to=target.clone().sub(shoulder),offset=muzzle.clone().sub(shoulder).dot(down),along=to.dot(forward),below=to.dot(down),radius=Math.hypot(along,below);
 const pitch=radius>1e-8?Math.atan2(below,along)-Math.asin(Math.max(-1,Math.min(1,offset/radius))):0;return Math.max(-Math.PI/6,Math.min(Math.PI/3,pitch));
}
// Read-only prediction of the SAME shoulder transform used by the renderer.
// Capture before pitching; prospective yaw follows the ordinary body facing.
export function flameAimBasis(model,mount,g){
 model.updateWorldMatrix(true,true);const shoulder=model.getObjectByName('upperarm_r')?.getWorldPosition(new T.Vector3()),m=mount.getObjectByName('Muzzle');if(!shoulder||!m)throw Error('Native flame shoulder/muzzle required');
 const root=(model.parent??model).getWorldPosition(new T.Vector3()),muzzle=m.getWorldPosition(new T.Vector3());
 return{shoulder,muzzle,axis:new T.Vector3(1,0,0).applyQuaternion(model.getWorldQuaternion(new T.Quaternion())).normalize(),forward:m.getWorldDirection(new T.Vector3()).normalize(),root,position:g?{...g.player.pos}:null,yaw:g?Math.atan2(g.player.facing.x,-g.player.facing.z):0,areaId:g?.world.areaId,reach:Math.hypot(shoulder.x-root.x,shoulder.z-root.z)+muzzle.distanceTo(shoulder)};
}
export function projectedFlameSource(basis,g,target){
 const yaw=Math.atan2(target.pos.x-g.player.pos.x,g.player.pos.z-target.pos.z)-basis.yaw,rotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw),shift=new T.Vector3(g.player.pos.x-basis.position.x,0,basis.position.z-g.player.pos.z),point=p=>p.clone().sub(basis.root).applyQuaternion(rotation).add(basis.root).add(shift),pose={shoulder:point(basis.shoulder),muzzle:point(basis.muzzle),axis:basis.axis.clone().applyQuaternion(rotation),forward:basis.forward.clone().applyQuaternion(rotation)},pitch=projectedPitch(pose,g.world.toRender(target.pos,combatTargetHeight(target,g.time))),tilt=new T.Quaternion().setFromAxisAngle(pose.axis,pitch),m=pose.muzzle.sub(pose.shoulder).applyQuaternion(tilt).add(pose.shoulder),d=pose.forward.applyQuaternion(tilt);
 return{position:{x:m.x,y:m.y,z:-m.z},direction:{x:d.x,y:d.y,z:-d.z},pitch};
}
export function flameAimEligible(basis,g,target){
 if(!basis||!target||basis.areaId!==g.world.areaId||(target.areaId??g.world.areaId)!==g.world.areaId||target.visible===false||!(target.hp>0))return false;
 return flameTouches({source:projectedFlameSource(basis,g,target),target,time:g.time,profile:g.world.flameData.contact,lineClear:(a,b)=>g.world.lineClear(a,b),playerPosition:g.player.pos});
}

// Touch lock supplies one stable receiver for body yaw and weapon elevation.
// Do not reselect from the unpitched muzzle: a close low body may be behind
// that muzzle until the shoulder pose lowers the barrel toward it.
export function flameAimPitch(model,mount,g){
 const p=mount.getObjectByName('Muzzle').getWorldPosition(new T.Vector3()),data=g.world.flameData,selected=g.mobileAiming?null:selectCombatTarget({position:{x:p.x,z:-p.z},aim:g.player.facing,targets:g.enemies,lineClear:(a,b)=>g.world.lineClear(a,b),range:data.contact.range,rangeOffset:e=>e.radius,coneDegrees:data.contact.coneDegrees/2,areaId:g.world.areaId}),enemy=g.mobileAiming?g.mobileAssistEnabled!==false&&g.enemies.find(e=>e.placementKey===g.mobileAim?.targetId&&e.hp>0&&(e.areaId??g.world.areaId)===g.world.areaId&&g.world.lineClear(g.player.pos,e.pos)):selected&&g.enemies.find(e=>e.id===selected.targetId);
 return enemy?flameTargetPitch(model,mount,g.world.toRender(enemy.pos,combatTargetHeight(enemy,g.time))):0;
}

// The donor has non-uniform scale. Retain the exact affine transform instead
// of decomposing it into a quaternion, which can move the hand off the handle.
const pitched=new WeakMap();
export function restoreFlamePitch(model){const state=pitched.get(model);if(!state)return false;for(const{node,matrix,auto}of state){node.matrix.copy(matrix);node.matrixAutoUpdate=auto;node.matrixWorldNeedsUpdate=true;}pitched.delete(model);return true;}
export function applyFlamePitch(model,mount,pitch){
 if(!Number.isFinite(pitch))throw Error('Finite flame pitch required');
 const upper=model.getObjectByName('upperarm_r');if(!upper||mount.parent!==model)throw Error('Flame aim mount mismatch');
 if(pitched.has(model))throw Error('Restore flame pitch before gait/sample');
 pitch=Math.max(-Math.PI/6,Math.min(Math.PI/3,pitch));if(Math.abs(pitch)<1e-8)return;
 model.updateWorldMatrix(true,true);const basis=model.getWorldQuaternion(new T.Quaternion()),shoulder=upper.getWorldPosition(new T.Vector3()),axis=new T.Vector3(1,0,0).applyQuaternion(basis),rotation=new T.Matrix4().makeRotationAxis(axis.normalize(),pitch),delta=new T.Matrix4().makeTranslation(shoulder.x,shoulder.y,shoulder.z).multiply(rotation).multiply(new T.Matrix4().makeTranslation(-shoulder.x,-shoulder.y,-shoulder.z));
 const state=[upper,mount].map(node=>({node,matrix:node.matrix.clone(),auto:node.matrixAutoUpdate,world:node.matrixWorld.clone()}));pitched.set(model,state);
 for(const{node,world}of state){node.matrix.copy(node.parent.matrixWorld).invert().multiply(delta).multiply(world);node.matrixAutoUpdate=false;node.matrixWorldNeedsUpdate=true;}
 model.updateWorldMatrix(true,true);model.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.update();});
}
