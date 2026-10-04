import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {ActorMotion} from './motion.js';
const names=['revenant','orc','warlock','warlord'];
export async function loadActors(baseUrl,onProgress=()=>{}){
 const manifestURL=new URL('assets/manifest-lossless.json',baseUrl),response=await fetch(manifestURL);if(!response.ok)throw Error(`Character manifest HTTP ${response.status}`);const manifest=await response.json(),loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),models=new Map(),urls=new Map();
 // One shared source per GLB, including the original Orc/Warlord reuse.
 await Promise.all(Object.entries(manifest.models).map(async([name,description])=>{const url=new URL(description.url,manifestURL).href;if(!urls.has(url))urls.set(url,loader.loadAsync(url));const gltf=await urls.get(url);models.set(name,{gltf,description});onProgress(name);}));
 if(!models.has('vagrant'))throw Error('Survivor export missing');return {models,manifest,complete:names.every(n=>models.has(n))};
}
function shadowTexture(){const canvas=document.createElement('canvas');canvas.width=canvas.height=64;const ctx=canvas.getContext('2d'),g=ctx.createRadialGradient(32,32,3,32,32,31);g.addColorStop(0,'rgba(0,0,0,.6)');g.addColorStop(.55,'rgba(0,0,0,.25)');g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);return new THREE.CanvasTexture(canvas);}
export function createActors(scene,world,library){const views=new Map(),shadowMap=shadowTexture(),shadowGeometry=new THREE.PlaneGeometry(1,1);
 function make(entity){const name=entity.kind<0?'vagrant':names[entity.kind],source=library.models.get(name);if(!source)throw Error(`Original ${name} export not ready`);
 const root=new THREE.Group(),model=clone(source.gltf.scene),description=source.description,materials=[];root.name=name;root.position.copy(world.toRender(entity.pos));root.scale.setScalar((world.layout.characterScale??1.265)*(description.scale??1));root.add(model);scene.add(root);
 const hidden=new Set((description.starterHidden??[]).map(THREE.PropertyBinding.sanitizeNodeName));model.traverse(o=>{if(hidden.has(o.name))o.visible=false;if(o.isMesh){o.frustumCulled=false;const original=Array.isArray(o.material)?o.material:[o.material];const copies=original.map(m=>{const own=m.clone();materials.push({material:own,emissive:own.emissive?.clone(),intensity:own.emissiveIntensity});return own;});o.material=Array.isArray(o.material)?copies:copies[0];}});
 const shadow=new THREE.Mesh(shadowGeometry,new THREE.MeshBasicMaterial({map:shadowMap,transparent:true,depthWrite:false,toneMapped:false}));shadow.rotation.x=-Math.PI/2;shadow.scale.set(1.25*root.scale.x,1.25*root.scale.x,1);shadow.renderOrder=0;scene.add(shadow);
 const motion=new ActorMotion(root,model,source.gltf.animations,description);const view={root,model,shadow,motion,materials,entity,description};views.set(entity.id,view);return view;
 }
 function remove(id){const view=views.get(id);if(!view)return;view.motion.dispose();scene.remove(view.root,view.shadow);view.shadow.material.dispose();for(const m of view.materials)m.material.dispose();views.delete(id);}
 return {views,reset(){for(const id of [...views.keys()])remove(id);},update(game,dt){const entities=[game.player,...game.enemies],ids=new Set(entities.map(e=>e.id));for(const id of [...views.keys()])if(!ids.has(id))remove(id);
 for(const entity of entities){const view=views.get(entity.id)??make(entity);view.root.position.copy(world.toRender(entity.pos));view.root.rotation.y=Math.atan2(entity.facing.x,-entity.facing.z)+(view.description.forwardCorrection??0);view.root.updateMatrixWorld(true);view.motion.update(entity,game.time,game.finished?0:dt);view.shadow.position.copy(world.toRender(entity.pos,.016));
 const flash=!game.finished&&entity.flashUntil>game.time;for(const m of view.materials){if(m.material.emissive){m.material.emissive.copy(flash?new THREE.Color(.65,.2,.05):m.emissive);m.material.emissiveIntensity=flash?.8:m.intensity;}}
 }
 },dispose(){this.reset();shadowMap.dispose();shadowGeometry.dispose();}};
}
