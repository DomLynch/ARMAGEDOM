import * as T from 'three';

let quad=null, users=0;
const vertexShader=`
  varying vec2 vUv;
  uniform vec3 anchor;
  uniform float shapeRadius;
  void main(){
    vUv=uv;
    vec4 center=vec4(anchor,1.0);
    #ifdef USE_INSTANCING
      center=instanceMatrix*center;
    #endif
    center=modelMatrix*center;
    center.y+=0.06;
    float scale=max(length(modelMatrix[0].xyz),max(length(modelMatrix[1].xyz),length(modelMatrix[2].xyz)));
    float radius=max(0.19,shapeRadius*scale+0.11);
    vec4 point=viewMatrix*center;
    point.xy+=position.xy*radius*2.0;
    gl_Position=projectionMatrix*point;
  }`;
const fragmentShader=`
  varying vec2 vUv;
  uniform vec3 color;
  void main(){
    float r=length(vUv*2.0-1.0);
    float alpha=smoothstep(0.38,0.62,r)*(1.0-smoothstep(0.66,1.0,r))*0.60;
    if(alpha<0.01)discard;
    gl_FragColor=vec4(color,alpha);
    #include <colorspace_fragment>
  }`;

// Local soft halo, not a screen effect. Original surfaces stay recognisable.
// Nine helpers share one owned quad; matrices/materials belong to each handle.
export function addPickupGlow(mesh){
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  if(!mesh.isMesh||mesh.isSkinnedMesh||materials.some(m=>!m?.isMeshStandardMaterial))throw new TypeError('Pickup glow requires an unskinned Standard-material mesh');
  const box=new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position),size=box.getSize(new T.Vector3());
  if(!quad)quad=new T.PlaneGeometry(1,1);
  users++;
  const material=new T.ShaderMaterial({vertexShader,fragmentShader,uniforms:{anchor:{value:box.getCenter(new T.Vector3())},shapeRadius:{value:Math.max(size.x,size.y,size.z)*.5},color:{value:new T.Color(0xff7b12)}},transparent:true,depthTest:true,depthWrite:false,toneMapped:false});
  const halo=mesh.isInstancedMesh?new T.InstancedMesh(quad,material,mesh.count):new T.Mesh(quad,material);
  if(mesh.isInstancedMesh){halo.instanceMatrix.copy(mesh.instanceMatrix);halo.instanceMatrix.needsUpdate=true;}
  halo.name='Ground pickup soft halo';halo.frustumCulled=false;mesh.add(halo);
  let disposed=false;
  return {halo,dispose(){if(disposed)return;disposed=true;halo.removeFromParent();if(halo.isInstancedMesh)halo.dispose();material.dispose();if(--users===0){quad.dispose();quad=null;}}};
}
