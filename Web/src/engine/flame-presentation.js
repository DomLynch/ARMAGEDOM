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
