import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createAreaRegistry} from '../src/area-registry.js';
import {validateAreaMetadata,validateAreaGeometry} from '../src/engine/area-content.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const manifest=read('../public/world/manifest.json'),registry=createAreaRegistry({manifest});
test('actual eight-area boss metadata reaches per-area startup geometry with legacy residents',()=>{
 const metadata=validateAreaMetadata(read('../public/world/area-content.json'),registry);
 assert(metadata.residents.westminster.some(row=>row.foundationRef===undefined));
 for(const id of registry.ids){const layout=read('../public/'+registry.asset(registry.get(id).layoutRef).path);
  assert.doesNotThrow(()=>validateAreaGeometry(registry,id,layout,metadata.residents,metadata.expedition,metadata.bossData,metadata.populationData,metadata.flameData),id);
 }
});
