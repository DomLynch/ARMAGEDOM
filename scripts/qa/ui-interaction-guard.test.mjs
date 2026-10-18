import test from 'node:test';
import assert from 'node:assert/strict';
import {checkedControl,checkedNavigation} from './ui-interaction-guard.mjs';

function fixture(options={}){
 const state={exists:true,hidden:false,disabled:false,inert:false,covered:false,detailsOpen:true,visibleDocument:true,onScreen:true,autoAck:true,ack:false,dispatchHang:false,ackHang:false,url:'https://example.invalid/',...options};
 const calls=[],css={display:'block',visibility:'visible',opacity:'1',pointerEvents:'auto'};
 const summary={contains:()=>false},details={tagName:'DETAILS',open:state.detailsOpen,parentElement:null,style:css,querySelector:()=>summary};
 const el={id:'retry',tagName:'BUTTON',style:css,parentElement:details,contains:node=>node===el,matches:()=>state.disabled,getAttribute:name=>name==='aria-disabled'&&state.ariaDisabled?'true':null,closest:()=>state.inert?{}:null,getClientRects:()=>state.hidden?[]:[{}],getBoundingClientRect:()=>state.rect??({x:10,y:state.onScreen?20:1000,left:10,right:110,top:state.onScreen?20:1000,bottom:state.onScreen?60:1040,width:100,height:40})};
 Object.defineProperty(el,'hidden',{get:()=>state.hidden});
 const document={readyState:'complete',get visibilityState(){return state.visibleDocument?'visible':'hidden';},querySelectorAll:()=>!state.exists?[]:state.ambiguous?[el,el]:[el],elementFromPoint:()=>state.covered?{tagName:'DIV',id:'overlay'}:el,getElementById:id=>id==='entry'?{hidden:state.ack}:id==='enter'?el:id==='menu'?{open:true}:id==='menu-settings'?{hidden:!state.detailsOpen}:id==='testing-tools'?{open:state.detailsOpen}:null};
 async function evaluate(fn,arg){const values={document,innerWidth:393,innerHeight:852,location:{href:state.url},getComputedStyle:node=>node.style??css,__qa:{game:{time:5,tick:300,player:{hp:150,weapon:'knife'},finished:false}}},old=new Map();for(const[key,value]of Object.entries(values)){old.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}try{return await fn(arg);}finally{for(const[key,descriptor]of old)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
 async function dispatch(method,selector,opts){calls.push({method,selector,opts});assert.equal(opts.force,undefined);assert.ok(opts.timeout>0);if(state.dispatchHang)return new Promise(()=>{});if(state.dispatchError)throw Error('dispatch transport error');if(state.autoAck)state.ack=true;}
 const page={evaluate,click:(s,o)=>dispatch('click',s,o),tap:(s,o)=>dispatch('tap',s,o),touchscreen:{tap:async(x,y)=>{calls.push({method:'touchscreen-tap',x,y});if(state.dispatchHang)return new Promise(()=>{});if(state.dispatchError)throw Error('touch transport error');if(state.autoAck)state.ack=true;}},goto:async(url,o)=>{await dispatch('goto',null,o);state.url=url;},reload:o=>dispatch('reload',null,o),waitForFunction:async(fn,arg,opts)=>{calls.push({method:'waitForFunction',opts});if(state.ackHang)return new Promise(()=>{});const value=await evaluate(fn,arg);return{jsonValue:async()=>value,dispose:async()=>calls.push({method:'dispose'})};},mouse:{up:async opts=>{calls.push({method:'mouse-up',opts});if(state.releaseError)throw Error('release failed');}},context:()=>({newCDPSession:async()=>({send:async(method,args)=>calls.push({method,args}),detach:async()=>calls.push({method:'detach'})})})};
 return{page,state,calls};
}
const options={selector:'#retry',method:'click',ack:()=>document.getElementById('entry').hidden===true,timeoutMs:50,label:'retry'};
test('missing/hidden/disabled/covered/offscreen/inert/closed-details controls reject before primary input with prompt actual snapshot',async()=>{
 for(const variation of[{exists:false},{hidden:true},{disabled:true},{covered:true},{onScreen:false},{inert:true},{detailsOpen:false},{visibleDocument:false},{ambiguous:true}]){
  const f=fixture(variation),start=Date.now();await assert.rejects(checkedControl(f.page,options),error=>{assert.equal(error.phase,'precondition');assert.equal(error.dispatched,false);assert.equal(error.classification,'driver/setup');assert.ok(error.before.viewport);assert.ok(error.before.reason);return true;});assert.ok(Date.now()-start<1000);assert.equal(f.calls.filter(c=>['click','tap'].includes(c.method)).length,0);assert.equal(f.calls.filter(c=>c.method==='mouse-up').length,1);
 }
});
test('one valid control dispatch waits for true acknowledgement and releases input without force',async()=>{
 const f=fixture(),result=await checkedControl(f.page,options);assert.equal(result.phase,'acknowledged');assert.equal(result.dispatched,true);assert.equal(result.before.actionable,true);assert.equal(result.acknowledgement,true);assert.deepEqual(result.releaseErrors,[]);assert.deepEqual(f.calls.map(c=>c.method),['click','waitForFunction','dispose','mouse-up']);assert.equal(f.calls[0].opts.strict,true);
});
test('already satisfied predicate rejects without input instead of falsely proving an action',async()=>{
 const f=fixture({ack:true});await assert.rejects(checkedControl(f.page,options),error=>error.phase==='precondition'&&error.dispatched===false&&/already true/.test(error.message));assert.equal(f.calls.filter(c=>c.method==='click').length,0);
});
test('observation transport failures cannot masquerade as hidden-control precondition proof',async()=>{
 const f=fixture(),evaluate=f.page.evaluate;let calls=0;f.page.evaluate=async(...args)=>{if(++calls===1)throw Error('snapshot transport');return evaluate(...args);};await assert.rejects(checkedControl(f.page,options),error=>error.phase==='snapshot'&&error.dispatched===false&&error.classification==='unknown');assert.equal(f.calls.filter(c=>c.method==='click').length,0);
 const second=fixture(),observe=second.page.evaluate;let reads=0;second.page.evaluate=async(...args)=>{if(++reads===2)throw Error('baseline observer');return observe(...args);};await assert.rejects(checkedControl(second.page,options),error=>error.phase==='baseline-acknowledgement'&&error.dispatched===false);assert.equal(second.calls.filter(c=>c.method==='click').length,0);
});
test('missing acknowledgement has finite deadline, retains before/after diagnostics and releases once',async()=>{
 const f=fixture({autoAck:false,ackHang:true}),start=Date.now();await assert.rejects(checkedControl(f.page,{...options,timeoutMs:10}),error=>{assert.equal(error.phase,'acknowledgement');assert.equal(error.dispatched,true);assert.equal(error.classification,'unknown');assert.equal(error.before.game.tick,300);assert.ok(error.after);return true;});assert.ok(Date.now()-start<1000);assert.equal(f.calls.filter(c=>c.method==='click').length,1);assert.equal(f.calls.filter(c=>c.method==='mouse-up').length,1);
});
test('dispatch hang/failure remains dispatch failure and always attempts release, no retry',async()=>{
 for(const variation of[{dispatchHang:true},{dispatchError:true}]){const f=fixture(variation);await assert.rejects(checkedControl(f.page,{...options,timeoutMs:10}),error=>error.phase==='dispatch'&&error.dispatched===true);assert.equal(f.calls.filter(c=>c.method==='click').length,1);assert.equal(f.calls.filter(c=>c.method==='mouse-up').length,1);}
});
test('diagnostic grace preserves native timeout call log without extending Playwright action timeout',async()=>{
 const f=fixture();let nativeTimeout;f.page.click=async(selector,opts)=>{nativeTimeout=opts.timeout;f.calls.push({method:'click',selector,opts});await new Promise(resolve=>setTimeout(resolve,opts.timeout+10));throw Error('page.click: Timeout exceeded.\nCall log:\n- element did not become stable');};
 const started=Date.now();await assert.rejects(checkedControl(f.page,{...options,timeoutMs:20}),error=>error.phase==='dispatch'&&error.dispatched===true&&/Call log:/.test(error.message)&&/did not become stable/.test(error.message));assert.ok(nativeTimeout>0&&nativeTimeout<=20);assert.ok(Date.now()-started<1000);assert.equal(f.calls.filter(c=>c.method==='click').length,1);assert.equal(f.calls.filter(c=>c.method==='mouse-up').length,1);
});
test('dispatch success arriving during diagnostic grace is rejected, no late acknowledgement acceptance',async()=>{
 const f=fixture();f.page.click=async(selector,opts)=>{f.calls.push({method:'click',selector,opts});await new Promise(resolve=>setTimeout(resolve,opts.timeout+10));f.state.ack=true;};await assert.rejects(checkedControl(f.page,{...options,timeoutMs:20}),error=>error.phase==='dispatch'&&/after action deadline/.test(error.message));assert.equal(f.calls.filter(c=>c.method==='waitForFunction').length,0);assert.equal(f.calls.filter(c=>c.method==='mouse-up').length,1);
});
test('tap uses the freshly hit-tested visible coordinate, not selector tap post-handler waiting',async()=>{
 const f=fixture();f.page.tap=()=>{throw Error('selector tap must not run');};const result=await checkedControl(f.page,{...options,method:'tap'});assert.equal(result.phase,'acknowledged');assert.deepEqual(f.calls.find(c=>c.method==='touchscreen-tap'),{method:'touchscreen-tap',x:60,y:40});assert.deepEqual(result.before.point,{x:60,y:40});assert.equal(f.calls.filter(c=>c.method==='tap').length,0);assert.equal(f.calls.filter(c=>c.method==='mouse-up').length,1);assert.deepEqual(f.calls.find(c=>c.method==='Input.dispatchTouchEvent').args,{type:'touchCancel',touchPoints:[]});assert.equal(f.calls.filter(c=>c.method==='detach').length,1);
});
test('coordinate touch rejects changed readiness/geometry, still requires independent acknowledgement',async()=>{
 for(const change of[state=>state.covered=true,state=>state.rect={x:40,y:20,left:40,right:140,top:20,bottom:60,width:100,height:40}]){const f=fixture(),observe=f.page.evaluate;let reads=0;f.page.evaluate=async(...args)=>{if(++reads===3)change(f.state);return observe(...args);};await assert.rejects(checkedControl(f.page,{...options,method:'tap'}),error=>error.phase==='precondition'&&error.dispatched===false);assert.equal(f.calls.filter(c=>c.method==='touchscreen-tap').length,0);}
 const f=fixture({autoAck:false,ackHang:true});await assert.rejects(checkedControl(f.page,{...options,method:'tap',timeoutMs:10}),error=>error.phase==='acknowledgement'&&error.dispatched===true);assert.equal(f.calls.filter(c=>c.method==='touchscreen-tap').length,1);
 const hung=fixture({dispatchHang:true});await assert.rejects(checkedControl(hung.page,{...options,method:'tap',timeoutMs:10}),error=>error.phase==='dispatch');assert.equal(hung.calls.filter(c=>c.method==='touchscreen-tap').length,1);
});
test('only exact no-active-touch protocol response is a completed release, other touch errors remain fatal',async()=>{
 for(const message of['cdpSession.send: Protocol error (Input.dispatchTouchEvent): Must send a TouchStart first to start a new touch.','Must send a TouchStart first to start a new touch.','Protocol error (Input.dispatchTouchEvent): Target closed','cdpSession.send: Protocol error (Input.dispatchTouchEvent): Must send a TouchStart first to start a new touch. unexpected suffix']){
  const f=fixture();let detached=0;f.page.context=()=>({newCDPSession:async()=>({send:async()=>{throw Error(message);},detach:async()=>{detached++;}})});
  if(message==='cdpSession.send: Protocol error (Input.dispatchTouchEvent): Must send a TouchStart first to start a new touch.')assert.deepEqual((await checkedControl(f.page,{...options,method:'tap'})).releaseErrors,[]);
  else await assert.rejects(checkedControl(f.page,{...options,method:'tap'}),error=>error.phase==='release'&&error.releaseErrors.length===1);
  assert.equal(detached,1);assert.equal(f.calls.filter(c=>c.method==='touchscreen-tap').length,1);assert.equal(f.calls.filter(c=>c.method==='mouse-up').length,1);
 }
});
test('navigation/reload use bounded DOM-content-loaded dispatch plus actual acknowledgement',async()=>{
 for(const settings of[{url:'https://example.invalid/next'},{reload:true}]){const f=fixture(),result=await checkedNavigation(f.page,{...settings,ack:()=>document.getElementById('enter')!==null,timeoutMs:50});assert.equal(result.phase,'acknowledged');assert.equal(f.calls.filter(c=>['goto','reload'].includes(c.method)).length,1);assert.equal(f.calls[0].opts.waitUntil,'domcontentloaded');assert.equal(f.calls.filter(c=>c.method==='mouse-up').length,1);}
});
test('release transport failure is explicit, invalid options cannot dispatch',async()=>{
 const f=fixture({releaseError:true});await assert.rejects(checkedControl(f.page,options),error=>error.phase==='release'&&error.releaseErrors.length===1);const invalid=fixture();for(const settings of[{method:'force'},{timeoutMs:0},{ack:null}])await assert.rejects(checkedControl(invalid.page,{...options,...settings}),error=>error.phase==='config'&&error.dispatched===false);for(const settings of[{url:'https://example.invalid/',reload:true},{url:'file:///tmp/a'},{}])await assert.rejects(checkedNavigation(invalid.page,{...settings,ack:()=>true}),error=>error.phase==='config');assert.equal(invalid.calls.length,0);
});
