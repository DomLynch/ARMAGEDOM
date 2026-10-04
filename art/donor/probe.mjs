// Geometry-only CPU comparison. No donor edits, texture upload or browser process.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from '../../Web/node_modules/three/build/three.module.js';
import {GLTFLoader} from '../../Web/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

export const sha=b=>createHash('sha256').update(b).digest('hex');
export function decode(b){const n=b.readUInt32LE(12);return {doc:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n),binOffset:28+n};}
export function normalizedCopy(b){
 const candidate=Buffer.from(b),{doc,bin,binOffset}=decode(b);const seen=new Set();let keys=0;
 for(const clip of doc.animations??[])for(const channel of clip.channels){
  if(channel.target.path!=='rotation')continue;
  const sampler=clip.samplers[channel.sampler],id=sampler.output;if(seen.has(id))continue;seen.add(id);
  if((sampler.interpolation??'LINEAR')!=='LINEAR')throw Error('Untested interpolation');
  const a=doc.accessors[id],v=doc.bufferViews[a.bufferView];if(a.componentType!==5126||a.type!=='VEC4'||v.byteStride)throw Error('Untested quaternion layout');
  const start=(v.byteOffset??0)+(a.byteOffset??0);
  for(let i=0;i<a.count;i++){
   const at=start+i*16,q=Array.from({length:4},(_,j)=>bin.readFloatLE(at+j*4)),length=Math.hypot(...q);
   if(!Number.isFinite(length)||length<1e-8)throw Error('Invalid zero quaternion');
   if(Math.abs(length-1)<=1e-7)continue;
   for(let j=0;j<4;j++)candidate.writeFloatLE(q[j]/length,binOffset+at+j*4);keys++;
  }
 }
 // Rotation output bounds must describe the normalized values too.
 for(const id of seen){
  const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],start=binOffset+(v.byteOffset??0)+(a.byteOffset??0);
  const min=[Infinity,Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity,-Infinity];
  for(let i=0;i<a.count;i++)for(let j=0;j<4;j++){const q=candidate.readFloatLE(start+i*16+j*4);min[j]=Math.min(min[j],q);max[j]=Math.max(max[j],q);}
  if(a.min)a.min=min;if(a.max)a.max=max;
 }
 const json=Buffer.from(JSON.stringify(doc)),padded=Buffer.alloc(Math.ceil(json.length/4)*4,32);json.copy(padded);
 const data=candidate.subarray(binOffset),head=Buffer.alloc(20),binHead=Buffer.alloc(8);
 head.writeUInt32LE(0x46546c67,0);head.writeUInt32LE(2,4);head.writeUInt32LE(28+padded.length+data.length,8);head.writeUInt32LE(padded.length,12);head.writeUInt32LE(0x4e4f534a,16);
 binHead.writeUInt32LE(data.length,0);binHead.writeUInt32LE(0x004e4942,4);
 return {bytes:Buffer.concat([head,padded,binHead,data]),normalizedKeyframes:keys};
}
globalThis.ProgressEvent=class{constructor(_,fields){Object.assign(this,fields);}};
export async function loadGeometry(bytes){
 const {doc,bin}=decode(bytes);doc.images=[];doc.textures=[];doc.materials=(doc.materials??[]).map(m=>({name:m.name}));
 doc.buffers[0].uri='data:application/octet-stream;base64,'+bin.toString('base64');
 return new GLTFLoader().parseAsync(JSON.stringify(doc),'');
}
export function equipPlayer(asset,part){
 const hand=asset.scene.getObjectByName('hand_r'),knife=part.scene.getObjectByName('WeaponDrawn');
 if(!hand||!knife)throw Error('Missing native knife binding');
 for(const name of ['WeaponDrawn','SwordDrawn','SwordSheathed'])asset.scene.getObjectByName(name)?.removeFromParent();
 hand.add(knife);const names=new Set(part.animations.map(c=>c.name));
 asset.animations=[...part.animations,...asset.animations.filter(c=>!names.has(c.name))];return asset;
}
export function swingProgress(progress,contact=.35,source=.34){
 const keys=[[0,0],[contact*.7,source*.44],[contact,source],[contact+.16,source+(1-source)*.56],[1,1]],p=THREE.MathUtils.clamp(progress,0,1);
 for(let i=1;i<keys.length;i++)if(p<=keys[i][0]){const [x,y]=keys[i-1],[end,value]=keys[i];return y+(value-y)*(p-x)/(end-x);}return 1;
}
export function sample(asset,mixer,name,progress){
 mixer.stopAllAction();const clip=asset.animations.find(c=>c.name===name);if(!clip)throw Error('Missing clip '+name);
 const action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
 mixer.setTime(Math.min(.999999,Math.max(0,progress))*clip.duration);asset.scene.updateMatrixWorld(true);
 asset.scene.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.update();});
}
export function endpoints(asset){const knife=asset.scene.getObjectByName('WeaponDrawn');return [.12,.52].map(y=>knife.localToWorld(new THREE.Vector3(0,y,0)));}

async function main(){
 const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
 const intake=path.resolve(root,'../character/art/reuse/frankendom-20261004');
 const original=JSON.parse(fs.readFileSync(path.join(intake,'manifest.json')));
 const out=path.join(root,'art/donor/receipts');fs.mkdirSync(out,{recursive:true});
 const revision=original.donor_revision,donor=original.donor_repo,files={player:'src/assets/warrior.glb',opponent:'src/assets/goblin.glb',weapon:'src/assets/weapons/player/knife.glb'},source={};
 for(const [key,file]of Object.entries(files)){const b=execFileSync('git',['-C',donor,'show',revision+':'+file],{maxBuffer:30e6});if(sha(b)!==original.files.find(f=>f.path===file).sha256)throw Error('Source mismatch');source[key]=b;}
 const tables=JSON.parse(fs.readFileSync(path.join(intake,'knife-contact-paths.json')));
 const donorMoves=await import('file://'+donor+'/src/moves.ts');
 const specs=donorMoves.WEAPONS.knife.paths;const result={revision,files:{},models:[]};
 for(const [key,b]of Object.entries(source)){const n=normalizedCopy(b);result.files[key]={sourceSha256:sha(b),candidateSha256:sha(n.bytes),normalizedKeyframes:n.normalizedKeyframes};}
 for(const [key,rig]of [['player','hero'],['opponent','goblin']]){
  const a=await loadGeometry(source[key]),b=await loadGeometry(normalizedCopy(source[key]).bytes);
  if(key==='player'){equipPlayer(a,await loadGeometry(source.weapon));equipPlayer(b,await loadGeometry(normalizedCopy(source.weapon).bytes));}
  const ma=new THREE.AnimationMixer(a.scene),mb=new THREE.AnimationMixer(b.scene),bonesA=[],bonesB=[],meshesA=[],meshesB=[];
  for(const [asset,bones,meshes]of [[a,bonesA,meshesA],[b,bonesB,meshesB]])asset.scene.traverse(n=>{if(n.isBone)bones.push(n);if(n.isSkinnedMesh)meshes.push(n);});
  let maxSourceTableError=0,maxContactDelta=0,maxBoneDelta=0,maxVertexDelta=0;const samples=[];
  for(const [move,spec]of Object.entries(specs)){
   const length=spec.windup+spec.active+spec.recovery;
   for(let age=0;age<=length;age++){
    const phase=swingProgress(age/length,spec.windup/length,spec.source);sample(a,ma,spec.clip,phase);sample(b,mb,spec.clip,phase);
    const pa=endpoints(a),pb=endpoints(b),expected=tables[rig].knife[move][age];let tableError=0,contactDelta=0;
    for(let j=0;j<2;j++){tableError=Math.max(tableError,pa[j].distanceTo(new THREE.Vector3(...expected.slice(j*3,j*3+3))));contactDelta=Math.max(contactDelta,pa[j].distanceTo(pb[j]));}
    maxSourceTableError=Math.max(maxSourceTableError,tableError);maxContactDelta=Math.max(maxContactDelta,contactDelta);
    if(age===spec.windup)samples.push({move,age,phase,sourceContact:pa.map(v=>v.toArray()),candidateContact:pb.map(v=>v.toArray()),sourceTableError:tableError,contactDelta});
   }
  }
  const clips=['Armed','Attack','Return','Heavy','Riposte','Guard','Roll','Hit','Death',...(key==='player'?['Skill_Pommel']:[])];
  for(const clip of clips)for(const phase of [0,.125,.25,.34,.48,.5,.75,.875,.999999]){
   sample(a,ma,clip,phase);sample(b,mb,clip,phase);
   const va=new THREE.Vector3(),vb=new THREE.Vector3();let vertexDelta=0;
   for(let i=0;i<bonesA.length;i++)maxBoneDelta=Math.max(maxBoneDelta,bonesA[i].getWorldPosition(va).distanceTo(bonesB[i].getWorldPosition(vb)));
   for(let i=0;i<meshesA.length;i++)for(let v=0;v<meshesA[i].geometry.attributes.position.count;v++){
    meshesA[i].getVertexPosition(v,va).applyMatrix4(meshesA[i].matrixWorld);meshesB[i].getVertexPosition(v,vb).applyMatrix4(meshesB[i].matrixWorld);vertexDelta=Math.max(vertexDelta,va.distanceTo(vb));
   }
   maxVertexDelta=Math.max(maxVertexDelta,vertexDelta);
  }
  const report={key,rig,maxSourceTableError,maxContactDelta,maxBoneDelta,maxVertexDelta,clips,sampledClipPoses:clips.length*9,contactFrames:samples};result.models.push(report);console.log(JSON.stringify({...report,contactFrames:undefined}));
 }
 fs.writeFileSync(path.join(out,'quaternion-playback-probe.json'),JSON.stringify(result,null,2)+'\n');
}
if(process.argv[1]===fileURLToPath(import.meta.url))await main();
