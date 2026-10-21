import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import{createHash}from'node:crypto';import*as THREE from'three';
import{LondonWorld}from'../src/world.js';import{createGeometry}from'../src/world-geometry.js';import{validateGuidance,resolveGuidance,capsuleSegmentClear}from'../src/engine/route-guidance.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url))),fixture=read('./fixtures/phone-guidance-positions.json'),manifest=read('../public/world/manifest.json'),layout=area=>read('../public/world/'+area+'/layout.json');
function setup(area,point){const l=layout(area),scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),world=new LondonWorld({THREE,scene,camera,layout:l,texture:new THREE.Texture(),manifest});world.areaId=area;world.update(world.geometry.ground(point),0,393,695,true);return{world,scene,camera};}
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
test('guidance preserves accepted road geometry including the202 stair pocket; gates match registry',()=>{
 for(const area of Object.keys(fixture.baselineLayouts)){const l=layout(area);delete l.guidance;assert.equal(hash(l),fixture.baselineLayouts[area]);}
 assert.equal(manifest.links.length,28);
 assert.deepEqual(manifest.links.filter(link=>link.requiresDefeat).map(({from,to,requiresDefeat})=>({from,to,requiresDefeat})),[{from:'westminster',to:'east',requiresDefeat:'boss-witch-v1'},{from:'central-hub',to:'east',requiresDefeat:'boss-witch-v1'}]);
});
test('authored rows have capsule-clear paths ending inside an existing destination trigger',()=>{
 let count=0;for(const area of Object.keys(fixture.baselineLayouts)){const l=layout(area),g=createGeometry(l),rows=validateGuidance(l,g,manifest.links.filter(r=>r.from===area));count+=rows.length;for(const row of rows){assert(row.path.every(p=>g.clear(p,.4)));assert(row.path.slice(1).every((p,i)=>capsuleSegmentClear(g,row.path[i],p)));}}
 assert.equal(count,7);
});
test('malformed,blocked,off-edge,duplicate and wrong-destination rows are rejected',()=>{
 const original=layout('lambeth'),g=createGeometry(original),links=manifest.links.filter(r=>r.from==='lambeth');
 for(const mutate of[l=>l.guidance[0].path[0]={x:0,y:1},l=>l.guidance[0].segment[0].x+=.01,l=>l.guidance[0].to='south',l=>l.guidance.push(structuredClone(l.guidance[0])),l=>l.guidance[0].unknown=true,l=>l.guidance[0].path[1]=l.guidance[0].path[0]]){const l=structuredClone(original);mutate(l);assert.throws(()=>validateGuidance(l,g,links));}
});
test('every walkable sample in all five photo intervals receives a safe inward or exit waypoint',()=>{
 let checked=0;for(const row of fixture.rows){const l=layout(row.area),g=createGeometry(l),rows=validateGuidance(l,g,manifest.links.filter(r=>r.from===row.area));for(let ix=0;ix<=10;ix++)for(let iy=0;iy<=10;iy++){const q={x:row.bounds.x[0]+(row.bounds.x[1]-row.bounds.x[0])*ix/10,y:row.bounds.y[0]+(row.bounds.y[1]-row.bounds.y[0])*iy/10},p=g.ground(q);if(!g.clear(p,.4))continue;const cue=resolveGuidance(rows,g,p);assert(cue,`${row.id} lacks guidance at ${JSON.stringify(q)}`);assert(capsuleSegmentClear(g,p,cue.target));assert.equal(cue.row.kind,row.area==='lambeth'?'boundary':'exit');checked++;}}
 assert(checked>250);
});
test('actual camera projection determines arrow text across phone aspects and activated stage camera',()=>{
 const arrows=['→','↗','↑','↖','←','↙','↓','↘'];for(const row of fixture.rows){const{world}=setup(row.area,row.representative),p=world.geometry.ground(row.representative);for(const size of[[393,695],[844,390]]){world.update(p,0,...size,true);const active=Object.assign(Object.create(LondonWorld.prototype),world,{camera:world.camera.clone()});active.camera.projectionMatrix.elements[0]*=-1;const cue=world.routeGuidance.resolve(p),a=active.toRender(p).project(active.camera),b=active.toRender(cue.target).project(active.camera),direction=arrows[(Math.round(Math.atan2(b.y-a.y,b.x-a.x)/(Math.PI/4))+8)%8];assert(active.exitHint(p).includes(direction));assert(!active.exitHint(p).includes('THEN'));}world.dispose();}
});
test('an actual gate retains its exit cue instead of a contradictory boundary cue',()=>{
 const{world}=setup('lambeth',{x:.25,y:.065}),p=world.geometry.ground({x:.25,y:.065});assert.equal(world.travelAt(p)?.areaId,'elephant-and-castle');assert.equal(world.exitHint(p),'EXIT → ELEPHANT AND CASTLE');assert.equal(world.routeGuidance.arrow.visible,false);world.dispose();
});
test('barrier footprint remains outside collision,uses at most two meshes,and releases stage-owned resources once',()=>{
 const{world,scene}=setup('lambeth',{x:.5283,y:.1897}),cue=world.routeGuidance,positions=cue.barrier.geometry.attributes.position;for(let i=0;i<positions.count;i++)assert.equal(world.geometry.clear({x:positions.getX(i),z:-positions.getZ(i)},0),false);
 assert.equal(cue.group.children.length,2);assert.equal(cue.barrier.material.vertexColors,true);let releases=0;for(const mesh of cue.group.children){mesh.geometry.addEventListener('dispose',()=>releases++);mesh.material.addEventListener('dispose',()=>releases++);}const actor=new THREE.Group();scene.add(actor);world.dispose();world.dispose();assert.equal(releases,4);assert.deepEqual(scene.children,[actor]);
});
