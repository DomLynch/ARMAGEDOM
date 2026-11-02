import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createGeometry} from '../src/world-geometry.js';
const base=new URL('../public/world/',import.meta.url),manifest=JSON.parse(readFileSync(process.env.SOUTH7_TEST_MANIFEST||new URL('manifest.json',base))),layout=JSON.parse(readFileSync(new URL('south/layout.json',base))),geometry=createGeometry(layout),bus=layout.masks.find(m=>m.name==='South bus'),depth=geometry.point(geometry.ground(bus.foot)).depth;
function inside(p,poly){let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a.y>p.y)!==(b.y>p.y)&&p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y)+a.x)hit=!hit;}return hit;}
function assertVisible(point,label){const root=geometry.ground(point);assert(geometry.clear(root,.55),label+': full hero capsule and arrival margin');for(const height of [0,1,2,3]){const p=geometry.point(root,height);assert(!inside(p,bus.points)||p.depth<depth,label+': hero vertical samples must not sit behind the bus depth mask');}}
test('South gates and arrivals remain readable beside the painted bus',()=>{
 // The South-Area7 door is gone with the grid links; the same readability rule now covers every South exit and every arrival into South.
 for(const link of manifest.links.filter(l=>l.to==='south'))assertVisible(link.entry,link.from+'>south arrival');
 for(const link of manifest.links.filter(l=>l.from==='south')){const c=link.condition;const spots=[];for(let x=c.xMin??0;x<=(c.xMax??1);x+=.005)for(let y=c.yMin??0;y<=(c.yMax??1);y+=.005)if(geometry.clear(geometry.ground({x,y}),.55))spots.push({x,y});assert(spots.length>0,'south>'+link.to+' gate has standing room');assert(spots.some(p=>{try{assertVisible(p,'gate');return true;}catch{return false;}}),'south>'+link.to+' gate is readable somewhere in its zone');}
});
