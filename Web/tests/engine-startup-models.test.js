import {indexOfToken} from './helpers/source-slice.js';
import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import vm from'node:vm';
import{createGame}from'../src/combat.js';import{createHollowEncounter}from'../src/hollow-encounter.js';import{createAreaRegistry}from'../src/area-registry.js';import{validateAreaMetadata}from'../src/engine/area-content.js';import{createGeometry}from'../src/world-geometry.js';
const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url))),manifest=read('../public/world/manifest.json'),registry=createAreaRegistry({manifest:{...manifest,initialArea:'lambeth'}}),data=validateAreaMetadata(read('../public/world/area-content.json'),registry),layout=read('../public/world/lambeth/layout.json');
function fixture(area='lambeth',extra={}){
 const registry=createAreaRegistry({manifest:{...manifest,initialArea:area}}),layout=read('../public/world/'+area+'/layout.json'),expectedProfile=data.bossData.placements.find(p=>p.areaId===area)?.profileRef,expectedModel=data.bossData.profiles[expectedProfile]?.modelRef;
 const events=[],requested=[],messages=[],g=createGeometry(layout),world={areaId:area,registry,bossData:data.bossData,residentPlacements:data.residents,layout,spawn:g.ground(registry.get(area).entry),move:(...args)=>g.move(...args),lineClear:(...args)=>g.lineClear(...args),viewZoomMultiplier:1,dispose(){events.push('world-dispose')}};let finish,reject,ready=false,libraryDisposed=false,actorDisposed=false;const pending=new Promise((yes,no)=>{finish=()=>{ready=true;yes()};reject=()=>no(Error('Boss download failed'));});
 const library={manifest:{models:{'hollow-scavenger':{contactRig:'hero',bodyScale:1}}},models:new Map(['vagrant','hollow-scavenger','original-rat'].map(n=>[n,{}])),complete:true,dispose(){if(!libraryDisposed){libraryDisposed=true;events.push('library-dispose')}}};
 const actor={views:new Map(),async ensureAreaModels(game){const refs=[...new Set(game.enemies.filter(e=>e.bossProfile).map(e=>e.rig))];assert.deepEqual(refs,expectedModel?[expectedModel]:[]);requested.push(...refs);events.push('models-request');if(refs.length){await pending;if(!libraryDisposed)library.models.set(refs[0],{});}},update(game){if(expectedModel&&(!ready||!library.models.has(game.enemies.find(e=>e.bossProfile).rig)))throw Error('Original boss export not ready');if(actorDisposed)throw Error('Actor owner disposed');events.push('actors-update')},ratContact(){return{}},dispose(){if(!actorDisposed){actorDisposed=true;events.push('actors-dispose');library.dispose()}}};
 class Renderer{setAnimationLoop(){events.push('render-loop')}render(){events.push('render')}getPixelRatio(){return 1}}
 const elements=new Map(),element=id=>{if(!elements.has(id))elements.set(id,{open:false});return elements.get(id)},context=vm.createContext({disposed:false,contextLost:false,loading:false,worldBoot:null,runRestored:false,syncedNotice:false,setTimeout:fn=>queueMicrotask(fn),GAME_DATA:{saveClient:{bootSyncWaitMs:0},diagnostics:{loadStallMs:60000}},lastLoadProgress:0,setInterval,clearInterval,loaded:false,world:null,game:null,actors:null,effects:null,atmosphere:null,pendingLibrary:null,startup:null,renderer:null,focusLost:false,enter:element('enter'),canvas:{},scene:{},camera:{},THREE:{WebGLRenderer:Renderer,SRGBColorSpace:'srgb',NoToneMapping:0},resize(){},hud:{loading(){events.push('loading')},ready(){events.push('ready')},failed(m){events.push('failed');messages.push(m)},toggleMenu(){}},audio:{unlock:()=>Promise.resolve(true),state:{error:null},reset(){events.push('audio-reset')}},prepareEncounter:async()=>[{status:'fulfilled',value:world},{status:'fulfilled',value:library}],pilot:{pilot:'donor-knife',areaResidents:true,openingGroup:false,pistol:true,supplies:true},mobileAssistEnabled:true,actorVisualScale:1.3225,createGame,createHollowEncounter,applyAreaLighting(){},createActors:()=>actor,resources:{restoreSavedRun(){}},createEffects:()=>({dispose(){events.push('effects-dispose')}}),createAtmosphere:()=>({dispose(){events.push('atmosphere-dispose')}}),loop:{frame(){}},areas:{start(){events.push('areas-start')}},document:{hidden:false,getElementById:element},location:{reload(){}},requestAnimationFrame:fn=>queueMicrotask(fn),performance,console:{info(){},warn(){},error(){events.push('error')}},...extra});
 const source=readFileSync(process.env.ENGINE_BROWSER_SOURCE??new URL('../src/engine/browser-session.js',import.meta.url),'utf8'),start=indexOfToken(source,'async function start() {'),end=indexOfToken(source,'listen(enter,"click",start);',start);assert(start>=0&&end>start);vm.runInContext(source.slice(start,end)+'\nglobalThis.begin=start;',context);
 return{context,events,requested,messages,finish,reject,begin:()=>context.begin(),stop(mode){context[mode]=true;actor.dispose();world.dispose();context.actors=null;context.loaded=false;}};
}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
for(const area of['lambeth','elephant-and-castle','east-bridge'])test('normal public '+area+' initialArea waits for its deferred model before first actor update and ready/render',async()=>{
 const f=fixture(area),work=f.begin();try{await flush();assert.equal(f.context.loaded,false);assert(f.events.includes('models-request'));assert(!f.events.includes('failed'));assert(!f.events.includes('actors-update'));f.finish();await work;assert.equal(f.context.loaded,true);assert(f.events.indexOf('actors-update')>f.events.indexOf('models-request'));assert.equal(f.events.filter(e=>e==='ready').length,1);assert(f.events.includes('render'));}finally{f.finish();await work;}
});
test('active deferred startup rejection stays unloaded and releases library/world with the real failure visible',async()=>{
 const f=fixture(),work=f.begin();try{await flush();assert(f.events.includes('models-request'));f.reject();await work;assert.equal(f.context.loaded,false);assert.equal(f.events.filter(e=>e==='failed').length,1);assert.equal(f.events.filter(e=>e==='library-dispose').length,1);assert.equal(f.context.pendingLibrary,null);assert(!f.events.includes('render'));}finally{f.finish();await work;}
});
for(const mode of['disposed','contextLost'])for(const settlement of['resolve','reject'])test('deferred boss startup '+settlement+' after '+mode+' cannot publish late ready/actors/render/UI',async()=>{
 const f=fixture(),work=f.begin();try{await flush();assert(f.events.includes('models-request'));f.stop(mode);const n=f.events.length;if(settlement==='resolve')f.finish();else f.reject();await work;assert.equal(f.context.loaded,false);assert.deepEqual(f.events.slice(n),[]);assert.equal(f.events.filter(e=>e==='library-dispose').length,1);}finally{f.finish();await work;}
});

test('Westminster waits for its current Witch model before publishing ready',async()=>{const f=fixture('westminster'),work=f.begin();try{await flush();assert.equal(f.context.loaded,false);assert.deepEqual(f.requested,['boss-westminster-witch']);f.finish();await work;assert.equal(f.context.loaded,true);assert(f.context.game.enemies.some(e=>e.bossProfile));}finally{f.finish();await work;}});

// A stalled connection (no model finishes) must end in a message and Retry, never a card stuck on "Loading Westminster…"; a failure that
// carries no message still says something; a late arrival after the stall is disposed; Retry then loads normally.
test('a stalled load fails with a message after loadStallMs, disposes the late load, and Retry starts the game',async()=>{
 let release,disposed=0,first=true;
 const late=new Promise(r=>release=r),f=fixture('lambeth',{GAME_DATA:{saveClient:{bootSyncWaitMs:0},diagnostics:{loadStallMs:1000}}});
 const good=f.context.prepareEncounter;
 f.context.prepareEncounter=()=>{if(first){first=false;return late}return good()};
 const work=f.begin();await work;
 assert.equal(f.context.loaded,false);assert.equal(f.events.filter(e=>e==='failed').length,1);assert.match(f.messages[0],/Loading has stopped.*Retry/);assert.equal(f.context.loading,false,'the card is usable again');
 release([{status:'fulfilled',value:{dispose(){disposed++}}},{status:'fulfilled',value:{dispose(){disposed++}}}]);await flush();
 assert.equal(disposed,2,'the abandoned load is disposed when it arrives');
 const again=f.begin();await flush();f.finish();await again;
 assert.equal(f.context.loaded,true,'Retry loads the game');assert.equal(f.events.filter(e=>e==='failed').length,1);
});
test('a load failure that carries no message still shows one',async()=>{
 const f=fixture('lambeth');
 f.context.prepareEncounter=async()=>[{status:'rejected',reason:undefined},{status:'fulfilled',value:{dispose(){}}}];
 await f.begin();
 assert.equal(f.context.loaded,false);assert.match(f.messages[0],/could not be loaded.*Retry/);
});
