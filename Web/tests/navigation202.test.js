import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
import{publicAreaRegistry as registry,areaDisplayName}from'../src/area-registry.js';import{createGeometry}from'../src/world-geometry.js';import{LondonWorld}from'../src/world.js';
import{validateGuidance,validateTutorialPath,capsuleSegmentClear,resolveGuidance}from'../src/engine/route-guidance.js';import{selectedAtlasRoute}from'../src/engine/expedition-runtime.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url))),content=read('../public/world/area-content.json'),layouts=new Map(registry.ids.map(id=>[id,read('../public/world/'+id+'/layout.json')])),geometry=new Map([...layouts].map(([id,l])=>[id,createGeometry(l)]));
const travel=(id,p)=>LondonWorld.prototype.travelAt.call({areaId:id,registry,geometry:geometry.get(id)},p);
test('side entrance relocation preserves nine areas, twenty-four reciprocal edges and locks',()=>{
 assert.equal(registry.ids.length,9);let count=0;for(const from of registry.ids)for(const link of registry.links(from)){count++;assert(registry.links(link.to).some(back=>back.to===from));const g=geometry.get(link.to),p=g.ground(link.entry);assert(g.clear(p,.4),link.id);assert.equal(travel(link.to,p),null,link.id+' arrival inside exit');}assert.equal(count,24);
 assert.deepEqual(registry.ids.flatMap(id=>registry.links(id)).filter(l=>l.requiresDefeat).map(l=>[l.from,l.to,l.requiresDefeat]),[['westminster','central-hub','boss-witch-v1'],['westminster','area8','boss-witch-v1'],['westminster','lambeth','boss-witch-v1']]);assert.deepEqual(registry.links('central-hub').filter(l=>l.requiresVisited).map(l=>l.to).sort(),[]);
});
test('three remaining side entrances have capsule-clear approaches ending at intentional thresholds',()=>{
 for(const id of['south','east','area7']){const g=geometry.get(id),row=validateGuidance(layouts.get(id),g,registry.links(id)).find(r=>r.to==='central-hub');assert(row);assert.equal(travel(id,row.path[0]),null);for(let i=1;i<row.path.length;i++)assert(capsuleSegmentClear(g,row.path[i-1],row.path[i]),id);assert.equal(travel(id,row.path.at(-1))?.areaId,'central-hub',id);}
});
test('previously hazardous held-direction through movements do not enter Central Hub',()=>{
 const traces=[['east',{x:.35,y:.5},{x:1,z:0}],['east',{x:.39123766447530295,y:.5572215573812039},{x:0,z:1}],['area7',{x:.3,y:.79},{x:0,z:1}],['east',{x:.85,y:.275},{x:-1,z:0}],['westminster',{x:.6,y:.92},{x:0,z:-1}]];
 for(const[id,at,direction]of traces){const g=geometry.get(id);let p=g.ground(at);assert(g.clear(p,.4),id);for(let n=0;n<240;n++){p=g.move(p,{x:direction.x*.025,z:direction.z*.025},.4);const request=travel(id,p);assert.notEqual(request?.areaId,'central-hub',id+' forced hub transit');if(request)break;}}
});
test('side entrance triggers do not overlap other destinations',()=>{
 for(const id of['south','east','area7']){const links=registry.links(id),hub=links.find(l=>l.to==='central-hub').condition;for(const other of links.filter(l=>l.to!=='central-hub')){const c=other.condition;assert(Math.max(hub.xMin??0,c.xMin??0)>=Math.min(hub.xMax??1,c.xMax??1)||Math.max(hub.yMin??0,c.yMin??0)>=Math.min(hub.yMax??1,c.yMax??1),id+' overlapping '+other.to);}}
});
test('tutorial follows safe waypoints to original shelter, with no fake exit',()=>{
 const l=layouts.get('westminster'),g=geometry.get('westminster'),row=validateTutorialPath(l,g),anchor=l.setPieceSlot.at;assert(row);assert.deepEqual(l.tutorialPath.at(-1),anchor);assert.equal(capsuleSegmentClear(g,row.path[0],row.path.at(-1)),false);assert(row.path.slice(1).every((p,i)=>capsuleSegmentClear(g,row.path[i],p)));assert.equal(registry.links('westminster').some(l=>l.to==='westminster'),false);const cue=resolveGuidance([row],g,row.path[0]);assert(cue);assert(capsuleSegmentClear(g,row.path[0],cue.target));const bad=structuredClone(l);bad.tutorialPath=[l.tutorialPath[0],anchor];assert.throws(()=>validateTutorialPath(bad,g),/Blocked/);
});
test('atlas selection contains only real requested hops and distinct safehouse label',()=>{
 assert.deepEqual(selectedAtlasRoute(registry,'westminster','elephant-and-castle').map(l=>l.to),['central-hub','east','elephant-and-castle']);assert.deepEqual(selectedAtlasRoute(registry,'east',null),[]);assert.deepEqual(selectedAtlasRoute(registry,'east','east'),[]);for(const from of registry.ids)for(const to of registry.ids){const route=selectedAtlasRoute(registry,from,to);if(from!==to){assert.equal(route[0].from,from);assert.equal(route.at(-1).to,to);for(let i=1;i<route.length;i++)assert.equal(route[i-1].to,route[i].from);}}assert.equal(areaDisplayName('central-hub'),'Central Safehouse');assert.notEqual(areaDisplayName('east'),areaDisplayName('east-bridge'));
});
test('arrival suppression covers authored guidance and fallback exit hint',async()=>{
 const THREE=await import('three'),layout=layouts.get('east'),world=new LondonWorld({THREE,scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),layout,texture:new THREE.Texture()});world.areaId='east';const p=world.geometry.ground(registry.links('central-hub').find(l=>l.to==='east').entry);world.routeGuidance.arrive('central-hub',p);assert.equal(world.routeGuidance.allowsExitHint('central-hub'),false);assert(!world.exitHint(p).includes('CENTRAL SAFEHOUSE'));world.dispose();
});

test('fresh shelter tutorial survives actual starting-pistol Core pickup and completes only on its landing',async()=>{
 const{fixture}=await import('./helpers/rifle-fixture.js'),{shelterTutorialPending}=await import('../src/engine/safehouse-view.js'),{claimStartingPistol}=await import('../src/engine/run-views.js');
 const{BOSS_EQUIPMENT_PROFILES:profiles}=await import('../src/engine/boss-equipment-data.js');const f=fixture({areaId:'westminster',extraWorld:{spawn:{x:0,z:-6},safehouseData:content.safehouse,bossEquipmentData:profiles}});f.restore();const g=f.g;g.world.layout=layouts.get('westminster');assert(!g.pistol.collected);let pending=shelterTutorialPending(g);assert(pending);assert(Math.hypot(g.player.pos.x-g.pistol.pickupPos.x,g.player.pos.z-g.pistol.pickupPos.z)<1.3);claimStartingPistol(g,f.p.dispatchPistol,()=>{});assert(g.pistol.collected,'real Core pickup committed');pending=shelterTutorialPending(g,pending);assert(pending,'pickup is not shelter arrival');assert.equal(shelterTutorialPending(g),false,'existing owner skips only at initial observation');g.player.pos=g.world.geometry.ground(layouts.get('westminster').setPieceSlot.at);pending=shelterTutorialPending(g,pending);assert.equal(pending,false);g.player.pos={x:0,z:-6};assert.equal(shelterTutorialPending(g,pending),false,'completed session stays complete');
});

test('optional geometry metadata stays optional; supplied tutorial site and endpoint remain strict',async()=>{
 const{validateAreaGeometry}=await import('../src/engine/area-content.js'),layout=layouts.get('westminster');
 assert.doesNotThrow(()=>validateAreaGeometry(registry,'westminster',layout));assert.doesNotThrow(()=>validateAreaGeometry(registry,'westminster',layout,null,null,null,null,null,content.safehouse));
 const wrong=structuredClone(layout);wrong.tutorialPath.at(-1).x+=.001;assert.throws(()=>validateAreaGeometry(registry,'westminster',wrong,null,null,null,null,null,content.safehouse),/Tutorial must reach/);const noSlot=structuredClone(layout);delete noSlot.setPieceSlot;assert.throws(()=>validateAreaGeometry(registry,'westminster',noSlot),/Tutorial must reach/);
 assert.throws(()=>validateAreaGeometry(registry,'east',layout),/Tutorial must belong|Route guidance/);
});
