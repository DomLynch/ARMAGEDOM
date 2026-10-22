import * as T from 'three';
import {createWorld} from '../world.js';
import {loadActors,createActors} from '../actors.js';
import {createDroneLaserBolts} from '../drone-laser.js';
import {posedActorBounds} from '../engine/grenade-surface.js';
import {applyAreaLighting} from '../engine/area-lighting.js';
import {COMMANDER_RULES} from './match.js';
const ASPECT=1672/941,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export async function createCommanderView({canvas,baseUrl}){
 const renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.NoToneMapping;renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(),fill=new T.HemisphereLight(0xb9bec9,0x4b3828,1.6),sun=new T.DirectionalLight(0xffd7a0,2.3);sun.position.set(-7,12,6);scene.add(fill,sun);
 let world,library;const settled=await Promise.allSettled([createWorld({THREE:T,renderer,scene,camera,baseUrl}),loadActors(baseUrl,()=>{},'assets/manifest-hollow.json')]);
 if(settled.some(r=>r.status==='rejected')){for(const r of settled)if(r.status==='fulfilled')r.value.dispose();renderer.dispose();throw settled.find(r=>r.status==='rejected').reason;}
 [world,library]=settled.map(r=>r.value);applyAreaLighting(scene,world);if(world.routeGuidance?.group)world.routeGuidance.group.visible=false;
 const actors=createActors(scene,world,library,{visualScale:1.3225}),lasers=createDroneLaserBolts({scene,world,camera}),rings=new Map(),ringGeometry=new T.RingGeometry(1.16,1.22,32),objectiveGeometry=new T.RingGeometry(COMMANDER_RULES.captureRadius-.06,COMMANDER_RULES.captureRadius,48),objectiveMaterial=new T.MeshBasicMaterial({color:0xe2bc72,transparent:true,opacity:.85,depthWrite:false,side:T.DoubleSide}),objectiveRing=new T.Mesh(objectiveGeometry,objectiveMaterial);objectiveRing.rotation.x=-Math.PI/2;scene.add(objectiveRing);
 const ray=new T.Raycaster(),hit=new T.Vector3(),crop=new T.Matrix4();let width=1,height=1,focus={x:.6,y:.69},zx=1,zy=1,disposed=false;
 // Only the calibrated projection crop changes. The painted backdrop/masks,
 // camera position/FOV and all body coordinates keep their shared registration.
 function frameCamera(){const aspect=width/height;zx=Math.max(1,ASPECT/aspect);zy=Math.max(1,aspect/ASPECT);const ex=.5/zx,ey=.5/zy;focus.x=clamp(focus.x,ex,1-ex);focus.y=clamp(focus.y,ey,1-ey);crop.identity();crop.elements[0]=zx;crop.elements[5]=zy;crop.elements[12]=-2*zx*(focus.x-.5);crop.elements[13]=2*zy*(focus.y-.5);camera.projectionMatrix.multiplyMatrices(crop,world.calibrated);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();}
 function resize(){width=Math.max(1,canvas.clientWidth||innerWidth);height=Math.max(1,canvas.clientHeight||innerHeight);renderer.setSize(width,height,false);frameCamera();}
 function renderFrame(s){return{player:s.units[0],enemies:[...s.units.slice(1),...s.opponents],corpses:[],world,time:s.time,finished:!!s.result,events:s.events,pilot:'donor-knife',bolts:s.bolts,loot:[],bossEquipment:{},flame:null};}
 return{
  world,actors,renderer,camera,
  async prepare(s){if(disposed)return false;await actors.ensureAreaModels(renderFrame(s));if(disposed)return false;resize();this.recentre(s);this.render(s,0);return true;},
  async reset(s){if(disposed)return false;actors.reset();lasers.reset();return this.prepare(s);},
  render(s,dt,{paused=false,events=[]}={}){
   if(disposed)return;const g=renderFrame(s);g.events=events;actors.events(g);actors.update(g,paused?0:dt);lasers.sync(paused?[]:s.bolts,s.time);objectiveRing.position.copy(world.toRender(s.objective.pos,.025));objectiveMaterial.color.setHex(s.phase==='capture'?0xe2bc72:0x64d5c1);objectiveRing.visible=!s.result;
   const liveIds=new Set(s.units.filter(e=>e.hp>0).map(e=>e.id));for(const[id,m]of rings)if(!liveIds.has(id)){m.removeFromParent();m.material.dispose();rings.delete(id);}
   for(const e of s.units.filter(e=>e.hp>0)){let m=rings.get(e.id);if(!m){m=new T.Mesh(ringGeometry,new T.MeshBasicMaterial({color:0x72d3ed,transparent:true,opacity:.4,depthWrite:false,side:T.DoubleSide}));m.rotation.x=-Math.PI/2;scene.add(m);rings.set(e.id,m);}m.position.copy(world.toRender(e.pos,.035));m.material.opacity=s.selected.includes(e.id)?.95:.25;}
   renderer.render(scene,camera);
  },
  resize,
  pan(dx,dy){focus.x+=dx;focus.y+=dy;frameCamera();},
  drag(dx,dy){this.pan(-dx/(width*zx),-dy/(height*zy));},
  recentre(s){focus=world.geometry.point(s.objective.pos);frameCamera();},
  project(p,y=0){const v=world.toRender(p,y).project(camera);return{x:(v.x+1)*width/2,y:(1-v.y)*height/2,visible:Math.abs(v.x)<=1&&Math.abs(v.y)<=1&&Math.abs(v.z)<=1};},
  ground(x,y){return world.screenToGround(x/width*2-1,1-y/height*2);},
  pick(s,x,y){ray.setFromCamera({x:x/width*2-1,y:1-y/height*2},camera);const cover=ray.intersectObjects(world.masks,false)[0]?.distance??Infinity;let best=null;
   for(const e of [...s.units,...s.opponents].filter(e=>e.hp>0)){const box=posedActorBounds(actors.views.get(e.id));if(!box)continue;box.expandByScalar(.12);const p=ray.ray.intersectBox(box,hit);if(!p)continue;const d=ray.ray.origin.distanceTo(p);if(d<cover-1e-8&&(!best||d<best.distance))best={id:e.id,team:e.team,distance:d};}return best;
  },
  diagnostics(s){return{viewport:{width,height},camera:{position:camera.position.toArray(),fov:camera.fov,focus:{x:focus.x,y:focus.y}},objective:this.project(s.objective.pos),units:s.units.map(e=>({id:e.id,point:this.project(e.pos,.9),rootScale:actors.views.get(e.id)?.root.scale.x,viewName:actors.views.get(e.id)?.root.name})),opponents:s.opponents.filter(e=>e.hp>0).map(e=>({id:e.id,point:this.project(e.pos,1.1)}))};},
  dispose(){if(disposed)return;disposed=true;renderer.setAnimationLoop(null);lasers.dispose();for(const m of rings.values()){m.removeFromParent();m.material.dispose();}rings.clear();ringGeometry.dispose();objectiveRing.removeFromParent();objectiveGeometry.dispose();objectiveMaterial.dispose();actors.dispose();world.dispose();renderer.dispose();}
 };
}
