import * as THREE from 'three';
const vec=()=>new THREE.Vector3(),quat=()=>new THREE.Quaternion();
const clamp=THREE.MathUtils.clamp;
export function posePhase(elapsed,windup,recovery){return clamp(elapsed<windup?.45*elapsed/Math.max(.01,windup):.45+.55*(elapsed-windup)/Math.max(.01,recovery),0,1);}
export function worldRotation(bone,q){const parent=bone.parent?.getWorldQuaternion(quat())??quat();bone.quaternion.copy(parent.invert().multiply(q));bone.updateWorldMatrix(false,true);}
export function solveArm(upper,lower,hand,target,pole,weight=1){
 if(!upper||!lower||!hand||weight<=0)return;
 upper.updateWorldMatrix(true,true);const start=upper.getWorldPosition(vec()),middle=lower.getWorldPosition(vec()),end=hand.getWorldPosition(vec());
 const a=start.distanceTo(middle),b=middle.distanceTo(end),delta=target.clone().sub(start),distance=clamp(delta.length(),Math.abs(a-b)+.00001,(a+b)*.99999);if(a<.00001||b<.00001||delta.length()<.00001)return;
 const axis=delta.normalize(),bendAxis=pole.clone().addScaledVector(axis,-pole.dot(axis));if(bendAxis.lengthSq()<.00001)bendAxis.crossVectors(axis,new THREE.Vector3(0,1,0));bendAxis.normalize();
 const along=(a*a-b*b+distance*distance)/(2*distance),bend=start.clone().addScaledVector(axis,along).addScaledVector(bendAxis,Math.sqrt(Math.max(0,a*a-along*along))),goal=start.clone().addScaledVector(axis,distance);
 const q1=upper.getWorldQuaternion(quat()),rotation=quat().setFromUnitVectors(middle.clone().sub(start).normalize(),bend.sub(start).normalize()).multiply(q1);worldRotation(upper,q1.slerp(rotation,weight));
 const nowMiddle=lower.getWorldPosition(vec()),nowEnd=hand.getWorldPosition(vec()),q2=lower.getWorldQuaternion(quat());worldRotation(lower,q2.clone().slerp(quat().setFromUnitVectors(nowEnd.sub(nowMiddle).normalize(),goal.sub(nowMiddle).normalize()).multiply(q2),weight));
}
// Unity ArtMotion overlay: preserve sampled source clips and modify only rotations.
export class ActorMotion{
 constructor(root,model,clips,description){this.root=root;this.model=model;this.description=description;this.mixer=new THREE.AnimationMixer(model);this.actions={};this.bones={};model.traverse(o=>{if(o.isBone)this.bones[o.name]=o;});for(const name of description.bones??[]){const bone=this.bones[THREE.PropertyBinding.sanitizeNodeName(name)];if(bone)this.bones[name]=bone;}
 for(const key of ['idle','run','attack']){const clip=clips.find(c=>c.name===description.clips[key]);if(clip){const action=this.mixer.clipAction(clip);action.play();action.paused=true;this.actions[key]=action;}}
 this.last=vec();this.cycle=0;this.idleTime=0;this.runWeight=0;this.strikeWeight=0;this.guardWeight=0;this.saved=new Map();this.feet=[];this.bladeAxis=null;
 this.sample(0,0,0);root.updateMatrixWorld(true);this.head=this.bones.Head;this.headScale=this.head?.scale.clone();
 const hand=this.bones['Hand.R'],blade=model.getObjectByName('Machete');if(hand&&blade?.isSkinnedMesh){let far=0,tip=vec();const handPos=hand.getWorldPosition(vec());blade.skeleton.update();for(let i=0;i<blade.geometry.attributes.position.count;i++){const v=blade.getVertexPosition(i,vec()).applyMatrix4(blade.matrixWorld),d=v.distanceToSquared(handPos);if(d>far){far=d;tip.copy(v);}}this.bladeAxis=tip.sub(handPos).applyQuaternion(hand.getWorldQuaternion(quat()).invert()).normalize();}
 for(const side of ['L','R']){const hip=this.bones['Thigh.'+side],knee=this.bones['Shin.'+side],foot=this.bones['Foot.'+side];if(!hip||!knee||!foot)continue;const sole=[];
 model.traverse(mesh=>{if(!mesh.isSkinnedMesh||!mesh.visible)return;const index=mesh.skeleton.bones.indexOf(foot),weights=mesh.geometry.attributes.skinWeight,indices=mesh.geometry.attributes.skinIndex;if(index<0||!weights||!indices)return;mesh.skeleton.update();for(let i=0;i<weights.count;i++){for(let j=0;j<4;j++){if(indices.getComponent(i,j)===index&&weights.getComponent(i,j)>.6){sole.push(foot.worldToLocal(mesh.getVertexPosition(i,vec()).applyMatrix4(mesh.matrixWorld)));break;}}}});
 this.feet.push({hip,knee,foot,sole,planted:false,anchor:vec(),rotation:quat(),contact:vec()});}
 this.last.copy(root.position);
 }
 remember(bone){if(bone&&!this.saved.has(bone))this.saved.set(bone,bone.quaternion.clone());}
 restore(){for(const [bone,q] of this.saved)bone.quaternion.copy(q);this.saved.clear();}
 sample(run,strike,phase,stab=false){const idle=this.actions.idle,walk=this.actions.run,attack=this.actions.attack;if(walk){walk.enabled=true;walk.setEffectiveWeight(run*(1-strike));walk.time=this.cycle*walk.getClip().duration;}if(idle){idle.enabled=true;idle.setEffectiveWeight((1-run)*(1-(stab?0:strike)));idle.time=this.idleTime%idle.getClip().duration;}if(attack){attack.enabled=true;attack.setEffectiveWeight(stab?0:strike);attack.time=phase*attack.getClip().duration;}this.mixer.update(0);}
 update(entity,time,dt){this.restore();const travel=this.root.position.clone().sub(this.last),distance=travel.length(),speed=distance/Math.max(.001,dt);this.last.copy(this.root.position);this.idleTime+=dt;
 if(entity.swing)this.visualSwing=entity.swing;if(entity.staggerUntil>time||entity.dodgeUntil>time)this.visualSwing=null;const swing=this.visualSwing,striking=!!swing&&time<swing.end,walking=entity.kind===1||entity.kind===3,forward=new THREE.Vector3(0,0,1).applyQuaternion(this.root.quaternion),right=new THREE.Vector3(1,0,0).applyQuaternion(this.root.quaternion),scale=this.root.scale.x;
 const signed=entity.kind>=0&&travel.dot(forward)<0?-distance:distance;this.cycle=THREE.MathUtils.euclideanModulo(this.cycle+signed/((walking?1.31:3.5)*scale),1);
 const toward=(value,target,amount)=>value+clamp(target-value,-amount,amount);this.runWeight=toward(this.runWeight,striking?0:clamp(speed/1.3,0,1),dt/.14);this.strikeWeight=toward(this.strikeWeight,striking?1:0,dt/.08);this.guardWeight=toward(this.guardWeight,entity.guarding?1:0,dt/.1);
 const windup=swing?swing.hitAt-swing.start:.14,recovery=swing?swing.end-swing.hitAt:.28,elapsed=swing?Math.max(0,time-swing.start):0,stab=swing?.action==='stab';this.sample(this.runWeight,this.strikeWeight,posePhase(elapsed,windup,recovery),stab);this.root.updateMatrixWorld(true);
 if(this.head)this.head.scale.copy(this.headScale).multiplyScalar(this.description.headProportion??1);
 const shoulder=this.bones['UpperArm.R'],elbow=this.bones['Forearm.R'],hand=this.bones['Hand.R'];
 if(shoulder&&elbow&&hand){const origin=shoulder.getWorldPosition(vec()),reach=origin.distanceTo(elbow.getWorldPosition(vec()))+elbow.getWorldPosition(vec()).distanceTo(hand.getWorldPosition(vec())),side=Math.sign(origin.clone().sub(this.root.position).dot(right))||1;let target,direction,weight=0;
 if(entity.kind===-1&&this.bladeAxis){if(striking&&stab){const extension=elapsed<windup?THREE.MathUtils.lerp(.05,.9,THREE.MathUtils.smoothstep(elapsed/windup,0,1)):THREE.MathUtils.lerp(.9,.05,clamp((elapsed-windup)/recovery,0,1));target=origin.clone().addScaledVector(forward,reach*extension).addScaledVector(right,side*.08).addScaledVector(new THREE.Vector3(0,1,0),-reach*.2);direction=forward;weight=this.strikeWeight;
 }else if(striking&&swing.action==='heavy'&&elapsed<windup){target=origin.clone().addScaledVector(forward,.25).add(new THREE.Vector3(0,.2,0));direction=new THREE.Vector3(0,1,0).addScaledVector(forward,.25).normalize();weight=Math.sin(clamp(elapsed/windup,0,1)*Math.PI);
 }else{target=origin.clone().addScaledVector(forward,.28).addScaledVector(right,-side*.12).add(new THREE.Vector3(0,-.2,0));direction=new THREE.Vector3(0,1,0).addScaledVector(right,side*.3).normalize();weight=this.guardWeight;}
 if(weight>0){this.remember(shoulder);this.remember(elbow);this.remember(hand);const original=hand.getWorldQuaternion(quat());solveArm(shoulder,elbow,hand,target,right.clone().multiplyScalar(side).add(new THREE.Vector3(0,-.5,0)),weight);worldRotation(hand,original.clone().slerp(quat().setFromUnitVectors(this.bladeAxis.clone().applyQuaternion(original),direction).multiply(original),weight));}
 }else if(entity.kind===2){const lift=Math.max(0,scale-1)*.6*(1-this.strikeWeight);if(lift>0){this.remember(shoulder);this.remember(elbow);this.remember(hand);const original=hand.getWorldQuaternion(quat()),target=hand.getWorldPosition(vec()).add(new THREE.Vector3(0,lift,0));solveArm(shoulder,elbow,hand,target,elbow.getWorldPosition(vec()).sub(origin),1);worldRotation(hand,original);}}
 }
 const grounded=time>=entity.dodgeUntil||entity.kind>=0,contacts=!striking&&grounded&&speed>.3&&this.runWeight>.8;
 for(let i=0;i<this.feet.length;i++){const foot=this.feet[i],contact=contacts&&(i===0?(walking?this.cycle>=.05&&this.cycle<.45:this.cycle>=.03&&this.cycle<.2):(walking?this.cycle>=.55&&this.cycle<.95:this.cycle>=.55&&this.cycle<.74));this.plant(foot,contact,grounded,forward,scale);}
 }
 plant(f,contact,grounded,forward,scale){if(!grounded||!f.sole.length){f.planted=false;return;}const {hip,knee,foot}=f;this.remember(hip);this.remember(knee);this.remember(foot);const sampled=foot.getWorldQuaternion(quat());if(contact&&f.planted)worldRotation(foot,f.rotation);foot.updateWorldMatrix(true,false);let bottom=Infinity,lowest;for(const point of f.sole){const y=point.clone().applyMatrix4(foot.matrixWorld).y;if(y<bottom){bottom=y;lowest=point;}}
 if(!contact)f.planted=false;if(contact&&!f.planted){f.contact.copy(lowest);f.rotation.copy(foot.getWorldQuaternion(quat()));f.anchor.copy(lowest).applyMatrix4(foot.matrixWorld);f.anchor.y=.012;f.planted=true;}
 const sampledPosition=foot.getWorldPosition(vec()),ankle=f.planted?f.anchor.clone().sub(f.contact.clone().transformDirection(foot.matrixWorld).multiplyScalar(f.contact.length()*scale)):sampledPosition.clone();ankle.y+=Math.max(0,.012-(bottom+ankle.y-sampledPosition.y));
 const reach=hip.getWorldPosition(vec()).distanceTo(knee.getWorldPosition(vec()))+knee.getWorldPosition(vec()).distanceTo(sampledPosition);if(ankle.distanceTo(hip.getWorldPosition(vec()))>reach||ankle.distanceTo(sampledPosition)>.45*scale){f.planted=false;worldRotation(foot,sampled);return;}const rotation=foot.getWorldQuaternion(quat());solveArm(hip,knee,foot,ankle,forward,1);worldRotation(foot,rotation);
 }
 dispose(){this.restore();this.mixer.stopAllAction();this.mixer.uncacheRoot(this.model);}
}
