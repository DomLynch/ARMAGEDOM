import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import * as owned from '../src/engine/run-state.js';import * as publicDoor from '../src/engine/server.js';import * as legacy from '../src/pistol-save.js';
test('renderer-free public door and legacy path delegate to one engine implementation',()=>{
 assert.equal(typeof globalThis.document,'undefined');assert.equal(typeof globalThis.window,'undefined');for(const [name,value]of Object.entries(owned)){assert.equal(publicDoor[name],value);assert.equal(legacy[name],value);}
});
test('accepted save-state function bodies and constants move without semantic edits',()=>{
 const previous=readFileSync(new URL('./fixtures/run-state-098.txt',import.meta.url),'utf8'),current=readFileSync(new URL('../src/engine/run-state.js',import.meta.url),'utf8');assert.equal(current.replaceAll("from '../","from './"),previous);
 const facade=readFileSync(new URL('../src/pistol-save.js',import.meta.url),'utf8');assert.equal(/\bfunction\b/.test(facade),false);assert.match(facade,/from '\.\/engine\/server\.js'/);
 assert.deepEqual(JSON.parse(readFileSync(new URL('../tools/engine-boundary-exceptions.json',import.meta.url))),[]);
});
