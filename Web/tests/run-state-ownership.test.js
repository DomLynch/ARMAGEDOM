import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {createGame} from '../src/combat.js';import {createVestState} from '../src/vest.js';
import * as owned from '../src/engine/run-state.js';import * as publicDoor from '../src/engine/server.js';import * as legacy from '../src/pistol-save.js';
test('renderer-free public door and legacy path delegate to one engine implementation',()=>{
 assert.equal(typeof globalThis.document,'undefined');assert.equal(typeof globalThis.window,'undefined');for(const [name,value]of Object.entries(owned)){assert.equal(publicDoor[name],value);assert.equal(legacy[name],value);}
});
test('accepted legacy run2 serialization stays byte-identical while one engine implementation admits stamped run3',()=>{
 const previous=readFileSync(new URL('./fixtures/run-state-098.txt',import.meta.url),'utf8');
 const body=previous.match(/^export function encodeRun\(g\)\{(.+)\}$/m)[1],oldEncode=Function('encodePistol','createVestState','g',body);
 const world={areaId:'westminster',spawn:{x:0,z:-6},layout:{characterScale:1.265},lineClear:()=>true};
 for(const hp of [150,73,0])for(const equipped of [false,true]){
  const g=createGame(world,{pilot:'donor-knife',pistol:true,supplies:true,vest:true});g.player.hp=hp;g.pistol={...g.pistol,collected:true,equipped,magazine:4,reserve:2};
  const expected=oldEncode(owned.encodePistol,createVestState,g);assert.equal(owned.encodeRun(g),expected);assert(owned.restoreRun(g,expected,null));
 }
 const facade=readFileSync(new URL('../src/pistol-save.js',import.meta.url),'utf8');assert.equal(/\bfunction\b/.test(facade),false);assert.match(facade,/from '\.\/engine\/server\.js'/);
 assert.deepEqual(JSON.parse(readFileSync(new URL('../tools/engine-boundary-exceptions.json',import.meta.url))),[]);
});
