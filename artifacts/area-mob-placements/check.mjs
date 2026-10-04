import fs from 'node:fs';import assert from 'node:assert/strict';import{createHash}from'node:crypto';
import{createGeometry}from'../../Web/src/world-geometry.js';import{AREA_MOB_SPAWNS as placements}from'../../Web/src/area-mob-spawns.js';
const manifest=JSON.parse(fs.readFileSync('Web/public/world/manifest.json')),radius=.55,spacing=.5,receipt={base:'751ad4799be64615ad2affca0ee0cb529d9cd769',radius,actualHollowRadius:.4,scope:'Registered collision/data checks only; gameplay wake/chase/state/phone pending',areas:{}};
function segment(g,a,b,r=radius){if(!g.lineClear(a,b))return false;const n=Math.max(1,Math.ceil(Math.hypot(a.x-b.x,a.z-b.z)/.1));for(let i=0;i<=n;i++)if(!g.clear({x:a.x+(b.x-a.x)*i/n,z:a.z+(b.z-a.z)*i/n},r))return false;return true;}
for(const[area,records]of Object.entries(placements)){
 assert.equal(records.length,2);const bytes=fs.readFileSync(`Web/public/world/${area}/layout.json`),g=createGeometry(JSON.parse(bytes));
 const starts=area==='westminster'?[{x:0,z:-6},...manifest.links.filter(l=>l.to===area).map(l=>g.ground(l.entry))]:[g.ground(manifest.entries[area])];
 const minX=Math.min(...g.road.map(p=>p.x)),maxX=Math.max(...g.road.map(p=>p.x)),minZ=Math.min(...g.road.map(p=>p.z)),maxZ=Math.max(...g.road.map(p=>p.z));
 const nx=Math.ceil((maxX-minX)/spacing)+1,nz=Math.ceil((maxZ-minZ)/spacing)+1,nodes=new Map();
 for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){const p={x:minX+x*spacing,z:minZ+z*spacing};if(g.clear(p,.4))nodes.set(z*nx+x,p);}
 const attach=p=>{const x=Math.round((p.x-minX)/spacing),z=Math.round((p.z-minZ)/spacing);for(let d=0;d<=2;d++)for(let dz=-d;dz<=d;dz++)for(let dx=-d;dx<=d;dx++){const k=(z+dz)*nx+x+dx,q=nodes.get(k);if(q&&segment(g,p,q,.4))return k;}throw Error(`Unattached ${area} ${JSON.stringify(p)}`);};
 const entranceDistances=[];
 for(const start of starts){assert.ok(g.clear(start,.4));const root=attach(start),seen=new Set([root]),queue=[root];for(let j=0;j<queue.length;j++){const k=queue[j],p=nodes.get(k),x=k%nx,z=Math.floor(k/nx);for(const[dx,dz]of [[1,0],[-1,0],[0,1],[0,-1]]){if(x+dx<0||x+dx>=nx||z+dz<0||z+dz>=nz)continue;const nk=(z+dz)*nx+x+dx,q=nodes.get(nk);if(q&&!seen.has(nk)&&segment(g,p,q,.4)){seen.add(nk);queue.push(nk);}}}
  for(const r of records)for(const p of[r.pos,...r.patrol])assert.ok(seen.has(attach(p)),`${area}/${r.key} unreachable from entry`);
  entranceDistances.push(records.map(r=>Math.hypot(start.x-r.pos.x,start.z-r.pos.z)));
 }
 const endpoints=records.map(r=>{assert.ok(segment(g,...r.patrol));assert.ok(g.clear(r.pos,radius));assert.ok(segment(g,r.pos,r.patrol[0]));assert.ok(Math.hypot(r.patrol[0].x-r.patrol[1].x,r.patrol[0].z-r.patrol[1].z)<=3);return{id:r.key,artwork:g.point(r.pos),patrolMetres:Math.hypot(r.patrol[0].x-r.patrol[1].x,r.patrol[0].z-r.patrol[1].z)};});
 const separation=Math.hypot(records[0].pos.x-records[1].pos.x,records[0].pos.z-records[1].pos.z);assert.ok(separation>12);
 for(const r of records)for(const p of[r.pos,...r.patrol]){const image=g.point(p);for(const link of manifest.links.filter(l=>l.from===area)){const inExit=Object.entries(link.condition).every(([key,value])=>key==='xMin'?image.x>value:key==='xMax'?image.x<value:key==='yMin'?image.y>value:image.y<value);assert.equal(inExit,false);}}
 if(area==='westminster'){for(const r of records)for(const p of[r.pos,...r.patrol]){assert.ok(Math.hypot(p.x,p.z+6)>15);assert.ok(Math.hypot(p.x+.85,p.z+6.15)>15);}}
 receipt.areas[area]={layoutSHA:createHash('sha256').update(bytes).digest('hex'),count:2,separationMetres:separation,entranceDistances,endpoints,reachableFromEachEntry:true,patrolClear:true,exitTriggersClear:true};
}
receipt.status='PASS';receipt.dataSHA=createHash('sha256').update(fs.readFileSync('Web/src/area-mob-spawns.js')).digest('hex');fs.writeFileSync('artifacts/area-mob-placements/receipt.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt,null,2));
