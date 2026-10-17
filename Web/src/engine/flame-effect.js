import {FLAME_VISUAL_DATA as DATA} from './flame-data.js';
import {combatTargetHeight} from '../pistol-targeting.js';
// One private draw with fixed slots. Cosmetic victim fire never dispatches damage.
export function createFlameEffect({THREE:T,scene,world,getSource,reducedMotion=()=>false}){
 const size=DATA.textureSize,pixels=new Uint8Array(size*size*4);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const at=(y*size+x)*4,r=Math.hypot((x+.5-size/2)/(size/2),(y+.5-size/2)/(size/2));pixels[at]=pixels[at+1]=pixels[at+2]=255;pixels[at+3]=Math.round(Math.max(0,1-r)**1.6*240);}
 const texture=new T.DataTexture(pixels,size,size,T.RGBAFormat);texture.needsUpdate=true;
 const geometry=new T.PlaneGeometry(1,1),material=new T.MeshBasicMaterial({map:texture,transparent:true,blending:T.AdditiveBlending,forceSinglePass:true,depthTest:true,depthWrite:false,toneMapped:false,side:T.DoubleSide,alphaTest:.01}),capacity=DATA.emitterCount+DATA.burnSlots*DATA.burnPerVictim,mesh=new T.InstancedMesh(geometry,material,capacity),pose=new T.Object3D(),color=new T.Color(),direction=new T.Vector3(),u=new T.Vector3(),v=new T.Vector3(),up=new T.Vector3(0,1,0);
 mesh.name='Flamethrower pooled flame and cosmetic fire';mesh.renderOrder=2;mesh.frustumCulled=false;mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(mesh);for(let i=0;i<capacity;i++)mesh.setColorAt(i,color.setHex(DATA.palette[i%DATA.palette.length]));
 let disposed=false,owner=null,area=world.areaId,emitter=0,burn=0,victims=0,source=null;
 const hide=i=>{pose.scale.setScalar(0);pose.updateMatrix();mesh.setMatrixAt(i,pose.matrix);};
 function reset(){for(let i=0;i<capacity;i++)hide(i);mesh.instanceMatrix.needsUpdate=true;mesh.visible=false;emitter=burn=victims=0;source=null;}
 function put(i,x,y,z,r,palette,aspect=1){if(y<=.02)return false;const q=world.camera.quaternion,halfHeight=r*(Math.abs(2*(q.x*q.y+q.w*q.z))+aspect*Math.abs(1-2*(q.x*q.x+q.z*q.z)))/2,floorScale=halfHeight>0?Math.min(1,(y-.02)/halfHeight):1;pose.position.set(x,y,-z);pose.quaternion.copy(q);pose.scale.set(r*floorScale,r*aspect*floorScale,r*floorScale);pose.updateMatrix();mesh.setMatrixAt(i,pose.matrix);mesh.setColorAt(i,color.setHex(palette));return true;}
 function update(g,{paused=false}={}){
  if(disposed)return;if(owner!==g||area!==world.areaId){reset();owner=g;area=world.areaId;}for(let i=0;i<capacity;i++)hide(i);emitter=burn=victims=0;source=null;
  if(paused||g.player.hp<=0||g.finished){mesh.visible=false;mesh.instanceMatrix.needsUpdate=true;return;}
  const data=g.world?.flameData;if(!data){mesh.visible=false;mesh.instanceMatrix.needsUpdate=true;return;}const light=reducedMotion(),count=light?DATA.reducedCount:DATA.emitterCount;
  if(data&&g.flame?.equipped&&g.flame.active){const s=getSource?.();if(s){source=s;direction.set(s.direction.x,s.direction.y,s.direction.z).normalize();u.crossVectors(direction,up);if(u.lengthSq()<1e-8)u.set(1,0,0);else u.normalize();v.crossVectors(u,direction).normalize();
   for(let i=0;i<count;i++){const phase=light?(i+.5)/count:(g.time*4+i/count)%1,distance=data.contact.range*phase,theta=i*2.399963229728653,radius=Math.tan(data.contact.coneDegrees*Math.PI/360)*distance*.55,radial=light?0:Math.sin(i*19.3)*radius,x=s.position.x+direction.x*distance+(u.x*Math.cos(theta)+v.x*Math.sin(theta))*radial,y=s.position.y+direction.y*distance+(u.y*Math.cos(theta)+v.y*Math.sin(theta))*radial,z=s.position.z+direction.z*distance+(u.z*Math.cos(theta)+v.z*Math.sin(theta))*radial,width=(DATA.emitterWidth[0]+DATA.emitterWidth[1]*phase)*Math.sin(Math.PI*Math.max(.03,Math.min(.97,phase)));
    if(world.lineClear(g.player.pos,{x:s.position.x,z:s.position.z})&&world.lineClear({x:s.position.x,z:s.position.z},{x,z})&&put(i,x,y,z,width,DATA.palette[Math.min(2,Math.floor(phase*3))]))emitter++;
   }
  }}
  if(!light)for(const e of [...g.enemies,...(g.corpses??[])]){if(victims>=DATA.burnSlots)break;if(!(e.flameBurnUntil>g.time))continue;const life=Math.min(1,(e.flameBurnUntil-g.time)/DATA.burnSeconds),height=combatTargetHeight(e,g.time),from=e.flameBurnFrom??g.player.pos,dx=from.x-e.pos.x,dz=from.z-e.pos.z,n=Math.hypot(dx,dz)||1,surface=Math.min(.8,(e.radius??.4)*(e.combatScale??1)+.05),front={x:e.pos.x+dx/n*surface,z:e.pos.z+dz/n*surface};if(!world.lineClear(e.pos,front))continue;for(let j=0;j<DATA.burnPerVictim;j++){const i=DATA.emitterCount+victims*DATA.burnPerVictim+j,offset=(j-.5)*.24,x=front.x+offset,y=height+.13+Math.sin(g.time*14+j)*.08,z=front.z;if(put(i,x,y,z,DATA.burnWidth[j]*life,DATA.palette[j],DATA.burnAspect))burn++;}victims++;}
  mesh.visible=emitter+burn>0;mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;
 }
 reset();return{update,reset,snapshot(){return{emitterCapacity:1,particleCapacity:capacity,emitterParticles:emitter,cosmeticVictims:victims,burnParticles:burn,drawCalls:mesh.visible?1:0,depthTest:material.depthTest,depthWrite:material.depthWrite,source};},dispose(){if(disposed)return;reset();disposed=true;mesh.removeFromParent();mesh.dispose();geometry.dispose();material.dispose();texture.dispose();}};
}
