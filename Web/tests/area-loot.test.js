import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {validateAreaLoot,DEFAULT_LOOT_RULES} from '../src/engine/area-loot.js';import {publicAreaRegistry} from '../src/area-registry.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const residents=read('../public/world/area-content.json').residents;
function input(){return {version:1,tables:{'rounds-three':{outcomes:[{itemId:'rounds',quantity:3,weight:1,conditions:['pistol-owned','reserve-space']}]}},placements:{westminster:{'westminster-roamer-1':'rounds-three'},'east-bridge':{[residents['east-bridge'][0].key]:'rounds-three'}}};}
test('loaded legacy defaults retain exact old quantities/items/IDs; known registered new placement resolves shared table',()=>{
 const c=input(),rules=validateAreaLoot(c,publicAreaRegistry,residents);for(const [key,rule]of Object.entries(DEFAULT_LOOT_RULES)){assert.deepEqual(rules[key].outcomes,rule.outcomes);assert.equal(rules[key].dropId,rule.dropId);}
 const key=residents['east-bridge'][0].key;assert.equal(rules[key].areaId,'east-bridge');assert.equal(rules[key].legacy,false);assert.equal(rules[key].dropId,'area-supply-v2:'+key);assert(Object.isFrozen(rules[key].outcomes[0].conditions));c.tables['rounds-three'].outcomes[0].quantity=2;assert.equal(rules[key].outcomes[0].quantity,3);
});
test('existing-area data can select another existing quantity for new keys without changing public legacy rules',()=>{
 const c=input();c.tables['rounds-two']={outcomes:[{itemId:'rounds',quantity:2,weight:1,conditions:['pistol-owned','reserve-space']}]};const key=residents['east-bridge'][0].key;c.placements['east-bridge'][key]='rounds-two';const r=validateAreaLoot(c,publicAreaRegistry,residents);assert.equal(r[key].outcomes[0].quantity,2);assert.equal(r['westminster-roamer-1'].outcomes[0].quantity,3);
});
test('unknown content, placement/area/table, new items/conditions, malformed weights and public legacy balance changes reject',()=>{
 const cases=[c=>c.extra=true,c=>c.version=2,c=>c.tables['rounds-three'].extra=1,c=>c.tables['rounds-three'].outcomes[0].itemId='gold',c=>c.tables['rounds-three'].outcomes[0].quantity=4,c=>c.tables['rounds-three'].outcomes[0].weight=NaN,c=>c.tables['rounds-three'].outcomes[0].weight=0,c=>c.tables['rounds-three'].outcomes[0].conditions=['always'],c=>c.placements.westminster['westminster-roamer-1']='missing',c=>c.placements.westminster.unknown='rounds-three',c=>c.placements.unknown={'westminster-roamer-1':'rounds-three'},c=>c.tables['rounds-three'].outcomes[0].quantity=2];
 for(const change of cases){const c=input();change(c);assert.throws(()=>validateAreaLoot(c,publicAreaRegistry,residents));}
});
