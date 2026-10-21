import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {loadGeometry} from '../../art/donor/probe.mjs';
import {prepareVictimGrounding} from '../src/finisher-grounding.js';
import {createFaceAppearanceLibrary} from '../src/face-appearance.js';
import {FACE_RECIPES} from '../src/face-recipes.js';

test('actual Hollow native121-pose grounding is exactly equivalent with pose-local bone products',async()=>{
 const manifest=JSON.parse(fs.readFileSync(new URL('../public/assets/manifest-hollow.json',import.meta.url))),description=manifest.models['hollow-scavenger'];
 const asset=await loadGeometry(fs.readFileSync(new URL('../public/assets/'+description.url,import.meta.url))),clip=asset.animations.find(c=>c.name==='Death_RunThrough'),kit=createFaceAppearanceLibrary(asset.scene);
 const cases=[];
 for(let variant=0;variant<2;variant++){
  const root=new T.Group(),model=clone(asset.scene);root.add(model);root.position.set(variant?17:0,.1,variant?-3:0);root.rotation.set(.1,.7,.02);root.scale.setScalar(variant?1.73:1.265);
  model.traverse(n=>{if(n.isMesh)n.material=Array.isArray(n.material)?n.material.map(m=>m.clone()):n.material.clone();});
  const appearance=variant?kit.apply(model,FACE_RECIPES.find(r=>r.hairPreset!=='buzz').id):null;
  const transforms=[];model.traverse(n=>transforms.push([n,n.position.toArray(),n.quaternion.toArray(),n.scale.toArray()]));
  const start=performance.now(),actual=prepareVictimGrounding({root,model,clip}),fastMs=performance.now()-start;
  const originals=[];model.traverse(n=>{if(n.isSkinnedMesh){const method=n.getVertexPosition;originals.push([n,method]);n.getVertexPosition=function(...args){return method.apply(this,args);};}});
  const nativeStart=performance.now(),expected=prepareVictimGrounding({root,model,clip}),nativeMs=performance.now()-nativeStart;for(const[n]of originals)delete n.getVertexPosition;
  for(let i=0;i<=240;i++)assert.equal(actual.lift(i/240),expected.lift(i/240),'all121sample entries and interpolated envelopes exactly equal');
  assert.equal(actual.stats().worstLocalFloor,expected.stats().worstLocalFloor);assert.equal(actual.stats().maxLocalLift,expected.stats().maxLocalLift);
  for(const[n,p,q,s]of transforms){assert.deepEqual(n.position.toArray(),p);assert.deepEqual(n.quaternion.toArray(),q);assert.deepEqual(n.scale.toArray(),s);}
  cases.push({variant,fastMs,nativeMs,samples:actual.stats().samples,vertices:actual.stats().vertices,exact:true});appearance?.dispose();
  model.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])m.dispose();});
 }
 kit.dispose();console.log('GROUNDING_EXACT_COMPARISON',JSON.stringify(cases));
});
