// Presentation only: authored road edges and safe paths never add collision or travel links.
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const pointOnSegment=(p,a,b)=>{const dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz)));return{x:a.x+t*dx,z:a.z+t*dz};};
const enters=(p,c)=>Object.entries(c).every(([k,v])=>k==='xMin'?p.x>v:k==='xMax'?p.x<v:k==='yMin'?p.y>v:p.y<v);
export function capsuleSegmentClear(g,a,b){
 if(!g.lineClear(a,b))return false;
 const steps=Math.max(1,Math.ceil(distance(a,b)/.1));
 for(let i=0;i<=steps;i++)if(!g.clear({x:a.x+(b.x-a.x)*i/steps,z:a.z+(b.z-a.z)*i/steps},.4))return false;
 return true;
}
export function validateGuidance(layout,g,links=null){
 const rows=layout.guidance??[];if(!Array.isArray(rows)||rows.length>5)throw Error('Invalid route guidance');const ids=new Set();
 const point=p=>p&&Object.keys(p).length===2&&['x','y'].every(k=>Number.isFinite(p[k])&&p[k]>=0&&p[k]<=1);
 return rows.map(row=>{
  if(!row||Object.keys(row).some(k=>!['id','kind','to','path','edge','segment'].includes(k))||typeof row.id!=='string'||!/^[a-z0-9-]+$/.test(row.id)||ids.has(row.id)||!['boundary','exit'].includes(row.kind)||typeof row.to!=='string'||!Array.isArray(row.path)||row.path.length<2||row.path.length>5||!row.path.every(point))throw Error('Invalid route guidance');
  ids.add(row.id);const path=row.path.map(g.ground);
  if(path.some(p=>!g.clear(p,.4))||path.slice(1).some((p,i)=>distance(path[i],p)<.1||!capsuleSegmentClear(g,path[i],p)))throw Error('Blocked route guidance path');
  if(links&&!links.some(link=>link.to===row.to&&enters(row.path.at(-1),link.condition)))throw Error('Route guidance misses existing exit');
  let segment=null;
  if(row.kind==='boundary'){
   if(!Number.isInteger(row.edge)||row.edge<0||row.edge>=g.road.length||!Array.isArray(row.segment)||row.segment.length!==2||!row.segment.every(point))throw Error('Invalid route boundary');
   segment=row.segment.map(g.ground);const a=g.road[row.edge],b=g.road[(row.edge+1)%g.road.length];
   if(distance(...segment)<.2||segment.some(p=>distance(p,pointOnSegment(p,a,b))>1e-6))throw Error('Route boundary leaves road edge');
  }else if(row.edge!==undefined||row.segment!==undefined)throw Error('Exit guidance cannot close road');
  return {...row,path,segment};
 });
}
export function resolveGuidance(rows,g,position){
 let selected=null;
 for(const row of rows){
  const gap=row.kind==='boundary'?distance(position,pointOnSegment(position,...row.segment)):Math.min(...row.path.slice(1).map((p,i)=>distance(position,pointOnSegment(position,row.path[i],p))));
  if(gap>(row.kind==='boundary'?3.5:5)||distance(position,row.path[0])>7&&row.kind==='boundary')continue;
  // Choose a visible-in-collision-space waypoint; never point through a prop or across the road edge.
  let index=-1;for(let i=row.path.length-1;i>=0;i--)if(distance(position,row.path[i])>.5&&capsuleSegmentClear(g,position,row.path[i])){index=i;break;}
  if(index<0)continue;
  const remaining=distance(position,row.path[index])+row.path.slice(index+1).reduce((n,p,i)=>n+distance(row.path[index+i],p),0);
  if(!selected||gap<selected.gap)selected={row,target:row.path[index],index,gap,remaining};
 }
 return selected;
}
export function createRouteGuidance(world){
 const rows=validateGuidance(world.layout,world.geometry);if(!rows.length)return null;
 const {THREE,geometry:g}=world,group=new THREE.Group();group.name='Registered road guidance';world.group.add(group);
 const positions=[],colors=[],indices=[],box=new THREE.BoxGeometry(1,1,1),v=new THREE.Vector3(),matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();
 function cuboid(center,size,yaw,color){
  rotation.setFromAxisAngle(new THREE.Vector3(0,1,0),yaw);matrix.compose(center,rotation,scale.set(...size));const start=positions.length/3,c=new THREE.Color(color);
  for(let i=0;i<box.attributes.position.count;i++){v.fromBufferAttribute(box.attributes.position,i).applyMatrix4(matrix);positions.push(v.x,v.y,v.z);colors.push(c.r,c.g,c.b);}
  for(const index of box.index.array)indices.push(start+index);
 }
 for(const row of rows.filter(r=>r.segment)){
  const[a,b]=row.segment,dx=b.x-a.x,dz=b.z-a.z,length=distance(a,b),mid={x:(a.x+b.x)/2,z:(a.z+b.z)/2};let nx=-dz/length,nz=dx/length;
  if(g.clear({x:mid.x+nx*.3,z:mid.z+nz*.3},0)){nx=-nx;nz=-nz;}
  const at=(t,y)=>world.toRender({x:a.x+dx*t+nx*.12,z:a.z+dz*t+nz*.12},y),yaw=Math.atan2(dz,dx);
  for(let i=0;i<8;i++)cuboid(at((i+.5)/8,.72),[length/8,.28,.12],yaw,i%2?0x252522:0xd0a943);
  for(const t of[0,.5,1])cuboid(at(t,.53),[.12,1.06,.12],0,0x363b3a);
 }
 box.dispose();let barrier=null;
 if(positions.length){const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.setIndex(indices);barrier=new THREE.Mesh(geo,new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false}));barrier.name='Road closed rail outside authored boundary';group.add(barrier);}
 const arrowGeometry=new THREE.BufferGeometry();arrowGeometry.setAttribute('position',new THREE.Float32BufferAttribute([-.13,0,-.35,.13,0,-.35,.13,0,.1,-.13,0,-.35,.13,0,.1,-.13,0,.1,-.32,0,.02,.32,0,.02,0,0,.48],3));
 const arrow=new THREE.Mesh(arrowGeometry,new THREE.MeshBasicMaterial({color:0xf1d28c,side:THREE.DoubleSide,depthWrite:false,toneMapped:false}));arrow.name='Safe route direction';arrow.visible=false;group.add(arrow);
 let cachedPosition=null,cached=null,disposed=false;
 function resolve(position){if(!cachedPosition||distance(cachedPosition,position)>1e-8){cachedPosition={...position};cached=resolveGuidance(rows,g,position);}return cached;}
 function update(position,activeWorld=world){
  const cue=activeWorld.travelAt(position)?null:resolve(position);arrow.visible=!!cue;if(!cue)return;
  const dx=cue.target.x-position.x,dz=cue.target.z-position.z,length=Math.hypot(dx,dz),step=Math.min(.9,length*.5),p=g.move(position,{x:dx/length*step,z:dz/length*step},.4);
  arrow.position.copy(world.toRender(p,.04));arrow.rotation.y=Math.atan2(dx,-dz);
 }
 function hint(position,activeWorld=world){
  const cue=resolve(position);if(!cue)return'';
  if(activeWorld.travelAt(position))return'';
  const a=activeWorld.toRender(position).project(activeWorld.camera),b=activeWorld.toRender(cue.target).project(activeWorld.camera),angle=Math.atan2(b.y-a.y,b.x-a.x),arrows=['→','↗','↑','↖','←','↙','↓','↘'],direction=arrows[(Math.round(angle/(Math.PI/4))+8)%8],name=cue.row.to.replaceAll('-',' ').replace(' and ',' & ').toUpperCase();
  if(cue.row.kind==='exit'&&cue.index===cue.row.path.length-1&&cue.remaining<1.2)return`EXIT → ${name}`;
  return`${cue.row.kind==='boundary'?'ROAD CLOSED · ':''}${direction} ${name} · ${Math.ceil(cue.remaining)}m`;
 }
 return{rows,group,barrier,arrow,update,hint,resolve,dispose(){if(disposed)return;disposed=true;group.removeFromParent();group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}};
}
