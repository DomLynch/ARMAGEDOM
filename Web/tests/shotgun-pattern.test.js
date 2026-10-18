import test from 'node:test';
import assert from 'node:assert/strict';
const {traceShotgun}=await import(process.env.SHOTGUN_PATTERN_URL??new URL('../src/engine/shotgun-pattern.js',import.meta.url).href);
// Snapshot of actual Web five-argument tracePistol, not a new collision algorithm.
// Source function SHA256: ddad7c5882618940bfc230baf130774a06c822326d013cae6ddf979bb3e1bfdc. Actual runtime/native consumer remains Web.
const EPS=1e-8,point=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.z),copy=p=>({x:p.x,z:p.z}),PISTOL_RULES={range:18};
function tracePistol(origin, aim, targets, lineClear, rules = PISTOL_RULES) {
  if (!point(origin) || !point(aim) || typeof lineClear !== 'function') return null;
  const length = Math.hypot(aim.x, aim.z);
  if (length < EPS || !Number.isFinite(length)) return null;
  const direction = {x:aim.x/length, z:aim.z/length};
  const at = distance => ({x:origin.x+direction.x*distance, z:origin.z+direction.z*distance});
  if (!lineClear(origin, origin)) return null;
  let limit = rules?.range;
  if (!Number.isFinite(limit) || limit<=0) throw Error('Invalid ranged trace rules');
  if (!lineClear(origin, at(limit))) {
    let low = 0, high = limit;
    for (let i=0; i<20; i++) {
      const middle = (low+high)/2;
      if (lineClear(origin, at(middle))) low=middle; else high=middle;
    }
    limit=low;
  }
  let targetId = null, nearest = limit;
  for (const target of targets ?? []) {
    if (target.id == null || !point(target.pos) || !Number.isFinite(target.hp) || !(target.hp>0)
        || !Number.isFinite(target.radius) || target.radius<=0) continue;
    const x=target.pos.x-origin.x, z=target.pos.z-origin.z;
    const along=x*direction.x+z*direction.z, side=x*x+z*z-along*along;
    const squared=target.radius*target.radius;
    if (side>squared+EPS) continue;
    const half=Math.sqrt(Math.max(0,squared-side));
    if (along+half<0) continue;
    const distance=Math.max(0,along-half);
    if (distance<=nearest+EPS && lineClear(origin, at(distance))) {
      // Equal-distance targets retain caller order; no enemy-directed aim.
      if (targetId!==null && distance>=nearest-EPS) continue;
      nearest=distance; targetId=target.id;
    }
  }
  return {origin:copy(origin), end:at(nearest), targetId, direction};
}
const profile=Object.freeze({pelletCount:8,pelletDamage:8,range:6,spreadDegrees:12}),origin={x:0,z:0},aim={x:0,z:10};
const victim=(id,x,z,radius=.3)=>({id,pos:{x,z},hp:100,radius});
const run=(targets,clear=()=>true)=>traceShotgun(origin,aim,targets,clear,profile,tracePistol);
test('eight deterministic rays span exactly twelve degrees around normalized committed aim',()=>{
 const result=run([]);assert.equal(result.pellets.length,8);assert.deepEqual(result.hits,[]);assert.deepEqual(run([]),result);
 for(const [i,trace]of result.pellets.entries()){const angle=Math.atan2(-trace.direction.x,trace.direction.z)*180/Math.PI;assert.ok(Math.abs(angle-(-6+i*12/7))<1e-10);assert.ok(Math.abs(Math.hypot(trace.direction.x,trace.direction.z)-1)<1e-12);assert.ok(Math.abs(Math.hypot(trace.end.x,trace.end.z)-6)<1e-10);}
});
test('close fan aggregates all eight pellets once per victim, maximum64 damage',()=>{
 const result=run([victim('close',0,1,.5)]);assert.deepEqual(result.hits,[{targetId:'close',damage:64,pellets:8}]);assert.equal(result.pellets.filter(p=>p.targetId==='close').length,8);
});
test('six metre range excludes farther body and per-ray obstruction excludes targets behind walls',()=>{
 assert.deepEqual(run([victim(1,0,7,.2)]).hits,[]);
 const blocked=run([victim(1,0,4,1)],(a,b)=>b.z<=2);assert.deepEqual(blocked.hits,[]);for(const p of blocked.pellets)assert.ok(p.end.z<=2+1e-5);
 const partial=run([victim('wide',0,4,1)],(a,b)=>b.x>=0);assert.equal(partial.hits[0].pellets,4);assert.equal(partial.hits[0].damage,32);
});
test('multiple targets, mixed numeric/string IDs and nearest occlusion aggregate separately',()=>{
 const result=run([victim(1,-.22,3,.18),victim('1',.22,3,.18)]);assert.equal(result.hits.length,2);assert.ok(result.hits.some(r=>r.targetId===1));assert.ok(result.hits.some(r=>r.targetId==='1'));assert.ok(result.hits.reduce((sum,r)=>sum+r.pellets,0)<=8);for(const row of result.hits)assert.equal(row.damage,row.pellets*8);
 const nearest=run([victim('near',0,1,.5),victim('far',0,4,1)]);assert.deepEqual(nearest.hits,[{targetId:'near',damage:64,pellets:8}]);
});
test('caller inputs and targets stay separate from returned traces and injected arguments',()=>{
 const targets=[victim('a',0,1,.5)],before=structuredClone({origin,aim,targets}),result=traceShotgun(origin,aim,targets,()=>true,profile,(from,heading,rows,clear,rules)=>{assert.deepEqual(rules,{range:6});rows[0].hp=99;const trace=tracePistol(from,heading,rows,clear,rules);from.x=12;return trace;});assert.ok(result);assert.deepEqual({origin,aim,targets},before);result.pellets[0].origin.x=44;assert.equal(origin.x,0);
});
test('invalid input/profile/trace fail closed without partial hit result',()=>{
 for(const [from,heading,p]of [[null,aim,profile],[origin,{x:0,z:0},profile],[origin,{x:Infinity,z:0},profile],[origin,aim,{...profile,pelletCount:9}],[origin,aim,{...profile,extra:1}]])assert.equal(traceShotgun(from,heading,[],()=>true,p,tracePistol),null);
 for(const trace of[()=>null,()=>{throw Error('trace');},()=>({origin,end:origin,direction:aim,targetId:'unknown'})])assert.equal(traceShotgun(origin,aim,[],()=>true,profile,trace),null);
 for(const targets of[[victim(NaN,0,1)],[victim('same',0,1),victim('same',0,2)]])assert.equal(run(targets),null);
 assert.equal(traceShotgun(origin,aim,[],null,profile,tracePistol),null);
});
