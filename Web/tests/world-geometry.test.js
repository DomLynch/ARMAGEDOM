import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

let geometry = {};
try { geometry = await import('../src/world-geometry.js'); } catch (e) { if (e.code !== 'ERR_MODULE_NOT_FOUND') throw e; }
const layout = JSON.parse(readFileSync(new URL('../public/world/westminster/layout.json', import.meta.url)));
test('calibration retains Unity metres and image registration', () => {
  assert.equal(typeof geometry.createGeometry, 'function', 'portable calibration missing');
  const g = geometry.createGeometry(layout);
  for (const [p, expected] of [[{x:.5,y:.5},{x:0,z:6}], [{x:.52,y:.78},{x:.827625465912175,z:-5.173085527961053}], [{x:.9,y:.4},{x:24.074542726163322,z:11.803758031796015}]]) {
    const ground = g.ground(p);
    assert.ok(Math.hypot(ground.x-expected.x, ground.z-expected.z)<1e-8);
    const roundtrip = g.point(ground);
    assert.ok(Math.hypot(roundtrip.x-p.x,roundtrip.y-p.y)<1e-10);
  }
});
test('circle movement cannot tunnel through a blocker and slides beside it', () => {
  assert.equal(typeof geometry.createGeometry,'function');
  const g = geometry.createGeometry({...layout,road:[{x:.05,y:.95},{x:.95,y:.95},{x:.95,y:.3},{x:.05,y:.3}],blockers:[{points:[{x:.48,y:.7},{x:.52,y:.7},{x:.52,y:.45},{x:.48,y:.45}]}]});
  const a=g.ground({x:.4,y:.6}),b=g.ground({x:.6,y:.6});
  const stopped=g.move(a,{x:b.x-a.x,z:b.z-a.z},.4);
  assert.ok(stopped.x<-.4,'crossed solid blocker');
  assert.equal(g.lineClear(a,b),false);
  const slid=g.move(a,{x:b.x-a.x,z:2},.4);
  assert.ok(slid.z>a.z+1.8,'no boundary sliding');
  assert.ok(g.clear(slid,.4));
});
test('audited street and pavement landmarks remain reachable for all three areas', () => {
  assert.equal(typeof geometry.createGeometry,'function');
  const points={westminster:[[.92,.86],[.94,.96],[.20,.78],[.90,.40]],south:[[.30,.105],[.36,.335],[.29,.37],[.195,.73],[.82,.94]],east:[[.20,.57],[.26,.53],[.43,.475],[.82,.30],[.965,.32]]};
  for(const [area,ps] of Object.entries(points)) {
    const d=JSON.parse(readFileSync(new URL(`../public/world/${area}/layout.json`,import.meta.url)));
    const g=geometry.createGeometry(d);
    for(const [x,y] of ps) assert.ok(g.clear(g.ground({x,y}),.4),`${area} pavement ${x},${y} blocked`);
  }
});
test('all 26 audited landmarks connect by actual circle movement from their entries', () => {
  const survey=JSON.parse(readFileSync(new URL('./world-landmarks.json',import.meta.url)));
  for(const [area,{entry,landmarks}] of Object.entries(survey)) {
    const d=JSON.parse(readFileSync(new URL(`../public/world/${area}/layout.json`,import.meta.url))),g=geometry.createGeometry(d);
    const n=160,cells=new Map();
    for(let y=0;y<=n;y++)for(let x=0;x<=n;x++){const p=g.ground({x:x/n,y:y/n});if(g.clear(p,.46))cells.set(y*(n+1)+x,p);}
    function nearest(q){let key,distance=Infinity;for(const [k,p] of cells){const dist=Math.hypot(p.x-q.x,p.z-q.z);if(dist<distance){distance=dist;key=k;}}return key;}
    const start=nearest(g.ground({x:entry[0],y:entry[1]})),parents=new Map([[start,null]]),queue=[start];
    for(let i=0;i<queue.length;i++){
      const k=queue[i],x=k%(n+1),y=Math.floor(k/(n+1));
      for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
        if(nx<0||nx>n||ny<0||ny>n)continue;const next=ny*(n+1)+nx;
        if(cells.has(next)&&!parents.has(next)&&g.lineClear(cells.get(k),cells.get(next))){parents.set(next,k);queue.push(next);}
      }
    }
    for(const [name,[x,y]] of landmarks){
      const goal=g.ground({x,y}),key=nearest(goal);assert.ok(g.clear(goal,.4),`${area}/${name} blocked`);assert.ok(parents.has(key),`${area}/${name} disconnected`);
      const path=[];for(let k=key;k!==null;k=parents.get(k))path.push(cells.get(k));path.reverse();
      let p=path[0];for(const target of [...path.slice(1),goal]){p=g.move(p,{x:target.x-p.x,z:target.z-p.z},.4);assert.ok(Math.hypot(p.x-target.x,p.z-target.z)<1e-6,`${area}/${name} movement stuck`);}
    }
  }
});
