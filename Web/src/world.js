import {createGeometry} from './world-geometry.js';
import {createAreaRegistry} from './area-registry.js';
const ASPECT=1672/941;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Unity SmoothDamp's critically damped crop; the calibrated camera never moves.
function damp(value,target,velocity,time,dt) {
  const omega=2/Math.max(.0001,time),x=omega*dt,decay=1/(1+x+.48*x*x+.235*x*x*x);
  const change=value-target,temp=(velocity+omega*change)*dt;
  return [target+(change+temp)*decay,(velocity-omega*temp)*decay];
}
export class LondonWorld {
  constructor({THREE,scene,camera,layout,texture,manifest=null,baseUrl=null,viewZoomMultiplier=1,registry=null}) {
    if(!Number.isFinite(viewZoomMultiplier)||viewZoomMultiplier<1)throw Error('View zoom multiplier must be finite and at least 1');
    this.viewZoomMultiplier=viewZoomMultiplier;
    this.THREE=THREE;this.scene=scene;this.camera=camera;this.layout=layout;this.texture=texture;
    this.geometry=createGeometry(layout);this.spawn={x:0,z:-6};this.cameraRight={x:1,z:0};this.cameraForward={x:0,z:1};
    this.manifest=manifest;this.registry=registry??createAreaRegistry({manifest});this.baseUrl=baseUrl;this.areaId=this.registry.initialArea;this.disposed=false;
    this.center={x:.5,y:.5};this.velocity={x:0,y:0};this.group=new THREE.Group();this.group.name='London registered image stage';
    camera.fov=layout.fieldOfView;camera.aspect=ASPECT;camera.near=.1;camera.far=300;
    camera.position.set(0,layout.height,layout.distance);camera.up.set(0,1,0);camera.lookAt(0,0,-layout.targetZ);
    camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    this.calibrated=camera.projectionMatrix.clone();this.crop=new THREE.Matrix4();
    this.ray=new THREE.Raycaster();this.plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);this.hit=new THREE.Vector3();this.ndc=new THREE.Vector2();
    texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
    this.backdrop=this.quad([{x:0,y:1},{x:1,y:1},{x:1,y:0},{x:0,y:0}],100,
      new THREE.MeshBasicMaterial({map:texture,color:new THREE.Color(layout.exposure,layout.exposure,layout.exposure),depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}),-100);
    this.backdrop.name='Original London image';
    const depth=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:true,depthTest:true,side:THREE.DoubleSide});
    this.masks=layout.masks.map(mask=>{
      const foot=this.geometry.ground(mask.foot),distance=this.geometry.point(foot).depth;
      const mesh=this.quad(mask.points,distance,depth,-90);mesh.name=mask.name;return mesh;
    });
    this.depthMaterial=depth;scene.add(this.group);this.update(this.spawn,0,1672,941,true);
  }
  toRender(position,height=0) {return new this.THREE.Vector3(position.x,height,-position.z);}
  quad(points,distance,material,order) {
    const {THREE,camera}=this,positions=[],uv=[],indices=[];
    for(const p of points) {
      const v=new THREE.Vector3(2*p.x-1,1-2*p.y,.5).unproject(camera).applyMatrix4(camera.matrixWorldInverse);
      v.multiplyScalar(distance/-v.z).applyMatrix4(camera.matrixWorld);
      positions.push(v.x,v.y,v.z);uv.push(p.x,1-p.y);
    }
    for(let i=1;i<points.length-1;i++)indices.push(0,i,i+1);
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);
    const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=order;mesh.frustumCulled=false;this.group.add(mesh);return mesh;
  }
  move(position,delta,radius){return this.geometry.move(position,delta,radius);}
  lineClear(a,b){return this.geometry.lineClear(a,b);}
  get actorScale(){return this.layout.characterScale;}
  travelAt(position) {
    const point=this.geometry.point(position),link=this.registry.links(this.areaId).find(link=>
      Object.entries(link.condition).every(([key,value])=>key==='xMin'?point.x>value:key==='xMax'?point.x<value:key==='yMin'?point.y>value:point.y<value));
    return link?{areaId:link.to,entryPoint:{...link.entry}}:null;
  }
  async loadArea(areaId,entryPoint=this.registry.get(areaId)?.entry) {
    if(!this.registry.has(areaId)||!entryPoint)throw Error('Unknown London area');
    const cache=this.areaCache??=this.createAreaCache(),generation=++cache.generation;
    const next=await this.prepareArea(areaId),entry=next.geometry.ground(entryPoint);
    if(!next.geometry.clear(entry,.4))throw Error('London entry is blocked');
    if(cache.disposed||generation!==cache.generation)throw Error('London load superseded');
    const {scene,camera,THREE}=this;
    const previous=Object.assign(Object.create(LondonWorld.prototype),this,{scene:new THREE.Scene(),camera:camera.clone(),gpuReady:cache.stages.get(this.areaId)?.gpuReady??false});
    previous.scene.add(this.group);cache.stages.set(this.areaId,previous);
    next.update(entry,0,this.width,this.height,true);camera.copy(next.camera,false);
    Object.assign(this,next,{scene,camera,areaCache:cache,spawn:{...entry}});scene.add(this.group);return {...entry};
  }
  createAreaCache(){
    const initial=Object.assign(Object.create(LondonWorld.prototype),this,{scene:new this.THREE.Scene(),camera:this.camera.clone()});
    return{stages:new Map([[this.areaId,initial]]),pending:new Map(),generation:0,disposed:false};
  }
  async prepareArea(areaId){
    if(!this.registry.has(areaId))throw Error('Unknown London area');
    const cache=this.areaCache??=this.createAreaCache();if(cache.disposed)throw Error('London cache disposed');
    if(cache.stages.has(areaId))return cache.stages.get(areaId);
    if(cache.pending.has(areaId))return cache.pending.get(areaId);
    const task=(async()=>{
      const row=this.registry.get(areaId),response=await fetch(new URL(this.registry.asset(row.layoutRef).path,this.baseUrl));
      if(!response.ok)throw Error(`London layout HTTP ${response.status}`);
      const layout=await response.json();createGeometry(layout);
      const texture=await new this.THREE.TextureLoader().loadAsync(new URL(this.registry.asset(row.backdropRef).path,this.baseUrl).href);
      let next;
      try{
        if(cache.disposed)throw Error('London cache disposed');
        const bytes=[...cache.stages.values()].reduce((n,s)=>n+s.textureBytes(),0)+(texture.image?.width??0)*(texture.image?.height??0)*4*7/3;
        if(bytes>48*1024*1024)throw Error('London prepared texture budget exceeded');
        next=new LondonWorld({THREE:this.THREE,scene:new this.THREE.Scene(),camera:this.camera.clone(),layout,texture,manifest:this.manifest,registry:this.registry,baseUrl:this.baseUrl,viewZoomMultiplier:this.viewZoomMultiplier});
        next.areaId=areaId;cache.stages.set(areaId,next);return next;
      }catch(error){if(next)next.disposeStage();else texture.dispose();throw error;}
    })();
    cache.pending.set(areaId,task);try{return await task;}finally{cache.pending.delete(areaId);}
  }
  textureBytes(){return (this.texture.image?.width??0)*(this.texture.image?.height??0)*4*7/3;}
  preparationStats(){const c=this.areaCache;return{areas:c?[...c.stages.keys()]:[this.areaId],pending:c?[...c.pending.keys()]:[],textureBudgetBytes:48*1024*1024,estimatedTextureBytes:c?[...c.stages.values()].reduce((n,s)=>n+s.textureBytes(),0):this.textureBytes()};}
  isAreaReady(areaId){return !!this.areaCache?.stages.get(areaId)?.gpuReady;}
  markAreaReady(areaId){const stage=this.areaCache?.stages.get(areaId);if(stage)stage.gpuReady=true;if(areaId===this.areaId)this.gpuReady=true;}
  cachedArea(areaId){return this.areaCache?.stages.get(areaId);}
  invalidateReadiness(){if(this.areaCache)for(const stage of this.areaCache.stages.values())stage.gpuReady=false;this.gpuReady=false;}
  screenToGround(ndcX,ndcY) {
    this.ndc.set(ndcX,ndcY);this.ray.setFromCamera(this.ndc,this.camera);
    const hit=this.ray.ray.intersectPlane(this.plane,this.hit);
    return hit?{x:hit.x,z:-hit.z}:null;
  }
  update(playerPosition,dt,width,height,immediate=false) {
    this.width=width;this.height=height;
    const {layout,geometry,camera}=this;
    const p=geometry.point(playerPosition);
    let zoom=layout.zoom;
    if(layout.followPlayerSize) {
      const reference=geometry.ground({x:.52,y:.78});
      const projectedHeight=q=>Math.abs(geometry.point(q,2).y-geometry.point(q).y);
      zoom=clamp(zoom*projectedHeight(reference)/projectedHeight(playerPosition),1,4);
    }
    const aspect=Math.max(1,width)/Math.max(1,height),portrait=aspect<1;
    if(portrait) {
      // A scaled 2m reference stays ~63 CSS pixels; zoom>=1 keeps the finite painting covering the screen.
      const actorHeight=Math.abs(geometry.point(playerPosition,2*layout.characterScale).y-p.y);
      zoom=clamp(63/(actorHeight*Math.max(1,height)),1,4);
    }
    if(!portrait)zoom*=1.1;else zoom*=1.05;
    zoom*=this.viewZoomMultiplier;
    const zx=zoom*Math.max(1,ASPECT/aspect),zy=zoom*Math.max(1,aspect/ASPECT);
    const ex=.5/zx,ey=.5/zy,target={x:clamp(p.x,ex,1-ex),y:clamp(1-p.y+(portrait?.02/zy:.1),ey,1-ey)};
    if(immediate){this.center=target;this.velocity={x:0,y:0};}
    else {
      [this.center.x,this.velocity.x]=damp(this.center.x,target.x,this.velocity.x,layout.followSeconds,Math.max(0,Math.min(dt,.1)));
      [this.center.y,this.velocity.y]=damp(this.center.y,target.y,this.velocity.y,layout.followSeconds,Math.max(0,Math.min(dt,.1)));
    }
    this.center.x=clamp(this.center.x,ex,1-ex);this.center.y=clamp(this.center.y,ey,1-ey);
    this.crop.identity();this.crop.elements[0]=zx;this.crop.elements[5]=zy;
    this.crop.elements[12]=-2*zx*(this.center.x-.5);this.crop.elements[13]=-2*zy*(this.center.y-.5);
    camera.projectionMatrix.multiplyMatrices(this.crop,this.calibrated);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  }
  dispose() {
    if(this.areaCache){const cache=this.areaCache;if(cache.disposed)return;cache.disposed=true;cache.generation++;for(const stage of cache.stages.values())stage.disposeStage();cache.stages.clear();this.disposed=true;return;}
    this.disposeStage();
  }
  disposeStage() {
    if(this.disposed)return;this.disposed=true;
    this.group.removeFromParent();this.group.traverse(object=>object.geometry?.dispose());
    this.backdrop.material.dispose();this.depthMaterial.dispose();this.texture.dispose();
  }
}
export async function createWorld({THREE,renderer,scene,camera,baseUrl=globalThis.document?.baseURI,viewZoomMultiplier=1}) {
  const manifestResponse=await fetch(new URL('world/manifest.json',baseUrl));if(!manifestResponse.ok)throw Error(`London manifest HTTP ${manifestResponse.status}`);
  const manifest=await manifestResponse.json();
  const registry=createAreaRegistry({manifest}),row=registry.get(registry.initialArea);
  const response=await fetch(new URL(registry.asset(row.layoutRef).path,baseUrl));if(!response.ok)throw Error(`London layout HTTP ${response.status}`);
  const layout=await response.json();createGeometry(layout);
  const texture=await new THREE.TextureLoader().loadAsync(new URL(registry.asset(row.backdropRef).path,baseUrl).href);
  try {return new LondonWorld({THREE,renderer,scene,camera,layout,texture,manifest,registry,baseUrl,viewZoomMultiplier});} catch(e){texture.dispose();throw e;}
}
