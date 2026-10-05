import * as T from 'three';
const ROT=Object.fromEntries([['spine_01',.72,0,.10],['spine_02',.42,.08,0],['neck_01',.25,0,-.08],['clavicle_l',0,0,.10],['clavicle_r',0,0,-.16]].map(([n,x,y,z])=>[n,new T.Quaternion().setFromEuler(new T.Euler(x,y,z))]));
const ROTATIONS=Object.entries(ROT);
const GAITS=new Set(['HollowIdle','HollowWalk','Run','StrafeLeft','StrafeRight']);
const NAMES=['pelvis','spine_01','spine_02','neck_01','clavicle_l','clavicle_r','upperarm_l','lowerarm_l','hand_l','upperarm_r','lowerarm_r','hand_r','thigh_l','calf_l','foot_l','thigh_r','calf_r','foot_r'];
export function crookedPhase(phase){
 const p=T.MathUtils.euclideanModulo(phase,1);
 // Long planted interval, brisk short step, unequal second support interval.
 const keys=[[0,0],[.28,.12],[.5,.5],[.82,.65],[1,1]];
 for(let i=1;i<keys.length;i++)if(p<=keys[i][0]){const [x,y]=keys[i-1],[end,v]=keys[i];return y+(v-y)*(p-x)/(end-x);}return 0;
}
// Wrap ONE private actor's existing DonorMotion; no source clips/assets changed.
export class CrookedHollowMotion{
 constructor(native){
  this.native=native;this.model=native.model;this.bones=Object.fromEntries(NAMES.map(n=>{const bone=this.model.getObjectByName(n);if(!bone)throw Error('Crooked Hollow bone missing: '+n);return [n,bone];}));
  this.saved=NAMES.map(n=>({bone:this.bones[n],position:new T.Vector3(),quaternion:new T.Quaternion()}));
  this.v=Array.from({length:12},()=>new T.Vector3());this.q=Array.from({length:4},()=>new T.Quaternion());this.active=false;this.cycle=0;this.previousCycle=native.cycle??0;
  this.feet=['l','r'].map(side=>({side,position:new T.Vector3(),quaternion:new T.Quaternion()}));
  this.sample(native.currentClip,native.currentPhase??0);
 }
 get currentClip(){return this.native.currentClip;}get currentPhase(){return this.native.currentPhase;}
 restore(){if(!this.active)return;for(const s of this.saved){s.bone.position.copy(s.position);s.bone.quaternion.copy(s.quaternion);}this.active=false;this.refresh();}
 refresh(){this.model.updateWorldMatrix(true,true);this.model.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});}
 point(bone,child,target){
  const [desired,from]=this.v;bone.parent.updateWorldMatrix(true,false);
  bone.parent.worldToLocal(desired.copy(target)).sub(bone.position).normalize();
  from.copy(child.position).multiply(bone.scale).applyQuaternion(bone.quaternion).normalize();
  bone.quaternion.premultiply(this.q[0].setFromUnitVectors(from,desired)).normalize();bone.updateWorldMatrix(true,true);
 }
 solve(a,b,c,target,bend){
  const origin=this.v[2],joint=this.v[3],end=this.v[4],direction=this.v[5],normal=this.v[6],wanted=this.v[7];
  a.getWorldPosition(origin);b.getWorldPosition(joint);c.getWorldPosition(end);const u=origin.distanceTo(joint),v=joint.distanceTo(end);
  direction.copy(target).sub(origin);const d=T.MathUtils.clamp(direction.length(),Math.abs(u-v)+.0001,(u+v)*.995);direction.normalize();
  normal.copy(bend).addScaledVector(direction,-bend.dot(direction)).normalize();const along=(u*u-v*v+d*d)/(2*d),height=Math.sqrt(Math.max(0,u*u-along*along));
  wanted.copy(origin).addScaledVector(direction,along).addScaledVector(normal,height);this.point(a,b,wanted);this.point(b,c,target);
 }
 pose(name,phase){
  if(!GAITS.has(name))return;
  if(name!=='HollowIdle')this.native.sample(name,crookedPhase(phase));
  for(const s of this.saved){s.position.copy(s.bone.position);s.quaternion.copy(s.bone.quaternion);}this.active=true;
  const basis=this.model.getWorldQuaternion(this.q[1]),forward=this.v[8].set(0,0,1).applyQuaternion(basis),down=this.v[9].set(0,-1,0),scale=this.model.getWorldScale(this.v[0]).y;
  for(const f of this.feet){this.bones['foot_'+f.side].getWorldPosition(f.position);this.bones['foot_'+f.side].getWorldQuaternion(f.quaternion);}
  const pelvis=this.bones.pelvis,lower=this.v[1];pelvis.getWorldPosition(lower).addScaledVector(down,.035*scale);pelvis.position.copy(pelvis.parent.worldToLocal(lower));
  for(const [name,rotation] of ROTATIONS)this.bones[name].quaternion.multiply(rotation);
  this.model.updateWorldMatrix(true,true);
  for(const side of ['l','r']){
   const a=this.bones['upperarm_'+side],b=this.bones['lowerarm_'+side],c=this.bones['hand_'+side],target=this.v[10],elbow=this.v[11];
   a.getWorldPosition(target);const length=a.getWorldPosition(this.v[0]).distanceTo(b.getWorldPosition(this.v[1]))+b.getWorldPosition(this.v[0]).distanceTo(c.getWorldPosition(this.v[1]));
   target.addScaledVector(down,length*.92).addScaledVector(forward,.025*scale);elbow.set(side==='l'?-.35:.35,0,1).applyQuaternion(basis);this.solve(a,b,c,target,elbow);
  }
  for(const f of this.feet){
   const a=this.bones['thigh_'+f.side],b=this.bones['calf_'+f.side],foot=this.bones['foot_'+f.side],hip=pelvis.getWorldPosition(this.v[0]);
   const along=this.v[1].copy(f.position).sub(hip).dot(forward);f.position.addScaledVector(forward,-along*(f.side==='l'?.45:.30));
   this.solve(a,b,foot,f.position,forward);foot.quaternion.copy(foot.parent.getWorldQuaternion(this.q[3]).invert().multiply(f.quaternion));
  }
  this.refresh();
 }
 sample(name,phase,guard=false){this.restore();this.native.sample(name,phase,guard);if(!guard)this.pose(name,phase);}
 update(entity,time,dt){
  this.restore();this.native.update(entity,time,dt);
  const cycle=this.native.cycle??0,delta=T.MathUtils.euclideanModulo(cycle-this.previousCycle+.5,1)-.5;this.previousCycle=cycle;this.cycle=T.MathUtils.euclideanModulo(this.cycle+delta*1.55,1);
  if(entity.hp>0&&!entity.guarding&&!entity.swing&&!(time<entity.dodgeUntil)&&!(entity.response&&time<entity.response.start+entity.response.ticks/60))this.pose(this.native.currentClip,this.native.currentClip==='HollowIdle'?0:this.cycle);
 }
 dispose(){this.restore();this.native.dispose();}
}
