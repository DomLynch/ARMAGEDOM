import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGeometry} from '../src/world-geometry.js';
const base=new URL('../public/world/',import.meta.url),manifest=JSON.parse(readFileSync(process.env.SOUTH7_TEST_MANIFEST||new URL('manifest.json',base))),layout=JSON.parse(readFileSync(new URL('south/layout.json',base))),geometry=createGeometry(layout),bus=layout.masks.find(m=>m.name==='South bus'),depth=geometry.point(geometry.ground(bus.foot)).depth;
function inside(p,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;}
function assertVisible(point){const root=geometry.ground(point);assert(geometry.clear(root,.55),'full hero capsule and arrival margin');for(const height of [0,1,2,3]){const p=geometry.point(root,height);assert(!inside(p,bus.points)||p.depth<depth,'hero vertical samples must not sit behind the bus depth mask');}}
test('South7 gate and return entry remain readable beside the painted bus',()=>{const forward=manifest.links.find(l=>l.from==='south'&&l.to==='area7'),reverse=manifest.links.find(l=>l.from==='area7'&&l.to==='south'),c=forward.condition;assertVisible(reverse.entry);assertVisible({x:(c.xMin+c.xMax)/2,y:(c.yMin+c.yMax)/2});assert(!(reverse.entry.x>c.xMin&&reverse.entry.x<c.xMax&&reverse.entry.y>c.yMin&&reverse.entry.y<c.yMax),'return entry cannot immediately retrigger the exit');});
