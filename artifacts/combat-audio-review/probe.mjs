import {createDonorAudio} from './donor-audio.snapshot.mjs';
import fs from 'node:fs';
const receipts=[];
async function fixture(run){
 const nodes=[];let buffers=0,contexts=0;
 class Param{value=0;setValueAtTime(v,t){this.value=v;this.initial??=v;}exponentialRampToValueAtTime(v,t){this.peak=Math.max(this.peak??0,v);}}
 class Node{constructor(kind){this.kind=kind;this.disconnects=0;this.connections=0;this.frequency=new Param();this.gain=new Param();nodes.push(this);}connect(){this.connections++;}disconnect(){this.disconnects++;}start(){this.started=true;}stop(){this.stopped=true;}}
 class Context{constructor(){contexts++;this.state='suspended';this.currentTime=1;this.sampleRate=48000;this.destination={};}async resume(){this.state='running';}async suspend(){this.state='suspended';}async close(){this.state='closed';}async decodeAudioData(){return {}; }createGain(){return new Node('gain');}createOscillator(){return new Node('tone');}createBufferSource(){return new Node('sample');}createBiquadFilter(){return new Node('filter');}createBuffer(){buffers++;return {getChannelData:()=>new Float32Array(7680)};}}
 globalThis.AudioContext=Context;globalThis.matchMedia=()=>({matches:false});globalThis.fetch=async()=>({ok:true,json:async()=>({url:'combat.wav',cues:{hit_flesh:[[0,.1]],hit_heavy:[[0,.1]]}}),arrayBuffer:async()=>new ArrayBuffer(0)});
 const audio=createDonorAudio({baseUrl:'https://example.test/'});await audio.unlock();await run({audio,nodes,get counts(){return{contexts,buffers};}});await audio.dispose();
}
await fixture(async f=>{for(const mode of ['high','low','off']){f.audio.setMode(mode);const start=f.nodes.length;f.audio.play([{type:'shot'}]);receipts.push({case:'shot-'+mode,state:f.audio.state,layers:f.nodes.slice(start).filter(n=>n.started).length,envelopePeaks:f.nodes.slice(start).filter(n=>n.kind==='gain').map(n=>n.gain.peak)});}receipts.push({case:'single-context-noise-cache',...f.counts});});
await fixture(async f=>{f.audio.play([{type:'shot'}]);const callbacks=f.nodes.filter(n=>n.onended).map(n=>n.onended);f.audio.reset();callbacks.forEach(cb=>cb());receipts.push({case:'reset-late-ended',maxDisconnects:Math.max(...f.nodes.map(n=>n.disconnects)),voices:f.audio.state.activeVoices});});
await fixture(async f=>{f.audio.play([{type:'death',weapon:'pistol',actor:{id:7}}]);receipts.push({case:'standalone-pistol-death',voices:f.audio.state.activeVoices});f.audio.play([{type:'hit',weapon:'pistol',amount:25,actor:{id:7}},{type:'hit',weapon:'pistol',amount:25,actor:{id:7}},{type:'death',weapon:'pistol',actor:{id:7}}]);receipts.push({case:'duplicate-lethal-hit-in-batch',voices:f.audio.state.activeVoices,killEvents:f.audio.state.killEvents});});
await fixture(async f=>{for(let i=0;i<1000;i++)f.audio.play([{type:'shot'}]);receipts.push({case:'rapid-1000',voices:f.audio.state.activeVoices,started:f.nodes.filter(n=>n.started).length,...f.counts});});
await fixture(async f=>{f.audio.play([{type:'hit',weapon:'knife',amount:10},{type:'death',weapon:'knife',actor:{id:9}}]);receipts.push({case:'melee-retains-one-WAV',started:f.nodes.filter(n=>n.started).length});});
fs.writeFileSync(new URL('./probe-results.json',import.meta.url),JSON.stringify(receipts,null,2));console.log(JSON.stringify(receipts,null,2));
