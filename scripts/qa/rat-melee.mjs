import assert from 'node:assert/strict';
import {controlledEntry,ordinaryInput,readState,lowStrike,aimAt,legal,waitEvent,waitSimulation} from './scenarios.mjs';
import {pause,resume} from './crown.mjs';

export async function ratMeleeCase(page,{action,gap,expectedDamage}){
 const key='westminster-roamer-4',move={slash:'rat_low',stab:'thrust',heavy:'heavy_overhead'}[action];assert(move);
 await pause(page);
 // Normal Retry toggles the roster. Return to A through normal controls.
 do{await ordinaryInput(page,()=>page.click('#retry'),{reset:true,label:'rat-normal-retry'});await pause(page);}while(await page.evaluate(()=>__qa.game.animalCycle!=='A'));
 const entry=await page.evaluate(({key,gap})=>{const q=__qa,e=q.game.enemies.find(e=>e.placementKey===key);if(e?.rig!=='original-rat')throw Error('Same original-rat required');const p={x:e.pos.x+e.facing.x*gap,z:e.pos.z+e.facing.z*gap};if(!q.world.geometry.clear(p,.4)||!q.world.lineClear(p,e.pos))throw Error('Front rat entry blocked');const a=q.world.geometry.point(p);return{areaId:'westminster',entryPoint:{x:a.x,y:a.y},rat:{key:e.placementKey,pos:{...e.pos},facing:{...e.facing},hp:e.hp,radius:e.radius}};},{key,gap});
 await controlledEntry(page,entry);await resume(page);
 const before=await readState(page),target=before.enemies.find(e=>e.key===key),cursor=await page.evaluate(()=>__qaMelee.length);assert.equal(target.hp,20);
 let counter=null,accepted=null;
 if(expectedDamage)counter=await lowStrike(page,{targetKey:key,move,damage:expectedDamage,action});
 else{await legal(page);await aimAt(page,target.id);const box=await page.locator('#'+action).boundingBox();assert(box);await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);accepted=await(await waitEvent(page,{type:'attack',actor:0,move},before.events.length)).jsonValue();}
 await legal(page);
 const after=await readState(page),trace=await page.evaluate(cursor=>__qaMelee.slice(cursor).filter(t=>t.actor===0),cursor);assert.equal(after.enemies.find(e=>e.id===target.id).hp,20-expectedDamage);
 if(expectedDamage){const hits=trace.filter(t=>t.target===target.id&&t.result);assert(hits.length,'Actual displayed blade contact required');assert(hits.every(t=>t.blade&&t.targetRoot&&t.ratLow));assert(hits.every(t=>t.retimed===(action!=='slash')));}
 else{assert(!trace.some(t=>t.result));assert(trace.filter(t=>t.target===target.id).every(t=>t.gap>3),'Far control must remain far during contact');}
 const start=after.pos;await page.keyboard.down('d');try{await waitSimulation(page,p=>Math.hypot(__qa.game.player.pos.x-p.x,__qa.game.player.pos.z-p.z)>.1,start,{seconds:2,label:'rat-player-continuation'});}finally{await page.keyboard.up('d');}
 return{entry,before,counter,accepted,after,trace,continued:await readState(page),scope:'Actual Chromium touch control, native simulation counter window, displayed blade contact and recovery. Controlled front entry; no phone/all-heading claim.'};
}
