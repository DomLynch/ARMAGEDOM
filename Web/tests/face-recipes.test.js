import test from 'node:test';import assert from 'node:assert/strict';
import {FACE_APPEARANCE_VERSION,FACE_RECIPES,FACE_HEADS,FACE_HAIRS,FACE_SKINS,ORIGINAL_FACE_ID,faceRecipeFor} from '../src/face-recipes.js';
test('50 unique frozen recipes cover all reusable head/hair/complexion combinations',()=>{
  assert.equal(FACE_RECIPES.length,50);assert.equal(new Set(FACE_RECIPES.map(r=>r.id)).size,50);assert.equal(FACE_APPEARANCE_VERSION,'armagedom-face-v1');
  const combinations=new Set(FACE_RECIPES.map(r=>[r.headPreset,r.hairPreset,r.skinPreset].join('/')));
  for(const head of FACE_HEADS)for(const hair of FACE_HAIRS)for(const skin of FACE_SKINS)assert(combinations.has(`${head.id}/${hair}/${skin.id}`));
  assert(Object.isFrozen(FACE_RECIPES));for(const r of FACE_RECIPES){assert(Object.isFrozen(r));assert.equal(faceRecipeFor(r.id),r);}
});
test('authored neighbours differ in at least two visible ingredients; weathering varies independently of hair',()=>{
  for(let i=0;i<FACE_RECIPES.length-1;i++){const a=FACE_RECIPES[i],b=FACE_RECIPES[i+1];assert(['headPreset','hairPreset','skinPreset'].filter(k=>a[k]!==b[k]).length>=2);}
  for(const hair of FACE_HAIRS)assert.equal(new Set(FACE_RECIPES.filter(r=>r.hairPreset===hair).map(r=>r.weatheringPreset)).size,5);
});
test('explicit original appearance fallback and malformed IDs cannot silently allocate a variant',()=>{
  const fallback=faceRecipeFor(ORIGINAL_FACE_ID);assert(Object.isFrozen(fallback));assert.equal(fallback.headPreset,'original');assert(!FACE_RECIPES.includes(fallback));
  for(const id of [undefined,null,'','face-unknown',0,{}])assert.throws(()=>faceRecipeFor(id),/Unknown face recipe/);
  assert.throws(()=>{FACE_RECIPES[0].skinPreset='invalid'},TypeError);assert.throws(()=>FACE_SKINS[0].photo.push(0),TypeError);
});
