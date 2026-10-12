import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {publicAreaRegistry} from '../src/area-registry.js';import {validateAreaWater} from '../src/engine/area-water.js';import {insidePolygon,segmentsIntersect} from '../src/world-geometry.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url))),data=read('../public/world/area-content.json');
test('public data enables all five confidently visible river areas with batched separate masks and final interior alpha20–29%',()=>{
 const water=validateAreaWater(data.water,publicAreaRegistry);assert.deepEqual(Object.keys(water),['westminster','east','south','east-bridge','elephant-and-castle']);assert.equal(water.lambeth,undefined);
 for(const config of Object.values(water)){assert(config.enabled);assert.equal(config.profile.opacityMax,.25);assert.equal(config.profile.flow.speedPixelsPerSecond,2);assert(config.regions.length>=1&&config.regions.length<=4);assert(config.regions.reduce((n,r)=>n+r.vertices,0)<=128);assert.equal(config.profile.budget.maxDrawCalls,1);assert.equal(config.profile.budget.maxNewTextures,0);assert(Object.isFrozen(config.regions));}
});
test('public enable still rejects old private marker, extra textures, and opacity above renewed finite bound',()=>{
 const copy=()=>structuredClone(data.water),ref=data.water.areas.westminster;let d=copy();d.profiles[ref].activationScope='private-approved-pilot-only';assert.throws(()=>validateAreaWater(d,publicAreaRegistry),/water/);assert.equal(validateAreaWater(d,publicAreaRegistry,{privatePilot:true}).westminster.enabled,true);
 for(const mutate of [d=>d.profiles[ref].activationScope='public',d=>d.profiles[ref].budget.maxNewTextures=1,d=>d.profiles[ref].flow.speedPixelsPerSecond=Infinity,d=>d.profiles[ref].opacityMax=.301]){d=copy();mutate(d);assert.throws(()=>validateAreaWater(d,publicAreaRegistry),/water/);}
});
test('every authored river component excludes current registered road and painted prop blocker polygons',()=>{
 const water=validateAreaWater(data.water,publicAreaRegistry);
 for(const [area,config]of Object.entries(water)){const layout=read(`../public/world/${area}/layout.json`);
  for(const region of config.regions)for(const shape of [layout.road,...layout.blockers.map(b=>b.points)]){const poly=shape.map(p=>({x:p.x,z:p.y})),outer=region.points.map(p=>({x:p.x,z:p.y})),holes=region.holes.map(h=>h.map(p=>({x:p.x,z:p.y})));const inWater=p=>insidePolygon(p,outer)&&!holes.some(h=>insidePolygon(p,h));assert(!poly.some(inWater),`${area} blocker inside water`);assert(!outer.some(p=>insidePolygon(p,poly)),`${area} river inside blocker`);for(const ring of [outer,...holes])for(let i=0;i<ring.length;i++)for(let j=0;j<poly.length;j++)assert(!segmentsIntersect(ring[i],ring[(i+1)%ring.length],poly[j],poly[(j+1)%poly.length]),`${area} boundary intersects blocker`);}
 }
});

test('Area4 water mask excludes confirmed black timber pile faces rather than painting over the original graphics',()=>{
 const config=validateAreaWater(data.water,publicAreaRegistry)['east-bridge'],region=config.regions[0],outer=region.points.map(p=>({x:p.x,z:p.y})),holes=region.holes.map(h=>h.map(p=>({x:p.x,z:p.y})));
 for(const p of [{x:.097,z:.35},{x:.122,z:.34},{x:.153,z:.35}]){assert(insidePolygon(p,outer));assert(holes.some(h=>insidePolygon(p,h)));}
 assert.equal(region.vertices,59);
});

test('Area4 excludes the entire connected foreground timber envelope, including leaning posts and cross-bracing',()=>{
 const region=validateAreaWater(data.water,publicAreaRegistry)['east-bridge'].regions[0],outer=region.points.map(p=>({x:p.x,z:p.y}));
 for(const p of [{x:.073,z:.435},{x:.073,z:.48},{x:.098,z:.47},{x:.115,z:.49},{x:.035,z:.46},{x:.02,z:.48}])assert(!insidePolygon(p,outer));
 assert(insidePolygon({x:.105,z:.408},outer));
});

test('connected central timber exclusion includes cross-bracing and upper pile tips, preserving previously repaired faces',()=>{
 const region=validateAreaWater(data.water,publicAreaRegistry)['east-bridge'].regions[0],holes=region.holes.map(h=>h.map(p=>({x:p.x,z:p.y})));assert.equal(holes.length,1);
 for(const p of [{x:.107,z:.338},{x:.142,z:.338},{x:.1585,z:.3}])assert(holes.some(h=>insidePolygon(p,h)));
});

test('Area4 entire right-edge timber dock is excluded conservatively, leaving uncertain gaps static',()=>{
 const region=validateAreaWater(data.water,publicAreaRegistry)['east-bridge'].regions[0],outer=region.points.map(p=>({x:p.x,z:p.y}));
 for(const p of [{x:.265,z:.36},{x:.275,z:.37},{x:.285,z:.34},{x:.29,z:.38}])assert(!insidePolygon(p,outer));
 assert(insidePolygon({x:.22,z:.33},outer));
});

test('Area5 connected right timber pier is outside water while left open water remains active',()=>{
 const r=validateAreaWater(data.water,publicAreaRegistry)['elephant-and-castle'].regions[0],outer=r.points.map(p=>({x:p.x,z:p.y})),holes=r.holes.map(h=>h.map(p=>({x:p.x,z:p.y})));
 for(const p of [{x:.23,z:.34},{x:.252,z:.366},{x:.28,z:.4},{x:.21,z:.32}])assert(!insidePolygon(p,outer));
 assert(insidePolygon({x:.15,z:.36},outer));assert(!holes.some(h=>insidePolygon({x:.15,z:.36},h)));
});

test('Area5 left-bank notch protects the entire connected timber envelope and keeps upper boat exclusions',()=>{
 const r=validateAreaWater(data.water,publicAreaRegistry)['elephant-and-castle'].regions[0],o=r.points.map(p=>({x:p.x,z:p.y})),hs=r.holes.map(h=>h.map(p=>({x:p.x,z:p.y})));
 for(const p of [{x:.04,z:.34},{x:.06,z:.37},{x:.08,z:.4},{x:.02,z:.31}])assert(!insidePolygon(p,o));
 assert(insidePolygon({x:.15,z:.36},o));assert(!insidePolygon({x:.15,z:.27},o));
});
