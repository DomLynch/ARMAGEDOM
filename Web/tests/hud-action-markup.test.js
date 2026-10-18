import fs from'node:fs';import test from'node:test';import assert from'node:assert/strict';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
test('real action markup supplies the label and status nodes used by HUD updates',()=>{
 for(const id of['slash','stab','heavy','dodge','guard']){const button=[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button\s*>/g)].find(m=>new RegExp('\\bid="'+id+'"').test(m[1]));assert(button,'action '+id);assert.match(button[2],/<span\b[^>]*>[\s\S]*?<\/span>/,id+' label');assert.match(button[2],/<small\b[^>]*>[\s\S]*?<\/small>/,id+' status');}
});
