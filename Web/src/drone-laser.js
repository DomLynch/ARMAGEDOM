import * as T from 'three';
import {DRONE_RULES} from './drone-mechanics.js';
// One local, depth-tested quad per existing live projectile. No damage, light,
// textures, bloom, afterimage or new projectile trajectory/clock authority.
const vertexShader=`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`;
const fragmentShader=`varying vec2 vUv;uniform float lengthMetres;
void main(){float x=(vUv.x-1.0)*lengthMetres;float y=abs((vUv.y-.5)*.24);
float head=smoothstep(-.28,-.14,x)*(1.0-smoothstep(-.012,0.0,x));
float tail=smoothstep(-lengthMetres,-.10,x)*(1.0-smoothstep(-.055,-.015,x));
float core=exp(-y*y/.00030)*head;
float red=exp(-y*y/.00075)*max(head,tail*.7);
float glow=exp(-y*y/.0025)*max(head*.6,tail*.35);
float alpha=max(core,max(red*.85,glow*.7));if(alpha<.004)discard;
vec3 color=mix(vec3(1.0,.015,.025),vec3(1.0,.78,.72),core);
gl_FragColor=vec4(color,alpha);
#include <colorspace_fragment>
}`;
export function createDroneLaserBolts({scene,world,camera}){
 if(!scene?.isScene||!camera?.isCamera||typeof world?.toRender!=='function')throw Error('Laser view requires scene/world/camera');
 const geometry=new T.PlaneGeometry(1,2);geometry.translate(-.5,0,0);
 const entries=new Map(),direction=new T.Vector3(),toward=new T.Vector3(),up=new T.Vector3(),normal=new T.Vector3(),basis=new T.Matrix4(),cameraPosition=new T.Vector3();let disposed=false;
 function reset(){for(const mesh of entries.values()){mesh.removeFromParent();mesh.material.dispose();}entries.clear();}
 return{
  sync(items,time){
   if(disposed)throw Error('Laser view disposed');if(!Array.isArray(items)||!Number.isFinite(time))throw Error('Invalid laser clock/items');
   const live=items.filter(b=>!b.dead&&time<b.expires),ids=new Set(live.map(b=>b.id));for(const[id,mesh]of entries)if(!ids.has(id)){mesh.removeFromParent();mesh.material.dispose();entries.delete(id);}
   camera.getWorldPosition(cameraPosition);
   for(const b of live){if(![b.pos?.x,b.pos?.z,b.dir?.x,b.dir?.z,b.expires,b.height??DRONE_RULES.hoverHeight].every(Number.isFinite)||Math.hypot(b.dir.x,b.dir.z)<1e-8)throw Error('Invalid existing bolt');
    let mesh=entries.get(b.id);if(!mesh){const material=new T.ShaderMaterial({vertexShader,fragmentShader,uniforms:{lengthMetres:{value:0}},transparent:true,depthTest:true,depthWrite:false,blending:T.AdditiveBlending,toneMapped:false,side:T.DoubleSide});mesh=new T.Mesh(geometry,material);mesh.name='ARM laser bolt '+b.id;mesh.frustumCulled=false;entries.set(b.id,mesh);scene.add(mesh);}
    const born=b.expires-DRONE_RULES.boltRange/DRONE_RULES.boltSpeed,length=Math.min(.60,Math.max(0,(time-born)*DRONE_RULES.boltSpeed));mesh.visible=length>1e-5;
    mesh.position.copy(world.toRender(b.pos,b.height??DRONE_RULES.hoverHeight));direction.set(b.dir.x,0,-b.dir.z).normalize();toward.copy(cameraPosition).sub(mesh.position).normalize();up.crossVectors(toward,direction);if(up.lengthSq()<1e-8)up.crossVectors(new T.Vector3(0,1,0),direction);up.normalize();normal.crossVectors(direction,up).normalize();basis.makeBasis(direction,up,normal);mesh.quaternion.setFromRotationMatrix(basis);mesh.scale.set(length,.12,1);mesh.material.uniforms.lengthMetres.value=length;
   }
  },reset,stats(){return{active:entries.size,sharedGeometries:disposed?0:1,privateMaterials:entries.size,newTextures:0,trianglesPerBolt:2,maxTrailMetres:.60,disposed};},dispose(){if(disposed)return;reset();geometry.dispose();disposed=true;},
 };
}
