import * as T from 'three';

// Art comparison only: smooth extrusion normals across primitive hard edges.
export function addPickupGlow(mesh){
 const geometry=mesh.geometry.clone(),p=geometry.attributes.position,n=geometry.attributes.normal,groups=new Map();
 for(let i=0;i<p.count;i++){const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>v.toFixed(6)).join('/');if(!groups.has(key))groups.set(key,[]);groups.get(key).push(i);}
 for(const ids of groups.values()){const normal=new T.Vector3();for(const i of ids)normal.add(new T.Vector3().fromBufferAttribute(n,i));normal.normalize();for(const i of ids)n.setXYZ(i,normal.x,normal.y,normal.z);}
 const layers=[];
 for(const [width,opacity] of [[.065,.3],[.03,.95]]){
  const material=new T.ShaderMaterial({uniforms:{width:{value:width},opacity:{value:opacity},color:{value:new T.Color(0xff7b12)}},side:T.BackSide,transparent:true,depthTest:true,depthWrite:false,toneMapped:false,
   vertexShader:`uniform float width;void main(){vec4 p=vec4(position,1.);vec3 n=normal;
    #ifdef USE_INSTANCING
    p=instanceMatrix*p;n=mat3(instanceMatrix)*n;
    #endif
    p=modelMatrix*p;p.xyz+=normalize(mat3(modelMatrix)*n)*width;gl_Position=projectionMatrix*viewMatrix*p;}`,
   fragmentShader:`uniform vec3 color;uniform float opacity;void main(){gl_FragColor=vec4(color,opacity);
    #include <colorspace_fragment>
   }`});
  const shell=mesh.isInstancedMesh?new T.InstancedMesh(geometry,material,mesh.count):new T.Mesh(geometry,material);if(mesh.isInstancedMesh){shell.instanceMatrix.copy(mesh.instanceMatrix);shell.instanceMatrix.needsUpdate=true;}shell.frustumCulled=false;mesh.add(shell);layers.push(shell);
 }
 let disposed=false;return{dispose(){if(disposed)return;disposed=true;for(const s of layers){s.removeFromParent();if(s.isInstancedMesh)s.dispose();s.material.dispose();}geometry.dispose();}};
}
