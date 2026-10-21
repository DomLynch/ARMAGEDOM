import {privateLayout} from './helpers/private-layout.js';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import * as T from 'three';
import {createWorld} from '../src/world.js';import {preparePrivateAreaContent} from '../src/engine/private-area-content.js';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
test('initial and prepared private worlds consume exact validated geometry, never independent fetched layouts',async t=>{
 const layouts=Object.fromEntries(['westminster','east','south'].map(id=>['layout.'+id,privateLayout(read('../public/world/'+id+'/layout.json'))]));
 layouts['layout.westminster'].blockers=[];const pos={x:10.2,z:-10};
 const content=preparePrivateAreaContent({areas:read('./fixtures/private-fourth/private-registry-rows.json'),manifest:read('./fixtures/private-fourth/private-manifest.json'),residents:{'fixture-westminster-annex':[{key:'fixture-test-resident',foundationRef:'hollow-scavenger',recipeRef:'human-street-scavenger',pos,patrol:[pos,{x:pos.x+.01,z:pos.z}]}]},layouts,namespace:'armagedom:private:layout-test:',textureBudgetBytes:32*1024*1024});
 const original=globalThis.fetch;globalThis.fetch=()=>assert.fail('Validated private worlds must not refetch layout geometry');t.after(()=>{globalThis.fetch=original;});
 class Loader{async loadAsync(){return new T.Texture({width:1672,height:941});}}
 const w=await createWorld({THREE:{...T,TextureLoader:Loader},scene:new T.Scene(),camera:new T.PerspectiveCamera(),baseUrl:'https://fixture.invalid/',content});t.after(()=>w.dispose());
 assert.equal(w.layout,content.layouts['layout.westminster']);assert.equal(w.geometry.clear(pos,.4),true);
 const next=await w.prepareArea('fixture-westminster-annex');assert.equal(next.layout,content.layouts['layout.westminster']);assert.equal(next.geometry.clear(pos,.4),true);assert.equal(next.textureBudgetBytes,content.textureBudgetBytes);
});
