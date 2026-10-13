import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {validateAreaContent} from '../src/engine/area-content.js';import {createAreaRegistry} from '../src/area-registry.js';import {DEFAULT_LOOT_RULES} from '../src/engine/area-loot.js';
const read=p=>JSON.parse(readFileSync(new URL('../public/'+p,import.meta.url)));
test('public vest pilot selects only East roamer1; all legacy West outcomes stay exact',()=>{
 const manifest=read('world/manifest.json'),registry=createAreaRegistry({manifest}),content=read('world/area-content.json'),layouts=Object.fromEntries(registry.ids.map(id=>{const ref=registry.get(id).layoutRef;return[ref,read(registry.asset(ref).path)];}));
 const rules=validateAreaContent(content,registry,layouts).lootRules;
 assert.deepEqual(Object.keys(content.loot.placements),['east']);assert.deepEqual(content.loot.placements.east,{'east-roamer-1':'east-vest-pilot-v1'});
 assert.deepEqual(rules['east-roamer-1'].outcomes,[{itemId:'westminster-worn-vest-v1',quantity:1,weight:1,conditions:['vest-not-equipped']}]);assert.equal(rules['east-roamer-1'].dropId,'area-supply-v2:east-roamer-1');
 assert.deepEqual(Object.keys(rules).sort(),[...Object.keys(DEFAULT_LOOT_RULES),'east-roamer-1'].sort());for(const[key,value]of Object.entries(DEFAULT_LOOT_RULES))assert.deepEqual(rules[key],value);
});
