import * as T from 'three';
const GAITS=new Set(['HollowIdle','HollowWalk','Run','StrafeLeft','StrafeRight']);

// Upper-body skulking layer only; native feet, blade, attack/contact clocks stay
// intact. Restore before every native sample and bypass all committed actions.
export class GauntSkulkerMotion{
 constructor(native){
  this.native=native;this.model=native.model;this.active=false;this.disposed=false;
  this.saved=['spine_01','spine_02','neck_01','clavicle_l','clavicle_r'].map(name=>{
   const bone=this.model.getObjectByName(name);if(!bone)throw Error('Gaunt bone missing: '+name);return{bone,quaternion:new T.Quaternion()};
  });this.rotation=new T.Quaternion();this.euler=new T.Euler();
 }
 get currentClip(){return this.native.currentClip;}get currentPhase(){return this.native.currentPhase;}
 refresh(){this.model.updateMatrixWorld(true);this.model.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});}
 restore(){if(!this.active)return;for(const s of this.saved)s.bone.quaternion.copy(s.quaternion);this.active=false;this.refresh();}
 pose(name,phase){
  if(!GAITS.has(name))return;const pulse=Math.sin(phase*Math.PI*2), turns=[[.28,0,0],[.18,0,0],[-.20,.045*pulse,0],[.05,0,.10],[.05,0,-.10]];
  for(let i=0;i<this.saved.length;i++){
   const s=this.saved[i];s.quaternion.copy(s.bone.quaternion);this.rotation.setFromEuler(this.euler.set(...turns[i]));s.bone.quaternion.multiply(this.rotation);
  }
  this.active=true;this.refresh();
 }
 sample(name,phase,guard=false){if(this.disposed)return;this.restore();this.native.sample(name,phase,guard);if(!guard)this.pose(name,phase);}
 update(entity,time,dt,deathPose=null){
  if(this.disposed)return;this.restore();this.native.update(entity,time,dt,deathPose);
  if(entity.hp>0&&!entity.guarding&&!entity.swing&&!(time<entity.dodgeUntil)&&!(entity.response&&time<entity.response.start+entity.response.ticks/60))this.pose(this.native.currentClip,this.native.currentPhase??0);
 }
 dispose(){if(this.disposed)return;this.restore();this.disposed=true;this.native.dispose();}
}
