import test from 'node:test';import assert from 'node:assert/strict';import {finisherPresentationAge} from '../src/actors.js';
import {finisherVictimPoseAge} from '../src/finisher-presentation.js';
test('victim pose advances at .75 for first .2s then normal speed; rest/off use original age',()=>{
 assert.equal(finisherVictimPoseAge(0),0);assert.equal(finisherVictimPoseAge(.1),.07500000000000001);assert.equal(finisherVictimPoseAge(.2),.15000000000000002);
 assert(Math.abs(finisherVictimPoseAge(.4)-finisherVictimPoseAge(.3)-.1)<1e-12);
 for(const options of [{enabled:false},{restored:true}])for(const age of [0,.1,.2,.4,6])assert.equal(finisherVictimPoseAge(age,options),age);
});
test('low-FPS Crown receipt age survives parked reconstruction without rewinding lifetime',()=>{const e={response:{start:7.98333333333331},finisherPresentationAge:5.6831};const age=finisherPresentationAge(e,9.966666666666741);assert.equal(age,5.6831);assert(Math.abs((9.966666666666741-e.response.start)-1.983333333333431)<1e-12);e.response.start+=10;assert.equal(finisherPresentationAge(e,19.96666666666674),5.6831);e.finisherPresentationAge=7.2497;assert(finisherPresentationAge(e,19.96666666666674)>=6);});
test('fresh and malformed cosmetic age use the actual source clock without actor writes',()=>{for(const shown of [undefined,NaN,-1]){const e={response:{start:2},finisherPresentationAge:shown},before={...e};assert.equal(finisherPresentationAge(e,2.5),.5);assert.deepEqual(e,before);}assert.equal(finisherPresentationAge({response:{start:1},finisherPresentationAge:.5},2),1);});
