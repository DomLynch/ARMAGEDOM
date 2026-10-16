import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {validateAreaContent} from '../src/engine/area-content.js';import {createAreaRegistry} from '../src/area-registry.js';import {DEFAULT_LOOT_RULES} from '../src/engine/area-loot.js';
const read=p=>JSON.parse(readFileSync(new URL('../public/'+p,import.meta.url)));
test('public East and Area7 reward placements stay exact; all legacy West outcomes remain unchanged',()=>{
 const manifest=read('world/manifest.json'),registry=createAreaRegistry({manifest}),content=read('world/area-content.json'),layouts=Object.fromEntries(registry.ids.map(id=>{const ref=registry.get(id).layoutRef;return[ref,read(registry.asset(ref).path)];}));
 const rules=validateAreaContent(content,registry,layouts).lootRules;
 assert.deepEqual(Object.keys(content.loot.placements),['east','area7','lambeth','elephant-and-castle','east-bridge']);assert.deepEqual(content.loot.placements.east,{'east-roamer-2':'east-vest-pilot-v1'});
 assert.deepEqual(rules['east-roamer-2'].outcomes,[{itemId:'westminster-worn-vest-v1',quantity:1,weight:1,conditions:['vest-not-equipped']}]);assert.equal(rules['east-roamer-2'].dropId,'area-supply-v2:east-roamer-2');
 assert.deepEqual(content.loot.placements.area7,{'area7-station-scavenger-v1':'area7-station-vest-v1','area7-station-rat-v1':'area7-station-rounds-v1'});
 assert.deepEqual(rules['area7-station-scavenger-v1'].outcomes,[{itemId:'westminster-worn-vest-v1',quantity:1,weight:1,conditions:['vest-not-equipped']}]);assert.deepEqual(rules['area7-station-rat-v1'].outcomes,[{itemId:'rounds',quantity:3,weight:1,conditions:['pistol-owned','reserve-space']}]);
 assert.deepEqual(Object.keys(rules).sort(),[...Object.keys(DEFAULT_LOOT_RULES),'east-roamer-2','area7-station-scavenger-v1','area7-station-rat-v1','boss-surgeon-v1','boss-butcher-v1','boss-warden-v1'].sort());for(const[key,value]of Object.entries(DEFAULT_LOOT_RULES))assert.deepEqual(rules[key],value);
});
