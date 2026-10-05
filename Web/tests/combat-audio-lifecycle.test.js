import test from 'node:test';
import assert from 'node:assert/strict';
const {createDonorAudio}=await import(process.env.COMBAT_AUDIO_MODULE??'../src/donor-audio.js');
async function fixture(t,{reduced=false,missing=false}={}){
 const nodes=[];let contexts=0,buffers=0;
 class Param{value=0;setValueAtTime(v){this.value=v;}exponentialRampToValueAtTime(v){this.peak=Math.max(this.peak??0,v);}}
 class Node{constructor(kind){this.kind=kind;this.disconnects=0;this.connections=0;this.frequency=new Param();this.gain=new Param();nodes.push(this);}connect(){this.connections++;}disconnect(){this.disconnects++;}start(){this.started=true;}stop(){this.stopped=true;}}
 class Context{constructor(){contexts++;this.state='suspended';this.currentTime=1;this.sampleRate=48000;this.destination={};}async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';}async decodeAudioData(){return {}; }createGain(){return new Node('gain');}createOscillator(){return new Node('tone');}createBufferSource(){return new Node('sample');}createBiquadFilter(){return new Node('filter');}createBuffer(){buffers++;return {getChannelData:()=>new Float32Array(7680)};}}
 const saved=new Map(['AudioContext','webkitAudioContext','matchMedia','fetch'].map(k=>[k,globalThis[k]]));
 globalThis.AudioContext=missing?undefined:Context;globalThis.webkitAudioContext=undefined;globalThis.matchMedia=()=>({matches:reduced});globalThis.fetch=async()=>({ok:true,json:async()=>({url:'combat.wav',cues:{hit_flesh:[[0,.1]],hit_heavy:[[0,.1]]}}),arrayBuffer:async()=>new ArrayBuffer(0)});
 const audio=createDonorAudio({baseUrl:'https://example.test/'});t.after(async()=>{await audio.dispose();for(const [k,v] of saved)if(v===undefined)delete globalThis[k];else globalThis[k]=v;});
 return {audio,nodes,counts:()=>({contexts,buffers}),sources:()=>nodes.filter(n=>n.started),peaks:()=>nodes.filter(n=>n.kind==='gain'&&n.gain.peak!==undefined).map(n=>n.gain.peak)};
}
const hit=id=>({type:'hit',weapon:'pistol',amount:25,actor:{id}});
const death=id=>({type:'death',weapon:'pistol',actor:{id}});

test('locked/muted/unavailable audio plays nothing and failed unlock is contained',async t=>{
 const f=await fixture(t,{missing:true});assert.equal(await f.audio.unlock(),false);assert.doesNotThrow(()=>f.audio.play([{type:'shot'}]));assert.equal(f.sources().length,0);assert.equal(f.audio.state.activeVoices,0);
});
test('one context/noise cache and16source cap across rapid pistol and melee events',async t=>{
 const f=await fixture(t);await f.audio.unlock();for(let i=0;i<1000;i++)f.audio.play([{type:'shot'},hit(i),{type:'hit',weapon:'knife',amount:10}]);assert.equal(f.audio.state.activeVoices,16);assert.equal(f.sources().length,16);assert.deepEqual(f.counts(),{contexts:1,buffers:1});
 f.audio.reset();await f.audio.unlock();f.audio.play([{type:'shot'}]);assert.deepEqual(f.counts(),{contexts:1,buffers:1});
});
test('High/Low/Off and reduced motion give distinct actual gains/layers',async t=>{
 const f=await fixture(t);await f.audio.unlock();f.audio.play([{type:'shot'}]);assert.equal(f.sources().length,2);const high=f.peaks();f.audio.setMode('low');let start=f.nodes.length;f.audio.play([{type:'shot'}]);const low=f.nodes.slice(start).filter(n=>n.gain.peak!==undefined).map(n=>n.gain.peak);assert.equal(low.length,2);for(let i=0;i<2;i++)assert.ok(Math.abs(low[i]-high[i]*.4)<1e-12);
 f.audio.setMode('off');start=f.nodes.length;f.audio.play([{type:'shot'}]);assert.equal(f.nodes.slice(start).filter(n=>n.started).length,1);
 globalThis.matchMedia=()=>({matches:true});f.audio.setMode('high');assert.equal(f.audio.state.mode,'low');start=f.nodes.length;f.audio.play([{type:'shot'}]);assert.deepEqual(f.nodes.slice(start).filter(n=>n.gain.peak!==undefined).map(n=>n.gain.peak),low);
});
test('reset/mute/pause/dispose tolerate late onended and reconnect one output only',async t=>{
 const f=await fixture(t);await f.audio.unlock();
 for(const action of [()=>f.audio.reset(),()=>f.audio.setEnabled(false),()=>f.audio.pause(),()=>f.audio.dispose()]){
  f.audio.setEnabled(true);await f.audio.unlock();const start=f.nodes.length;f.audio.play([{type:'shot'}]);const owned=f.nodes.slice(start),callbacks=owned.filter(n=>n.onended).map(n=>n.onended);await action();callbacks.forEach(cb=>cb());assert.equal(f.audio.state.activeVoices,0);for(const n of owned)assert.ok(n.disconnects<=1,`${n.kind} disconnected twice`);
 }
 const outputs=f.nodes.filter(n=>n.kind==='gain'&&n.gain.value===.65);assert.equal(outputs.length,1);assert.equal(outputs[0].connections,1);
});
test('mute independent ofFX mode; optional sources stay stopped until reenabled',async t=>{
 const f=await fixture(t);await f.audio.unlock();f.audio.setEnabled(false);f.audio.setMode('high');f.audio.play([{type:'shot'}]);assert.equal(f.sources().length,0);f.audio.setEnabled(true);await f.audio.unlock();f.audio.play([{type:'shot'}]);assert.equal(f.sources().length,2);
});
test('pistol nonlethal and lethal pair replaceWAV, one killcue even with duplicate hit',async t=>{
 const f=await fixture(t);await f.audio.unlock();f.audio.play([hit(7)]);assert.equal(f.sources().length,2);assert.equal(f.sources().filter(n=>n.buffer&&!n.buffer.getChannelData).length,0);
 f.audio.reset();const start=f.sources().length;f.audio.play([hit(8),hit(8),death(8)]);assert.equal(f.sources().length-start,3);assert.equal(f.audio.state.killEvents,1);
});
test('accepted pistol death-only emits killcue once per distinct victim',async t=>{
 const f=await fixture(t);await f.audio.unlock();f.audio.play([death(7),death(7),death(8)]);assert.equal(f.sources().length,6);assert.equal(f.audio.state.killEvents,2);
});
test('zero/blocked pistol hits silent; melee keeps exactly one originalWAV',async t=>{
 const f=await fixture(t);await f.audio.unlock();f.audio.play([{...hit(7),amount:0},{...hit(8),blocked:true}]);assert.equal(f.sources().length,0);f.audio.play([{type:'hit',weapon:'knife',amount:10},{type:'death',weapon:'knife',actor:{id:9}}]);assert.equal(f.sources().length,1);assert.equal(f.sources()[0].kind,'sample');assert.equal(typeof f.sources()[0].buffer.getChannelData,'undefined');
});
