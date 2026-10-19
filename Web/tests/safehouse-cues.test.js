import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';import*as T from'three';
import{safehouseCueOpacity,createSafehouseView}from'../src/engine/safehouse-view.js';
import{validateSafehouseData}from'../src/engine/safehouse.js';import{publicAreaRegistry}from'../src/area-registry.js';
const data=()=>JSON.parse(fs.readFileSync(new URL('../public/world/area-content.json',import.meta.url))).safehouse;
test('short 3.5-second presentation pulse retains visible gold floor and pulses even selected; reduced motion stays static',()=>{
 for(const[mode,floor]of[[{},.4],[{near:true},.7],[{selected:true},.82]]){const low=safehouseCueOpacity(2.625,mode),peak=safehouseCueOpacity(.875,mode);assert(Math.abs(low-floor)<1e-10);assert.equal(peak,1);assert(Math.abs(safehouseCueOpacity(4.375,mode)-peak)<1e-10);}
 for(const time of[0,.875,2.625,100])assert.equal(safehouseCueOpacity(time,{selected:true,reduced:true}),.75);
});
test('registered visible-edge paths validate without changing gameplay anchors; malformed contours fail closed',()=>{
 const r=data(),valid=validateSafehouseData(r,publicAreaRegistry);assert.equal(valid.props.length,3);assert.equal(valid.props.find(p=>p.id==='map').outlines.length,2);assert(valid.props.find(p=>p.id==='map').outlines.every(p=>!p.closed));assert.equal(valid.props.find(p=>p.id==='comms').outlines.length,4);
 for(const mutate of[p=>p.outlines[0].points[0][0]=-1,p=>p.outlines[0].closed='yes',p=>p.outlines[0].points=[[0,0]],p=>p.outlines=Array(5).fill(p.outlines[0])]){const bad=data();mutate(bad.props[0]);assert.throws(()=>validateSafehouseData(bad,publicAreaRegistry));}
});
test('actual view builds one screen-width contour draw per prop on registered image coordinates and disposes its own resources',()=>{
 const previous=globalThis.document,label={style:{},setAttribute(){},addEventListener(){},removeEventListener(){},remove(){}},control={};globalThis.document={createElement:()=>label,body:{append(){}},getElementById:id=>id==='pistol-interact'?control:null};
 const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([-5,-2.5,0,5,-2.5,0,5,2.5,0,-5,2.5,0],3)),group=new T.Group(),world={THREE:{...T,TextureLoader:class{load(url,done){done(new T.Texture());}}},backdrop:{geometry},layout:{exposure:1},baseUrl:'http://test/',areaId:'westminster',group,safehouseData:data(),geometry:{ground:p=>({x:p.x,z:p.y})},lineClear:()=>true};
 const game={world,time:0,player:{hp:100,pos:{x:100,z:100},radius:.4}},view=createSafehouseView({world,game,camera:new T.PerspectiveCamera(),canvas:{getBoundingClientRect:()=>({width:393,height:852})},loaded:true},()=>{});
 try{view.update();const lines=group.children.filter(n=>n.isLineSegments2);assert.equal(lines.length,3);
  for(const line of lines){const prop=line.userData.prop,first=prop.outlines[0].points[0],start=line.geometry.attributes.instanceStart;assert(Math.abs(start.getX(0)-(-5+10*first[0]))<1e-6);assert(Math.abs(start.getY(0)-(2.5-5*first[1]))<1e-6);assert.equal(line.material.linewidth,2);assert.equal(line.material.worldUnits,false);assert.equal(line.material.color.getHex(T.SRGBColorSpace),0xddba70);assert.deepEqual(line.material.resolution.toArray(),[393,852]);assert(line.material.opacity>=.4&&line.material.opacity<=1);assert.equal(line.renderOrder,-98);}
  assert.equal(group.children.length,4,'one original patch plus three bounded contour draws');view.dispose();assert.equal(group.children.length,0);
 }finally{view.dispose();geometry.dispose();if(previous===undefined)delete globalThis.document;else globalThis.document=previous;}
});
