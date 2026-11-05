import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createRifleView} from '../src/engine/rifle-view.js';
// The baked rifle carries embedded JPEG textures, which GLTFLoader cannot decode in Node (no image decoder).
// The test only checks meshes and material types, so drop the texture references from a copy of the GLB first.
function withoutTextures(buf){
 const dv=new DataView(buf),jl=dv.getUint32(12,true),json=JSON.parse(new TextDecoder().decode(new Uint8Array(buf,20,jl)));
 delete json.images;delete json.textures;delete json.samplers;
 for(const m of json.materials||[]){const p=m.pbrMetallicRoughness;if(p){delete p.baseColorTexture;delete p.metallicRoughnessTexture;}delete m.normalTexture;delete m.occlusionTexture;delete m.emissiveTexture;}
 let js=new TextEncoder().encode(JSON.stringify(json));const pad=(4-js.length%4)%4;if(pad){const p=new Uint8Array(js.length+pad).fill(32);p.set(js);js=p;}
 const rest=new Uint8Array(buf,20+jl),out=new Uint8Array(20+js.length+rest.length),o=new DataView(out.buffer);
 out.set(new Uint8Array(buf,0,12));o.setUint32(8,out.length,true);o.setUint32(12,js.length,true);o.setUint32(16,0x4E4F534A,true);out.set(js,20);out.set(rest,20+js.length);return out.buffer;
}
test('actual rigid Rifle drop adds one contour per original mesh without traversing added hulls',async()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../public/assets/manifest-hollow.json',import.meta.url))),description=manifest.models['player-rifle'];
 const raw=fs.readFileSync(new URL('../public/assets/'+description.url,import.meta.url)),gltf=await new GLTFLoader().parseAsync(withoutTextures(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength)),'');
 const original=[];gltf.scene.getObjectByName(description.pose.root).traverse(n=>{if(n.isMesh)original.push(n);});assert(original.length>0);
 const elements=new Map(['rifle-equipment','rifle-equip','rifle-pickup','rifle-state'].map(id=>[id,{style:{},addEventListener(){},removeEventListener(){}}]));
 const prior=globalThis.document;globalThis.document={getElementById:id=>elements.get(id)};globalThis.innerWidth=393;globalThis.innerHeight=852;
 const world={areaId:'east-bridge',rifleData:{name:'Bridge Rifle',modelRef:'player-rifle',source:{areaId:'east-bridge'},rules:{damage:45,capacity:8,pickupRadius:1.3}},toRender:p=>new T.Vector3(p.x,0,p.z),camera:new T.PerspectiveCamera(),lineClear:()=>true};
 const g={world,rifle:{status:'pending',dropPosition:{x:0,z:0}},player:{hp:150,pos:{x:0,z:0},hurtUntil:0,dodgeUntil:0},time:0};
 const scene=new T.Scene(),view=createRifleView({scene,world,game:g,loaded:true,actors:{rifleReady:()=>true,rifleAsset:()=>({gltf,description})}},()=>{});
 try{view.update();const hulls=[];scene.traverse(n=>{if(n.name==='Ground pickup thin contour')hulls.push(n);});assert.equal(hulls.length,original.length);for(const mesh of original){assert(mesh.material.isMeshStandardMaterial);assert.equal(mesh.children.length,0);}view.dispose();assert.equal(scene.children.length,0);}
 finally{view.dispose();globalThis.document=prior;delete globalThis.innerWidth;delete globalThis.innerHeight;}
});
