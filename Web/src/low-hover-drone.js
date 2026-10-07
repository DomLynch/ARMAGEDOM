import {DRONE_RULES,droneHoverHeight} from './drone-mechanics.js';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
// One original shared foundation; metres/render-space. Presentation owns no damage,
// AI/pathfinding, reward, save, projectile or actor-scale authority.
export const DRONE_SUPPORT=Object.freeze({id:'low-hover-watcher',procedural:true,rig:null,clips:[],states:Object.freeze(['idle','patrol','alert','attack','death']),hoverHeight:DRONE_RULES.hoverHeight,bodyBand:Object.freeze([DRONE_RULES.hoverHeight-.21,DRONE_RULES.hoverHeight+.19]),movementRadius:.55,attackWarningSeconds:.6,deathSeconds:.8,finisher:'ordinary',melee:'Requires Combat actual blade/body validation; no immunity or headshot claim'});
export function createLowHoverDroneLibrary(){
 const pieces=[];const add=(g,color,x=0,y=0,z=0,rx=0,ry=0,rz=0)=>{g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(x,y,z);const c=new T.Color(color),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=c.r;a[i+1]=c.g;a[i+2]=c.b}g.setAttribute('color',new T.BufferAttribute(a,3));pieces.push(g)};
 add(new T.BoxGeometry(.56,.24,.38),0x9b9c91);add(new T.BoxGeometry(.44,.025,.25),0x55574f,0,.132,0);add(new T.BoxGeometry(.28,.026,.06),0xb27d32,0,.15,.05);
 for(const x of [-.28,.28])for(const z of [-.18,.18]){add(new T.BoxGeometry(.36,.035,.045),0x4b4d45,x*.52,0,z*.50,0,Math.atan2(-z,x),0);add(new T.TorusGeometry(.17,.022,6,16),0x797b71,x,.06,z,Math.PI/2)}
 add(new T.BoxGeometry(.18,.12,.12),0x292d2b,0,-.15,.16);add(new T.BoxGeometry(.05,.15,.03),0xa47736,-.17,-.01,.205);add(new T.BoxGeometry(.05,.15,.03),0xa47736,.17,-.01,.205);
 const frame=mergeGeometries(pieces,false);pieces.forEach(g=>g.dispose());frame.computeBoundingBox();frame.computeBoundingSphere();
 const bladeParts=[new T.BoxGeometry(.25,.009,.025),new T.BoxGeometry(.025,.009,.25)],blade=mergeGeometries(bladeParts,false);bladeParts.forEach(g=>g.dispose());const sensor=new T.SphereGeometry(.04,8,6),halo=new T.TorusGeometry(.55,.016,4,24);
 const frameMat=new T.MeshStandardMaterial({vertexColors:true,roughness:.91,metalness:.18}),bladeMat=new T.MeshStandardMaterial({color:0x242927,roughness:.9}),ownedG=[frame,blade,sensor,halo],ownedM=[frameMat,bladeMat];let users=0,disposed=false;
 return{
  support:DRONE_SUPPORT,
  spawn({scene,position={x:0,z:0},heading=0,groundY=0}={}){
   if(disposed||!scene?.isScene||![position.x,position.z,heading,groundY].every(Number.isFinite))throw Error('Valid drone scene/render-space coordinates required');
   const root=new T.Group();root.name='ARM low-hover watcher drone';const shell=new T.Mesh(frame,frameMat);shell.name='ARM_Drone_Rigid_Frame';root.add(shell);const rotors=[];
   for(const x of [-.28,.28])for(const z of [-.18,.18]){const rotor=new T.Mesh(blade,bladeMat);rotor.position.set(x,.066,z);root.add(rotor);rotors.push(rotor)}
   const eyeMat=new T.MeshBasicMaterial({color:0x829885}),warnMat=new T.MeshBasicMaterial({color:0xe0a537,transparent:true,opacity:.7,depthWrite:false});const eye=new T.Mesh(sensor,eyeMat);eye.position.set(0,-.15,.229);root.add(eye);const warning=new T.Mesh(halo,warnMat);warning.rotation.x=Math.PI/2;warning.visible=false;scene.add(root,warning);users++;let released=false,state='idle';
   function update({time=0,dt=0,state:next='idle',phase=0,position:point=position,heading:yaw=heading}={}){
    if(released)return;if(!DRONE_SUPPORT.states.includes(next)||![time,dt,phase,point.x,point.z,yaw].every(Number.isFinite)||dt<0)throw Error('Invalid drone presentation state');state=next;const p=T.MathUtils.clamp(phase,0,1),dead=state==='death';root.position.set(point.x,groundY+(dead?T.MathUtils.lerp(DRONE_RULES.hoverHeight,.36,p):droneHoverHeight(time)),point.z);root.rotation.set(dead?p*.55:Math.sin(time*2)*.025,yaw,dead?p*-.25:0);
    for(const rotor of rotors)rotor.rotation.y=dead?rotor.rotation.y:time*(state==='patrol'?26:20);
    eyeMat.color.setHex(dead?0x313531:state==='alert'||state==='attack'?0xe6a340:0x829885);
    warning.visible=state==='alert';warning.position.set(point.x,groundY+.035,point.z);warning.scale.setScalar(.84+.16*p);warnMat.opacity=.4+.35*Math.sin(Math.PI*p);return{state,bodyBand:DRONE_SUPPORT.bodyBand,warningVisible:warning.visible};
   }
   update();return{root,support:DRONE_SUPPORT,update,stats(){return{state,disposed:released,sharedGeometries:4,privateMaterials:2}},dispose(){if(released)return;released=true;root.removeFromParent();warning.removeFromParent();root.clear();eyeMat.dispose();warnMat.dispose();users--}};
  },
  stats(){return{users,ownedGeometries:ownedG.length,ownedMaterials:ownedM.length,geometryBytes:ownedG.reduce((n,g)=>n+Object.values(g.attributes).reduce((s,a)=>s+a.array.byteLength,0)+(g.index?.array.byteLength??0),0),newTextures:0,frameTriangles:frame.index.count/3}},
  dispose(){if(disposed)return;if(users)throw Error('Release drone actors before shared library');disposed=true;for(const g of ownedG)g.dispose();for(const m of ownedM)m.dispose()}
 };
}
