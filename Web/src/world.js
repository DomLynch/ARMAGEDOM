import {createGeometry} from './world-geometry.js';
const ASPECT=1672/941;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
// Unity SmoothDamp's critically damped crop; the calibrated camera never moves.
function damp(value,target,velocity,time,dt) {
  const omega=2/Math.max(.0001,time),x=omega*dt,decay=1/(1+x+.48*x*x+.235*x*x*x);
  const change=value-target,temp=(velocity+omega*change)*dt;
  return [target+(change+temp)*decay,(velocity-omega*temp)*decay];
}
export class LondonWorld {
  constructor({THREE,scene,camera,layout,texture,manifest=null,baseUrl=null}) {
    this.THREE=THREE;this.scene=scene;this.camera=camera;this.layout=layout;this.texture=texture;
    this.geometry=createGeometry(layout);this.spawn={x:0,z:-6};this.cameraRight={x:1,z:0};this.cameraForward={x:0,z:1};
    this.manifest=manifest;this.baseUrl=baseUrl;this.areaId='westminster';this.disposed=false;
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
    const point=this.geometry.point(position),link=this.manifest?.links.find(link=>link.from===this.areaId&&
      Object.entries(link.condition).every(([key,value])=>key==='xMin'?point.x>value:key==='xMax'?point.x<value:key==='yMin'?point.y>value:point.y<value));
    return link?{areaId:link.to,entryPoint:{...link.entry}}:null;
  }
  async loadArea(areaId,entryPoint=this.manifest?.entries[areaId]) {
    if(!this.manifest?.files.some(file=>file.area===areaId)||!entryPoint)throw Error('Unknown London area');
    const generation=this.loadGeneration=(this.loadGeneration??0)+1;
    const {THREE,scene,camera}=this,url=new URL(`world/${areaId}/`,this.baseUrl);
    const response=await fetch(new URL('layout.json',url));if(!response.ok)throw Error(`London layout HTTP ${response.status}`);
    const layout=await response.json(),geometry=createGeometry(layout),entry=geometry.ground(entryPoint);
    if(!geometry.clear(entry,.4))throw Error('London entry is blocked');
    const texture=await new THREE.TextureLoader().loadAsync(new URL('backdrop.png',url).href);
    let next;
    try {
      if(this.disposed||generation!==this.loadGeneration)throw Error('London load superseded');
      // Build against an isolated scene and camera; current art/collision stay live until ready.
      next=new LondonWorld({THREE,scene:new THREE.Scene(),camera:camera.clone(),layout,texture,manifest:this.manifest,baseUrl:this.baseUrl});
      next.update(entry,0,this.width,this.height,true);
      this.dispose();camera.copy(next.camera,false);next.camera=camera;next.scene=scene;scene.add(next.group);
      Object.assign(this,next);this.areaId=areaId;this.spawn={...entry};return {...entry};
    } catch(e){if(next)next.dispose();else texture.dispose();throw e;}
  }
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
      // A scaled 2m reference stays ~70 CSS pixels; zoom>=1 keeps the finite painting covering the screen.
      const actorHeight=Math.abs(geometry.point(playerPosition,2*layout.characterScale).y-p.y);
      zoom=clamp(70/(actorHeight*Math.max(1,height)),1,4);
    }
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
    if(this.disposed)return;this.disposed=true;this.loadGeneration=(this.loadGeneration??0)+1;
    this.scene.remove(this.group);this.group.traverse(object=>object.geometry?.dispose());
    this.backdrop.material.dispose();this.depthMaterial.dispose();this.texture.dispose();
  }
}
export async function createWorld({THREE,renderer,scene,camera,baseUrl=globalThis.document?.baseURI}) {
  const manifestResponse=await fetch(new URL('world/manifest.json',baseUrl));if(!manifestResponse.ok)throw Error(`London manifest HTTP ${manifestResponse.status}`);
  const manifest=await manifestResponse.json();
  const url=new URL('world/westminster/',baseUrl);
  const response=await fetch(new URL('layout.json',url));if(!response.ok)throw Error(`London layout HTTP ${response.status}`);
  const layout=await response.json();createGeometry(layout);
  const texture=await new THREE.TextureLoader().loadAsync(new URL('backdrop.png',url).href);
  try {return new LondonWorld({THREE,renderer,scene,camera,layout,texture,manifest,baseUrl});} catch(e){texture.dispose();throw e;}
}
