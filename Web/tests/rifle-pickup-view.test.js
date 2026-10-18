import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createRifleView} from '../src/engine/rifle-view.js';
test('actual rigid Rifle drop adds one contour per original mesh without traversing added hulls',async()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../public/assets/manifest-hollow.json',import.meta.url))),description=manifest.models['player-rifle'];
 const raw=fs.readFileSync(new URL('../public/assets/'+description.url,import.meta.url)),gltf=await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');
 const original=[];gltf.scene.getObjectByName(description.pose.root).traverse(n=>{if(n.isMesh)original.push(n);});assert(original.length>0);
 const elements=new Map(['rifle-equipment','rifle-equip','rifle-pickup','rifle-state'].map(id=>[id,{style:{},addEventListener(){},removeEventListener(){}}]));
 const prior=globalThis.document;globalThis.document={getElementById:id=>elements.get(id)};globalThis.innerWidth=393;globalThis.innerHeight=852;
 const world={areaId:'east-bridge',rifleData:{name:'Bridge Rifle',modelRef:'player-rifle',source:{areaId:'east-bridge'},rules:{damage:45,capacity:8,pickupRadius:1.3}},toRender:p=>new T.Vector3(p.x,0,p.z),camera:new T.PerspectiveCamera(),lineClear:()=>true};
 const g={world,rifle:{status:'pending',dropPosition:{x:0,z:0}},player:{hp:150,pos:{x:0,z:0},hurtUntil:0,dodgeUntil:0},time:0};
 const scene=new T.Scene(),view=createRifleView({scene,world,game:g,loaded:true,actors:{rifleReady:()=>true,rifleAsset:()=>({gltf,description})}},()=>{});
 try{view.update();const hulls=[];scene.traverse(n=>{if(n.name==='Ground pickup thin contour')hulls.push(n);});assert.equal(hulls.length,original.length);for(const mesh of original){assert(mesh.material.isMeshStandardMaterial);assert.equal(mesh.children.length,0);}view.dispose();assert.equal(scene.children.length,0);}
 finally{view.dispose();globalThis.document=prior;delete globalThis.innerWidth;delete globalThis.innerHeight;}
});
