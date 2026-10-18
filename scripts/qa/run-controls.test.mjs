import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
// Consumer-routing tests only. Web owns independent actual guard/actionability tests.
const substitute='data:text/javascript,'+encodeURIComponent(`export const checkedControl=(page,options)=>page.checkedControl(options);export const checkedNavigation=(page,options)=>page.checkedNavigation(options);`);
const source=fs.readFileSync(new URL('./run-controls.mjs',import.meta.url),'utf8').replace("'./ui-interaction-guard.mjs'",JSON.stringify(substitute));
const controls=await import('data:text/javascript,'+encodeURIComponent(source));
function fixture({menuOpen=false,settingsHidden=true,detailsOpen=false,missingSettings=false,rejectRetry=false}={}) {
 const nodes={menu:{open:menuOpen},'menu-settings':{hidden:settingsHidden},'testing-tools':{open:detailsOpen},entry:{hidden:false},enter:{}};
 const calls=[];
 const evaluate=async fn=>{const prior=globalThis.document;globalThis.document={getElementById:id=>nodes[id]??null};try{return fn();}finally{globalThis.document=prior;}};
 const page={evaluate,async checkedControl(options){
  const {selector,ack}=options;calls.push(selector);
  if(selector==='#menu-button')nodes.menu.open=true;
  else if(selector==='#menu-settings-button'){
   assert(nodes.menu.open,'menu must be open');if(missingSettings)throw Error('missing Settings control');nodes['menu-settings'].hidden=false;
  }else if(selector==='#testing-tools > summary'){
   assert(!nodes['menu-settings'].hidden,'Settings must be visible before details');nodes['testing-tools'].open=true;
  }else if(selector==='#retry'){
   assert(nodes.menu.open&&!nodes['menu-settings'].hidden&&nodes['testing-tools'].open,'Retry must be visible');
   if(rejectRetry)throw Error('disabled Retry');nodes.menu.open=false;
  }else if(selector==='#enter')nodes.entry.hidden=true;
  else throw Error('unexpected control '+selector);
  assert(await evaluate(ack),'action acknowledgement required');return{selector,phase:'acknowledged'};
 },async checkedNavigation(options){calls.push(options.reload?'reload':options.url);nodes.entry.hidden=false;assert(await evaluate(options.ack));return{phase:'acknowledged'};}};
 return{page,calls,nodes};
}
test('closed menu Retry follows actual Settings and disclosure sequence before dispatch',async()=>{
 const f=fixture();await controls.retryEncounter(f.page);
 assert.deepEqual(f.calls,['#menu-button','#menu-settings-button','#testing-tools > summary','#retry']);assert.equal(f.nodes.menu.open,false);
});
test('already visible Retry does not toggle its ancestors closed',async()=>{
 const f=fixture({menuOpen:true,settingsHidden:false,detailsOpen:true});await controls.retryEncounter(f.page);assert.deepEqual(f.calls,['#retry']);
});
test('missing Settings stops before disclosure or Retry',async()=>{
 const f=fixture({missingSettings:true});await assert.rejects(controls.retryEncounter(f.page),/missing Settings/);
 assert.deepEqual(f.calls,['#menu-button','#menu-settings-button']);assert.equal(f.nodes.menu.open,true);
});
test('disabled Retry rejection propagates once, no fallback or repeated clicks',async()=>{
 const f=fixture({rejectRetry:true});await assert.rejects(controls.retryEncounter(f.page),/disabled Retry/);
 assert.equal(f.calls.filter(x=>x==='#retry').length,1);assert.equal(f.nodes.menu.open,true);
});
test('cold reload returns through guarded entry before subsequent Retry',async()=>{
 const f=fixture();await controls.navigateGame(f.page,'https://example.invalid/?touch=1');await controls.enterGame(f.page,{touch:true});
 await controls.retryEncounter(f.page);await controls.reloadGame(f.page);await controls.enterGame(f.page,{touch:true});await controls.retryEncounter(f.page);
 assert.equal(f.calls.filter(x=>x==='#retry').length,2);assert.equal(f.calls.filter(x=>x==='reload').length,1);assert.equal(f.nodes.entry.hidden,true);
});
