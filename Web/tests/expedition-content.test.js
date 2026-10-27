import{journalPresentation}from'../src/engine/expedition-runtime.js';
import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{publicAreaRegistry as registry}from'../src/area-registry.js';import{validateExpeditionData}from'../src/engine/expedition-core.js';import{validateAreaGeometry,validateAreaMetadata}from'../src/engine/area-content.js';import{createGeometry}from'../src/world-geometry.js';
const gate=(g,area,p)=>{const n=g.point(p);return registry.links(area).find(link=>Object.entries(link.condition).every(([k,v])=>k==='xMin'?n.x>v:k==='xMax'?n.x<v:k==='yMin'?n.y>v:n.y<v))??null;};
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url))),raw=()=>read('../public/world/area-content.json'),layout=id=>read('../public/world/'+id+'/layout.json');
test('catalogue rejects bad references, unsafe profiles, aliases and duplicate atlas cells',()=>{
 const good=raw().expedition;assert(Object.isFrozen(validateExpeditionData(good,registry).contract));
 for(const mutate of[c=>c.contract.giver.areaId='unknown',c=>c.contract.guard.areaId='south',c=>c.contract.case.radius=3,c=>c.variants[c.contract.rewardVariantId].damage=Infinity,c=>c.variants[c.contract.rewardVariantId].extra=true,c=>c.variants['westminster-start-pistol-v1'].reload=1.6,c=>c.atlas.east={...c.atlas.westminster},c=>c.atlas.extra={column:0,row:0},c=>c.contract.case.position.z=NaN]){const c=structuredClone(good);mutate(c);assert.throws(()=>validateExpeditionData(c,registry));}
 const old=raw();delete old.expedition;assert.throws(()=>validateAreaMetadata(old,registry),/Invalid Reaper/);delete old.reaper;assert(!Object.hasOwn(validateAreaMetadata(old,registry),'expedition'));
});
test('actual existing anchors have full capsule-clear approach rings and stable guard; no gate overlap',()=>{
 const c=raw(),data=validateExpeditionData(c.expedition,registry);
 for(const id of registry.ids)assert.doesNotThrow(()=>validateAreaGeometry(registry,id,layout(id),c.residents,data));
 for(const anchor of[data.contract.giver,data.contract.case]){const g=createGeometry(layout(anchor.areaId));assert(g.clear(anchor.position,.4));assert.equal(gate(g,anchor.areaId,anchor.position),null);for(let i=0;i<16;i++){const p={x:anchor.position.x+1.3*Math.cos(i*Math.PI/8),z:anchor.position.z+1.3*Math.sin(i*Math.PI/8)};assert(g.clear(p,.4));assert(g.lineClear(p,anchor.position));assert.equal(gate(g,anchor.areaId,p),null);}}
 const broken=structuredClone(data);broken.contract.guard.placementKey='missing-guard';assert.throws(()=>validateAreaGeometry(registry,'east',layout('east'),c.residents,broken),/Unknown expedition guard/);
});
test('atlas uses all actual nine areas and twenty-four directed links; each pin route starts at an existing exit',()=>{
 assert.equal(registry.ids.length,9);assert.equal(registry.ids.reduce((n,id)=>n+registry.links(id).length,0),24);
 for(const from of registry.ids)for(const to of registry.ids){const first=registry.nextExit(from,to);if(from===to){assert.equal(first,null);continue;}assert(registry.links(from).includes(first));let at=from;const seen=new Set([at]);while(at!==to){at=registry.nextExit(at,to).to;assert(!seen.has(at));seen.add(at);}assert(seen.size<=9);}
 assert.equal(registry.nextExit('south','east').to,'central-hub');assert.throws(()=>registry.nextExit('unknown','east'));assert.throws(()=>registry.nextExit('east','unknown'));
});


test('Journal offers Claim only at the real eligible stash, and carrying a case elsewhere names the return step without mutation',()=>{
 const on=raw().expedition;delete on.contract.enabled; // shipped data has the contract off; this row covers the contract mechanics themselves
 const data=validateExpeditionData(on,registry),g={time:1,finished:false,player:{hp:100,pos:{...data.contract.giver.position},hurtUntil:0,dodgeUntil:0},world:{areaId:'east',lineClear:()=>true},expedition:{status:'recovered'}};const before=JSON.stringify(g);let view=journalPresentation(g,data,true);assert.equal(view.showAction,false);assert.match(view.next,/return to the Westminster stash/);assert.equal(JSON.stringify(g),before);
 g.world.areaId=data.contract.giver.areaId;view=journalPresentation(g,data,true);assert.equal(view.showAction,true);assert.equal(view.eligible,true);assert.match(view.next,/claim your reward/);
 for(const change of[()=>g.player.pos.x+=2,()=>g.player.hp=0,()=>g.player.swing={},()=>g.runSaveInvalid=true]){const old=structuredClone({player:g.player,runSaveInvalid:g.runSaveInvalid});change();assert.equal(journalPresentation(g,data,true).showAction,false);g.player=old.player;g.runSaveInvalid=old.runSaveInvalid;}
 assert.equal(journalPresentation(g,data,false).showAction,false);g.world.lineClear=()=>false;assert.equal(journalPresentation(g,data,true).showAction,false);
});
