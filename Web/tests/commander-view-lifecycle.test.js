import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import{COMMANDER_VIEW}from'../src/engine/commander/view-data.js';
const source=fs.readFileSync(new URL('../src/engine/commander/view.js',import.meta.url),'utf8').replace(/^import .*;$/gm,'').replace('export async function createCommanderView','async function createCommanderView');
function fixture(failAt){
 const disposed={},created=[],bump=name=>disposed[name]=(disposed[name]??0)+1,make=name=>{if(failAt===name)throw Error('injected '+name);created.push(name);};
 const library={dispose(){bump('library');}},world={dispose(){bump('world');}};
 class Scene{add(){}}
 class Light{position={set(){}}}
 class Renderer{constructor(){make('renderer');}setPixelRatio(){}setAnimationLoop(){}dispose(){bump('renderer');}}
 let geometries=0;
 class Geometry{constructor(){this.name=++geometries===1?'selectionGeometry':'objectiveGeometry';make(this.name);}dispose(){bump(this.name);}}
 class Material{constructor(){make('material');}dispose(){bump('material');}}
 class Mesh{constructor(){make('mesh');}rotation={};removeFromParent(){bump('objectiveDetach');}}
 const T={Scene,PerspectiveCamera:class{},HemisphereLight:Light,DirectionalLight:Light,WebGLRenderer:Renderer,RingGeometry:Geometry,MeshBasicMaterial:Material,Mesh,Raycaster:class{constructor(){make('ray');}},Vector3:class{constructor(){make('vector');}},Matrix4:class{constructor(){make('matrix');}}};
 const context={T,createWorld:async()=>world,loadActors:async()=>library,applyAreaLighting(){make('lighting');},createActors(){make('actors');return{dispose(){bump('actors');library.dispose();if(failAt==='cleanup')throw Error('injected cleanup');}};},createDroneLaserBolts(){make('lasers');return{dispose(){bump('lasers');}};},COMMANDER_RULES:{captureRadius:2.8},COMMANDER_VIEW,devicePixelRatio:1,console:{error(){bump('cleanupError');}}};
 const create=vm.runInNewContext(source+'\ncreateCommanderView',context);return{create,disposed,created};
}
for(const failAt of ['renderer','lighting','actors','lasers','selectionGeometry','objectiveGeometry','material','mesh','ray','vector','matrix'])test('Commander construction failure releases acquired owners: '+failAt,async()=>{
 const f=fixture(failAt);await assert.rejects(f.create({canvas:{},baseUrl:'test/'}),new RegExp('injected '+failAt));assert.equal(f.disposed.world,1);assert.equal(f.disposed.library,1);if(f.created.includes('renderer'))assert.equal(f.disposed.renderer,1);if(f.created.includes('actors'))assert.equal(f.disposed.actors,1);for(const name of ['lasers','selectionGeometry','objectiveGeometry','material'])if(f.created.includes(name))assert.equal(f.disposed[name],1);
});
test('Commander normal disposal owns library through actors exactly once',async()=>{const f=fixture(),view=await f.create({canvas:{},baseUrl:'test/'});view.dispose();view.dispose();for(const name of ['world','library','renderer','actors','lasers','selectionGeometry','objectiveGeometry','material'])assert.equal(f.disposed[name],1,name);});
test('Commander cleanup continues after one owner throws',async()=>{const f=fixture('cleanup'),view=await f.create({canvas:{},baseUrl:'test/'});view.dispose();assert.equal(f.disposed.cleanupError,1);assert.equal(f.disposed.library,1);assert.equal(f.disposed.world,1);assert.equal(f.disposed.renderer,1);});
