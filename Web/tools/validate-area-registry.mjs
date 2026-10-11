import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createAreaRegistry,validateAreaEntries} from '../src/area-registry.js';
import {areaDefinitions,areaAssets} from '../src/area-definitions.js';
import {createGeometry} from '../src/world-geometry.js';
const read=path=>JSON.parse(readFileSync(new URL(path,import.meta.url))),manifest=read('../public/world/manifest.json');
function validate(options){
 const registry=createAreaRegistry(options),geometry=new Map();
 for(const areaId of registry.ids){const row=registry.get(areaId);for(const ref of [row.layoutRef,row.backdropRef,row.audioRef]){const asset=registry.asset(ref),bytes=readFileSync(new URL('../public/'+asset.path,import.meta.url));if(bytes.length!==asset.bytes||createHash('sha256').update(bytes).digest('hex')!==asset.sha256)throw Error('Area asset identity mismatch: '+ref);}
  if(!geometry.has(row.layoutRef))geometry.set(row.layoutRef,createGeometry(read('../public/'+registry.asset(row.layoutRef).path)));
 }
 return{ids:registry.ids,entryChecks:validateAreaEntries(registry,geometry),referencesVerified:true};
}
const report={public:validate({manifest}),scope:'Metadata/reference/connectivity/entry-clearance validation. Private fixture is content only, never a public or runtime-travel acceptance.'};
if(process.argv.includes('--private')){
 const fixture=read('../tests/fixtures/area-registry-private-fourth.json'),keys=['id','visibility','layoutRef','backdropRef','audioRef','entry','exits'],areas=structuredClone(areaDefinitions),extended=structuredClone(manifest);
 if(fixture.area.spawns.length||fixture.area.atmosphere.anchors.length)throw Error('Fourth fixture must remain empty');
 areas.find(a=>a.id===fixture.attach.from).exits.push(fixture.attach.exit);areas.push(Object.fromEntries(keys.map(k=>[k,fixture.area[k]])));extended.entries[fixture.area.id]=fixture.area.entry;
 for(const [from,exit]of [[fixture.attach.from,fixture.attach.exit],[fixture.area.id,fixture.area.exits[0]]])extended.links.push({from,to:exit.target,condition:exit.condition,entry:exit.entry});
 report.private=validate({areas,assets:areaAssets,manifest:extended,includePrivate:true});
}
console.log(JSON.stringify(report,null,2));
