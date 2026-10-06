import * as T from 'three';

// Inverse hull of the actual static pickup mesh. No surface/texture mutation.
const hulls=new WeakMap();
const vertexShader=`
  uniform vec2 viewport;
  uniform float stroke;
  void main(){
    vec4 p=vec4(position,1.0);
    vec3 n=normal;
    #ifdef USE_INSTANCING
      p=instanceMatrix*p;
      mat3 im=mat3(instanceMatrix);
      n/=vec3(dot(im[0],im[0]),dot(im[1],im[1]),dot(im[2],im[2]));
      n=im*n;
    #endif
    vec4 clip=projectionMatrix*modelViewMatrix*p;
    vec2 direction=(projectionMatrix*vec4(normalize(normalMatrix*n),0.0)).xy;
    direction/=max(length(direction),0.00001);
    clip.xy+=direction*(2.0*stroke/viewport)*clip.w;
    gl_Position=clip;
  }`;
const fragmentShader=`
  uniform vec3 color;
  void main(){
    gl_FragColor=vec4(color,1.0);
    #include <colorspace_fragment>
  }`;

function acquireHull(source){
  let entry=hulls.get(source);
  if(entry){entry.users++;return entry;}
  const p=source.attributes.position,normal=new Float32Array(p.count*3),sum=new Map();
  const vector=new T.Vector3(),a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),edge=new T.Vector3();
  const key=i=>`${p.getX(i).toFixed(6)},${p.getY(i).toFixed(6)},${p.getZ(i).toFixed(6)}`;
  // Merge only outline normals at coincident positions, leaving hard-surface
  // original normals/UV seams untouched. Area-weighted triangle normals.
  const index=source.index,at=i=>index?index.getX(i):i;
  for(let f=0;f<(index?.count??p.count);f+=3){
    const ids=[at(f),at(f+1),at(f+2)];a.fromBufferAttribute(p,ids[0]);b.fromBufferAttribute(p,ids[1]);c.fromBufferAttribute(p,ids[2]);
    vector.subVectors(b,a).cross(edge.subVectors(c,a));
    for(const i of ids){const k=key(i);if(!sum.has(k))sum.set(k,new T.Vector3());sum.get(k).add(vector);}
  }
  for(let i=0;i<p.count;i++){vector.copy(sum.get(key(i))).normalize();normal.set(vector.toArray(),i*3);}
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',p.clone());geometry.setAttribute('normal',new T.BufferAttribute(normal,3));
  if(index)geometry.setIndex(index.clone());geometry.setDrawRange(source.drawRange.start,source.drawRange.count);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  entry={geometry,users:1};hulls.set(source,entry);return entry;
}

// Preserve the existing addPickupGlow(mesh) / {halo,dispose} public API.
export function addPickupGlow(mesh){
  const materials=Array.isArray(mesh?.material)?mesh.material:[mesh?.material];
  if(!mesh?.isMesh||mesh.isSkinnedMesh||materials.some(m=>!m?.isMeshStandardMaterial))throw new TypeError('Pickup contour requires an unskinned Standard-material mesh');
  const source=mesh.geometry,entry=acquireHull(source),viewport=new T.Vector4();
  const material=new T.ShaderMaterial({vertexShader,fragmentShader,uniforms:{viewport:{value:new T.Vector2(1,1)},stroke:{value:1.05},color:{value:new T.Color(0xffca85)}},side:T.BackSide,depthTest:true,depthWrite:false,toneMapped:false});
  const halo=mesh.isInstancedMesh?new T.InstancedMesh(entry.geometry,material,mesh.instanceMatrix.count):new T.Mesh(entry.geometry,material);
  let version=-1,disposed=false;
  function sync(){if(mesh.isInstancedMesh){halo.count=mesh.count;if(version!==mesh.instanceMatrix.version){halo.instanceMatrix.copy(mesh.instanceMatrix);halo.instanceMatrix.needsUpdate=true;version=mesh.instanceMatrix.version;}}}
  sync();halo.name='Ground pickup thin contour';halo.frustumCulled=false;halo.renderOrder=mesh.renderOrder+.01;
  halo.onBeforeRender=renderer=>{sync();renderer.getCurrentViewport(viewport);material.uniforms.viewport.value.set(Math.max(1,viewport.z),Math.max(1,viewport.w));material.uniforms.stroke.value=1.05*renderer.getPixelRatio();};
  mesh.add(halo);
  return {halo,dispose(){if(disposed)return;disposed=true;halo.onBeforeRender=()=>{};halo.removeFromParent();if(halo.isInstancedMesh)halo.dispose();material.dispose();if(--entry.users===0){entry.geometry.dispose();hulls.delete(source);}}};
}
