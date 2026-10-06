import * as THREE from 'three';

// Native hand transform and per-player clip overrides; never mutate the cache.
// The caller supplies an independently SkeletonUtils-cloned character scene.
export function equipDonorPlayer(asset,part){
 const hand=asset.scene.getObjectByName('hand_r'),blade=part.scene.getObjectByName('WeaponDrawn');
 if(!hand||!blade)throw Error('Donor knife mount missing');
 const remove=[];asset.scene.traverse(node=>{if(/^(SwordSheathed|SwordDrawn|WeaponDrawn|WeaponSheathed)(_\d+)?$/.test(node.name))remove.push(node);});
 for(const node of remove)node.removeFromParent();hand.add(blade.clone(true));
 const overrides=new Set(part.animations.map(clip=>clip.name));
 return {scene:asset.scene,animations:[...part.animations,...asset.animations.filter(clip=>!overrides.has(clip.name))]};
}
export function donorSwingPhase(age,timing,source){
 const total=timing.windup+timing.active+timing.recovery;
 if(!(total>0)||!Number.isFinite(source)||source<0||source>1)throw Error('Invalid donor swing timing');
 const contact=timing.windup/total,p=THREE.MathUtils.clamp(age/total,0,1);
 const keys=[[0,0],[contact*.7,source*.44],[contact,source],[contact+.16,source+(1-source)*.56],[1,1]];
 for(let i=1;i<keys.length;i++)if(p<=keys[i][0]){const [x,y]=keys[i-1],[end,value]=keys[i];return y+(value-y)*(p-x)/(end-x);}return 1;
}

// Presentation only. Combat supplies the authoritative clip, ticks and response.
// Attack sampling has weight 1, preserving the baked contact geometry.
export class DonorMotion{
 constructor(root,model,clips,description){
  this.root=root;this.model=model;this.description=description;this.mixer=new THREE.AnimationMixer(model);this.actions=new Map();this.last=root.position.clone();this.cycle=0;this.visualTime=0;this.lastSampleTime=null;this.response=null;this.responseTime=0;this.disposed=false;
  for(const clip of clips){const action=this.mixer.clipAction(clip);action.play();action.paused=true;action.setEffectiveWeight(0);this.actions.set(clip.name,action);}
  // Only spine descendants hold guard while native locomotion drives the legs.
  const upper=new Set();model.getObjectByName('spine_01')?.traverse(node=>upper.add(node.name));
  for(const name of [description.clips.walk,description.clips.run,'StrafeLeft','StrafeRight']){
   const clip=clips.find(c=>c.name===name);if(!clip)continue;
   const lower=clip.tracks.filter(track=>!upper.has(THREE.PropertyBinding.parseTrackName(track.name).nodeName));
   const action=this.mixer.clipAction(new THREE.AnimationClip(name+'GuardLegs',clip.duration,lower));action.play();action.paused=true;action.setEffectiveWeight(0);this.actions.set(name+'GuardLegs',action);
  }
  const guard=clips.find(clip=>clip.name===description.clips.guard);
  if(guard){const tracks=guard.tracks.filter(track=>upper.has(THREE.PropertyBinding.parseTrackName(track.name).nodeName));this.guardUpper=this.mixer.clipAction(new THREE.AnimationClip('DonorGuardUpper',guard.duration,tracks));this.guardUpper.play();this.guardUpper.paused=true;this.guardUpper.setEffectiveWeight(0);}
  this.sample(description.clips.idle,0);
 }
 sample(name,phase,guardOverlay=false){
  const selected=this.actions.get(guardOverlay?name+'GuardLegs':name);if(!selected)throw Error('Donor clip missing: '+name);
  for(const action of this.actions.values())action.setEffectiveWeight(action===selected?1:0);
  this.guardUpper?.setEffectiveWeight(guardOverlay?1:0);
  selected.time=THREE.MathUtils.clamp(phase,0,.999999)*selected.getClip().duration;
  if(this.guardUpper)this.guardUpper.time=0;
  this.mixer.update(0);this.model.updateWorldMatrix(true,true);this.model.traverse(node=>{if(node.isSkinnedMesh)node.skeleton.update();});
  this.currentClip=name;this.currentPhase=phase;
 }
 update(entity,time,dt,deathPose=null){
  if(this.disposed)return;
  const noTick=time===this.lastSampleTime,elapsed=this.lastSampleTime===null?dt:Math.max(0,time-this.lastSampleTime);this.lastSampleTime=time;
  const delta=this.root.position.clone().sub(this.last);delta.y=0;this.last.copy(this.root.position);this.visualTime+=Math.max(0,dt);
  const response=entity.response;
  if(response!==this.response){this.response=response;this.responseTime=this.visualTime;}
  const responseAge=response?Math.max(time-response.start,this.visualTime-this.responseTime):0;
  if(entity.hp<=0){this.sample(deathPose?.clip??this.description.clips.death,deathPose?.phase??(response?responseAge/(response.ticks/60):1));return;}
  if(time<entity.dodgeUntil){this.sample(this.description.clips.dodge,(time-entity.dodgeStart)/(entity.dodgeUntil-entity.dodgeStart));return;}
  const swing=entity.swing;
  if(swing&&time<swing.end){this.sample(swing.clip,swing.native?(time-swing.start)/(swing.end-swing.start):donorSwingPhase(swing.ageTicks,swing.timing,swing.sourceContact));return;}
  if(response&&responseAge<response.ticks/60){this.sample(response.clip,responseAge/(response.ticks/60));return;}
  if(noTick)return; // Keep the sampled pose between fixed simulation ticks.
  const distance=delta.length(),speed=elapsed>0?distance/elapsed:0;
  if(['rat','dog'].includes(this.description.motion)){const name=speed>.05?this.description.clips.walk:this.description.clips.idle;this.cycle=THREE.MathUtils.euclideanModulo(this.cycle+elapsed/this.actions.get(name).getClip().duration,1);this.sample(name,this.cycle);return;}
  if(speed>.05){
   const forward=new THREE.Vector3(0,0,1).applyQuaternion(this.root.quaternion),right=new THREE.Vector3(1,0,0).applyQuaternion(this.root.quaternion),along=delta.dot(forward),across=delta.dot(right);
   const strafe=Math.abs(across)>Math.abs(along),name=strafe?(across<0?'StrafeLeft':'StrafeRight'):(speed>=4.2?'Run':this.description.clips.walk);
   const stride=this.description.stride??1,rate=strafe?.75:name==='Run'?3.5:1.7;
   // Player sprint uses the native donor Run clock: 1x at 5.2m/s, independent
   // of the approved visual enlargement. Other locomotion stays unchanged.
   const cycleDistance=name==='Run'&&entity.running?5.2*this.actions.get(name).getClip().duration:rate*stride*this.root.scale.x;
   this.cycle=THREE.MathUtils.euclideanModulo(this.cycle+(strafe?distance:Math.sign(along)*distance)/cycleDistance,1);
   this.sample(name,this.cycle,!!entity.guarding);
  }else this.sample(entity.guarding?this.description.clips.guard:this.description.clips.idle,0);
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.mixer.stopAllAction();this.mixer.uncacheRoot(this.model);this.actions.clear();}
}
