import test from 'node:test';import assert from 'node:assert/strict';
import {validateEffectRegion} from '../src/engine/effect-regions.js';
const ring=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const valid=()=>({points:ring(.1,.1,.9,.9),holes:[ring(.3,.3,.4,.4)]});
test('simple normalized outer ring and strictly internal holes form an immutable bounded snapshot',()=>{
 const input=valid(),r=validateEffectRegion(input);assert.equal(r.vertices,8);assert.deepEqual(r.points,input.points);input.points[0].x=.5;assert.equal(r.points[0].x,.1);assert(Object.isFrozen(r.holes[0][0]));assert.doesNotThrow(()=>validateEffectRegion({points:valid().points.reverse(),holes:[]}));
});
test('invalid polygon topology fails before graphics allocation rather than filling exclusions',()=>{
 const cases=[c=>c.points[1].x=Infinity,c=>c.points[1].x=1.1,c=>c.points[0].extra=1,c=>c.extra=1,c=>c.points=[c.points[0],c.points[2],c.points[1],c.points[3]],c=>c.points[1]=c.points[0],c=>c.holes=[ring(.8,.8,1,1)],c=>c.holes=[ring(.1,.3,.4,.4)],c=>c.holes.push(ring(.35,.35,.5,.5)),c=>c.holes.push(ring(.31,.31,.39,.39)),c=>c.points=[{x:.1,y:.1},{x:.5,y:.1},{x:.3,y:.1},{x:.9,y:.9},{x:.1,y:.9}],c=>c.holes=Array.from({length:9},()=>ring(.3,.3,.4,.4)),c=>c.points=Array.from({length:129},(_,i)=>({x:.5+.4*Math.cos(i/129*Math.PI*2),y:.5+.4*Math.sin(i/129*Math.PI*2)}))];
 for(const mutate of cases){const c=valid();mutate(c);assert.throws(()=>validateEffectRegion(c),/effect region/);}
});
