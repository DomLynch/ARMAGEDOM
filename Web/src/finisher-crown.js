import * as T from 'three';

// Owned static skull buffers only. The caller's prepared head materials/maps,
// private actor skeleton and original model remain borrowed and unchanged.
export function prepareSplitCrown(head,{maxVertices=100000}={}){
 if(!head?.group||!head.center||!Number.isSafeInteger(maxVertices)||maxVertices<1)throw Error('Invalid crown preparation');
 const nodes=head.group.children.filter(n=>n.isMesh&&['Photo','PhotoEyes','PhotoTeeth','Scavenger hair'].includes(n.name));
 const photo=nodes.find(n=>n.name==='Photo');if(!photo)throw Error('Crown requires an authored human head');
 photo.geometry.computeBoundingBox();const bounds=photo.geometry.boundingBox,plane=-head.center.x,hinge=bounds.min.y;
 if(!(plane>bounds.min.x&&plane<bounds.max.x))throw Error('Crown plane outside supported head');
 const group=new T.Group();group.name='Prepared Split Crown';group.position.copy(head.center);
 const geometries=[],caps=[],halves=[],cut=new T.MeshStandardMaterial({name:'Owned crown cut',color:0x49251f,roughness:1,side:T.DoubleSide});
 let vertices=0,triangles=0,capTriangles=0,capLoops=0,disposed=false;
 const dispose=()=>{if(disposed)return;disposed=true;group.removeFromParent();for(const g of geometries)g.dispose();cut.dispose();group.clear();};
 const eps=1e-7;
 try{
  for(const side of [-1,1]){
   const half=new T.Group();half.name=side<0?'Crown left':'Crown right';half.position.set(plane,hinge,0);group.add(half);halves.push(half);
   for(const node of nodes){
    const source=node.geometry,attrs=Object.entries(source.attributes).filter(([name])=>!['skinIndex','skinWeight'].includes(name)),position=source.attributes.position,index=source.index;
    if(!position||attrs.some(([,a])=>a.isInterleavedBufferAttribute))throw Error('Unsupported crown attributes');
    const output=Object.fromEntries(attrs.map(([name])=>[name,[]])),segments=[],groups=[];
    const vertex=i=>Object.fromEntries(attrs.map(([name,a])=>[name,Array.from({length:a.itemSize},(_,k)=>a.getComponent(i,k))]));
    const distance=v=>(v.position[0]-plane)*side;
    const lerp=(a,b,t)=>Object.fromEntries(attrs.map(([name])=>[name,a[name].map((v,k)=>v+(b[name][k]-v)*t)]));
    const point=v=>new T.Vector3(...v.position);
    const push=v=>{for(const[name,a]of attrs){const values=v[name].slice();if(name==='position'){values[0]-=plane;values[1]-=hinge;}if(name==='normal'||name==='tangent'){const n=new T.Vector3(...values.slice(0,3)).normalize();values.splice(0,3,...n.toArray());}output[name].push(...values);}};
    const materialAt=i=>source.groups.find(g=>i>=g.start&&i<g.start+g.count)?.materialIndex??0;
    for(let offset=0;offset<(index?.count??position.count);offset+=3){
     const tri=[0,1,2].map(k=>vertex(index?index.getX(offset+k):offset+k)),polygon=[],cross=[];
     for(let k=0;k<3;k++){
      const a=tri[k],b=tri[(k+1)%3],da=distance(a),db=distance(b),inside=da>=-eps,next=db>=-eps;
      if(inside)polygon.push(a);
      if(inside!==next){const v=lerp(a,b,da/(da-db));v.position[0]=plane;polygon.push(v);cross.push(point(v));}
     }
     if(cross.length===2&&cross[0].distanceToSquared(cross[1])>eps*eps)segments.push(cross);
     for(let k=1;k<polygon.length-1;k++){
      const a=point(polygon[0]),b=point(polygon[k]),c=point(polygon[k+1]);if(b.sub(a).cross(c.sub(a)).lengthSq()<1e-18)continue;
      const start=output.position.length/3;for(const v of [polygon[0],polygon[k],polygon[k+1]])push(v);
      const materialIndex=materialAt(offset),last=groups.at(-1);if(last&&last.materialIndex===materialIndex)last.count+=3;else groups.push({start,count:3,materialIndex});
     }
    }
    if(output.position.length){
     const geometry=new T.BufferGeometry();geometries.push(geometry);
     for(const[name,a]of attrs)geometry.setAttribute(name,new T.Float32BufferAttribute(output[name],a.itemSize));
     geometry.groups=groups;geometry.computeBoundingBox();geometry.computeBoundingSphere();vertices+=geometry.attributes.position.count;triangles+=geometry.attributes.position.count/3;
     const mesh=new T.Mesh(geometry,node.material);mesh.name=node.name+(side<0?' left':' right');mesh.frustumCulled=false;half.add(mesh);
    }
    // Weld slice endpoints only, preserving exterior UV seams. Triangulate each
    // corresponding cut contour, including the original open neck-rim closure.
    if(segments.length){
     const points=new Map(),edges=new Map(),key=p=>[p.y,p.z].map(v=>Math.round(v*1e5)).join('/');
     for(const[a,b]of segments){const ka=key(a),kb=key(b);if(ka===kb)continue;points.set(ka,a);points.set(kb,b);const id=[ka,kb].sort().join('|');if(!edges.has(id))edges.set(id,[ka,kb]);}
     const adjacency=new Map();for(const[a,b]of edges.values()){if(!adjacency.has(a))adjacency.set(a,new Set());if(!adjacency.has(b))adjacency.set(b,new Set());adjacency.get(a).add(b);adjacency.get(b).add(a);}
     if([...adjacency.values()].some(s=>s.size>2))throw Error('Branched crown slice');
     const remaining=new Set(edges.keys()),capPositions=[],capNormals=[],capUV=[];
     while(remaining.size){
      const first=edges.get(remaining.values().next().value),component=new Set(),todo=[first[0]];
      while(todo.length){const a=todo.pop();if(component.has(a))continue;component.add(a);todo.push(...adjacency.get(a));}
      const ends=[...component].filter(k=>adjacency.get(k).size===1);if(ends.length!==0&&ends.length!==2)throw Error('Invalid crown contour');
      const start=ends[0]??first[0],loop=[];let current=start,previous=null;
      for(let n=0;n<=component.size;n++){
       loop.push(points.get(current));const next=[...adjacency.get(current)].find(k=>k!==previous&&remaining.has([k,current].sort().join('|')));if(!next)break;
       remaining.delete([next,current].sort().join('|'));previous=current;current=next;if(current===start)break;
      }
      if(loop.length<3)continue;
      const contour=loop.map(p=>new T.Vector2(p.y,p.z)),faces=T.ShapeUtils.triangulateShape(contour,[]);if(!faces.length)throw Error('Empty crown cap');capLoops++;
      for(const face of faces){let ordered=face.map(i=>loop[i]);const normal=ordered[1].clone().sub(ordered[0]).cross(ordered[2].clone().sub(ordered[0]));if(normal.x*(-side)<0)ordered=[ordered[0],ordered[2],ordered[1]];
       for(const p of ordered){capPositions.push(p.x-plane,p.y-hinge,p.z);capNormals.push(-side,0,0);capUV.push((p.y-bounds.min.y)/(bounds.max.y-bounds.min.y),(p.z-bounds.min.z)/(bounds.max.z-bounds.min.z));}
      }
     }
     if(capPositions.length){const g=new T.BufferGeometry();geometries.push(g);g.setAttribute('position',new T.Float32BufferAttribute(capPositions,3));g.setAttribute('normal',new T.Float32BufferAttribute(capNormals,3));g.setAttribute('uv',new T.Float32BufferAttribute(capUV,2));g.computeBoundingSphere();vertices+=g.attributes.position.count;triangles+=g.attributes.position.count/3;capTriangles+=g.attributes.position.count/3;const mesh=new T.Mesh(g,cut);mesh.name=node.name+' crown cap';mesh.frustumCulled=false;half.add(mesh);caps.push(mesh);}
    }
    if(vertices>maxVertices)throw Error('Crown vertex budget exceeded');
   }
  }
  if(halves.some(h=>!h.children.length)||!caps.length)throw Error('Incomplete crown preparation');
  return{group,halves,caps,open(amount){const t=T.MathUtils.clamp(amount,0,1);halves.forEach((h,i)=>{const side=i?1:-1;h.rotation.z=-side*.19*t;h.position.x=plane+side*.008*t;});},stats(){return{vertices,triangles,capTriangles,capLoops,ownedGeometries:geometries.length,ownedMaterials:1,ownedTextures:0,geometryBytes:geometries.reduce((n,g)=>n+Object.values(g.attributes).reduce((a,b)=>a+b.array.byteLength,0),0)};},dispose};
 }catch(error){dispose();throw error;}
}
