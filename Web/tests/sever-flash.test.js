import test from 'node:test';import assert from 'node:assert/strict';
import {presentedSeverFlash} from '../src/finisher-presentation.js';
const dead=(recipeId,parts,cost=1)=>({hp:0,finisher:{recipeId,parts,cost}}),active={started:true,activePartCost:1};
test('only actually presented active sever parts select the crimson victim flash without actor writes',()=>{
 for(const[id,part]of [['decapitation','head'],['pistol-decapitation','head'],['split-crown','crown'],['opened','upper-body']]){
  const e=dead(id,[part]),before=structuredClone(e);assert.equal(presentedSeverFlash(e,active),true);assert.deepEqual(e,before);
  for(const state of [{started:false,activePartCost:1},{started:true,activePartCost:0}])assert.equal(presentedSeverFlash(e,state),false);
  assert.equal(presentedSeverFlash({...e,hp:1},active),false);
 }
});
test('living hits, ordinary deaths/fallbacks and RunThrough retain their flash',()=>{
 for(const e of [dead('ordinary',[],0),dead('ordinary',['head']),dead('run-through',[],0),dead('opened',[],1),dead('opened',['upper-body'],0),{hp:0},{hp:NaN},null])assert.equal(presentedSeverFlash(e,active),false);
});
