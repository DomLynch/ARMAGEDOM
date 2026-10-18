import fs from 'node:fs';
import {weaponAction} from './scripts/qa/weapon-action-guard.mjs';
import {readState} from './read-state.mjs';
const earned=JSON.parse(fs.readFileSync(new URL('./fixtures/earned.json',import.meta.url),'utf8'));
// Static fixture only. Comment and string lookalikes are not browser calls.
const note="page.click('#unchecked')";
export async function run(page){
 return weaponAction({adapter:'rifle',read:()=>readState(page),
  press:()=>page.mouse.down(),release:()=>page.mouse.up(),
  waitStart:()=>page.waitForFunction(()=>!!globalThis.__qa?.game?.rifleAction),
  waitResult:()=>page.waitForFunction(()=>!!globalThis.__qa?.game?.rifle)});
}
