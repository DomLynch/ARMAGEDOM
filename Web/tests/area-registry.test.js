import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createAreaRegistry,publicAreaRegistry,validateAreaEntries} from '../src/area-registry.js';
import {areaDefinitions,areaAssets} from '../src/area-definitions.js';
import {createGeometry} from '../src/world-geometry.js';
const manifest=JSON.parse(readFileSync(new URL('../public/world/manifest.json',import.meta.url)));
const fixture=JSON.parse(readFileSync(new URL('./fixtures/area-registry-private-fourth.json',import.meta.url)));
const project=area=>Object.fromEntries(['id','visibility','layoutRef','backdropRef','audioRef','entry','exits'].map(k=>[k,area[k]]));
function privateContent(){
 const areas=structuredClone(areaDefinitions),extended=structuredClone(manifest);
 areas.find(a=>a.id===fixture.attach.from).exits.push(fixture.attach.exit);areas.push(project(fixture.area));
 extended.entries[fixture.area.id]=fixture.area.entry;
 for(const [from,exit]of [[fixture.attach.from,fixture.attach.exit],[fixture.area.id,fixture.area.exits[0]]])extended.links.push({from,to:exit.target,condition:exit.condition,entry:exit.entry});
 return{areas,manifest:extended,includePrivate:true};
}
function clearance(registry){
 const geometries=new Map();for(const areaId of registry.ids){const area=registry.get(areaId);if(!geometries.has(area.layoutRef))geometries.set(area.layoutRef,createGeometry(JSON.parse(readFileSync(new URL('../public/'+registry.asset(area.layoutRef).path,import.meta.url)))));}
 return validateAreaEntries(registry,geometries);
}

test('registered public metadata matches the existing manifest adjacency and file references',()=>{
 const registry=createAreaRegistry({manifest});assert.deepEqual(registry.ids,['westminster','east','south','east-bridge','elephant-and-castle','lambeth','area7','area8','central-hub']);assert.equal(registry.initialArea,manifest.initialArea);
 for(const id of registry.ids){assert.deepEqual(registry.reachable(id).slice().sort(),registry.ids.slice().sort());assert.deepEqual(registry.links(id).map(({id,...link})=>link),manifest.links.filter(link=>link.from===id));assert.deepEqual(registry.get(id).entry,manifest.entries[id]);}
 assert.equal(clearance(registry).length,28);assert.equal(publicAreaRegistry.has(fixture.area.id),false);
});
test('private fourth fixture extends the same registry through data only and reuses existing references',()=>{
 assert.deepEqual(fixture.area.spawns,[]);assert.deepEqual(fixture.area.atmosphere.anchors,[]);
 const registry=createAreaRegistry(privateContent());assert.equal(registry.ids.length,10);assert.equal(registry.get(fixture.area.id).layoutRef,registry.get('westminster').layoutRef);assert.equal(registry.get(fixture.area.id).backdropRef,registry.get('westminster').backdropRef);assert.equal(clearance(registry).length,30);assert.equal(registry.reachable('westminster').length,10);assert.equal(publicAreaRegistry.ids.length,9);
});
test('registry owns immutable copies without mutating content or manifest',()=>{
 const areas=structuredClone(areaDefinitions),copy=structuredClone(areas),registry=createAreaRegistry({areas,manifest});assert.deepEqual(areas,copy);areas[0].entry.x=0;
 assert.equal(registry.get('westminster').entry.x,.52);assert.throws(()=>{registry.get('westminster').entry.x=0;},TypeError);assert.throws(()=>registry.ids.push('bad'),TypeError);assert.throws(()=>registry.links('westminster')[0].entry.x=0,TypeError);
});
for(const [name,mutate]of Object.entries({duplicateArea:a=>a.push(structuredClone(a[0])),unknownTarget:a=>a[0].exits[0].target='missing',unknownRef:a=>a[0].layoutRef='layout.missing',wrongRefKind:a=>a[0].layoutRef='backdrop.westminster',callback:a=>a[0].entry.callback=()=>{},invalidEntry:a=>a[0].entry.x=NaN,invalidExitBounds:a=>a[0].exits[0].condition={xMin:.9,xMax:.1},duplicateExit:a=>a[1].exits[0].id=a[0].exits[0].id,missingReturn:a=>a[1].exits=[],disconnected:a=>{a[0].exits=[];a[1].exits=[];a[2].exits=[];},unknownField:a=>a[0].controller='guess'}))test(`registry rejects ${name}`,()=>{const areas=structuredClone(areaDefinitions);mutate(areas);assert.throws(()=>createAreaRegistry({areas}),/Area registry/);});
test('private content cannot enter the default public registry',()=>{const content=privateContent();assert.throws(()=>createAreaRegistry({...content,includePrivate:false}),/private area/);});
test('manifest mismatches fail before loading; blocked entries fail real geometry validation',()=>{
 const changed=structuredClone(manifest);changed.links[0].entry.x=.2;assert.throws(()=>createAreaRegistry({manifest:changed}),/adjacency mismatch/);
 const files=structuredClone(manifest);files.files=files.files.filter(f=>!f.path.endsWith('east/layout.json'));assert.throws(()=>createAreaRegistry({manifest:files}),/asset reference mismatch/);
 const areas=structuredClone(areaDefinitions);areas[0].entry={x:0,y:0};assert.throws(()=>clearance(createAreaRegistry({areas})),/westminster/);
});
test('registered audio asset is the served m4a and matches its pinned bytes and hash',()=>{
 const ref=areaAssets[areaDefinitions[0].audioRef],body=readFileSync(new URL('../public/'+ref.path,import.meta.url));
 assert.equal(ref.kind,'audio');assert.equal(ref.path,'audio/combat.m4a');assert.equal(body.length,ref.bytes);assert.equal(createHash('sha256').update(body).digest('hex'),ref.sha256);
 const wrong=structuredClone(areaAssets);wrong['audio.combat'].path='audio/combat.mp3';assert.throws(()=>createAreaRegistry({assets:wrong}),/invalid asset path/);
});
