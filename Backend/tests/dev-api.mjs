// Dedicated dev only; uses two existing disposable email/password accounts, never admin keys.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { createPersistence } from '../src/client.mjs';
const env = process.env;
const required = ['ARMAGEDOM_TEST_DEV_URL','ARMAGEDOM_TEST_PUBLISHABLE_KEY',
  'ARMAGEDOM_TEST_A_EMAIL','ARMAGEDOM_TEST_A_PASSWORD','ARMAGEDOM_TEST_B_EMAIL','ARMAGEDOM_TEST_B_PASSWORD'];
if (env.ARMAGEDOM_TEST_DEDICATED_DEV !== '1' || required.some(key => !env[key])) {
  console.error('NOT RUN: dedicated ARMAGEDOM dev URL/key and two disposable accounts required.');
  process.exit(2);
}
const url = new URL(env.ARMAGEDOM_TEST_DEV_URL);
const local = ['localhost','127.0.0.1','[::1]'].includes(url.hostname);
const ref = env.ARMAGEDOM_TEST_DEV_PROJECT_REF;
if ((!local && (!ref || url.hostname !== `${ref}.supabase.co` || url.protocol !== 'https:')) ||
    ['rxbewmzmovelckzoosss','ymsinsaswwqeccajhfjf'].includes(ref) ||
    /(?:rxbewmzmovelckzoosss|ymsinsaswwqeccajhfjf)/.test(url.hostname)) {
  throw new Error('Refused: endpoint must be explicitly designated ARMAGEDOM dev; donor projects forbidden.');
}
const key = env.ARMAGEDOM_TEST_PUBLISHABLE_KEY;
if (!key.startsWith('sb_publishable_')) {
  let role; try { role = JSON.parse(Buffer.from(key.split('.')[1], 'base64url')).role; } catch {}
  if (role !== 'anon') throw new Error('Only publishable or legacy anon key allowed.');
}
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const a = createClient(url.href,key,options), b = createClient(url.href,key,options), anon = createClient(url.href,key,options);
let count = 0;
const check = (condition,message) => { assert.ok(condition,message); count++; };
try {
  const ar = await a.auth.signInWithPassword({email:env.ARMAGEDOM_TEST_A_EMAIL,password:env.ARMAGEDOM_TEST_A_PASSWORD});
  const br = await b.auth.signInWithPassword({email:env.ARMAGEDOM_TEST_B_EMAIL,password:env.ARMAGEDOM_TEST_B_PASSWORD});
  check(!ar.error && !br.error,'Two dev accounts must authenticate');
  check(!ar.data.user.is_anonymous && !br.data.user.is_anonymous && ar.data.user.id !== br.data.user.id,'Distinct permanent users required');
  const aid=ar.data.user.id,bid=br.data.user.id;
  for (const c of [a,b]) {
    const {data,error}=await c.from('armagedom_character_saves').select('*');
    check(!error && data.length === 0,'Use fresh disposable accounts without existing saves');
  }
  const payload={character:'vagrant',area:'westminster',equipment:[]};
  const initial=await Promise.all([1,2].map(()=>a.from('armagedom_character_saves').insert({user_id:aid,payload}).select('*')));
  check(initial.filter(r=>!r.error).length===1 && initial.filter(r=>r.error?.code==='23505').length===1,'Initial insert race must have one winner');
  const bp=createPersistence(b);await bp.refreshAccount();
  check((await bp.saveCharacter(0,payload)).status==='ok','B can create its own save through SDK seam');
  const crossRead=await a.from('armagedom_character_saves').select('*').eq('user_id',bid);
  check(!crossRead.error && crossRead.data.length===0,'A cannot read B save');
  const crossUpdate=await a.from('armagedom_character_saves').update({payload}).eq('user_id',bid).select('*');
  check(!crossUpdate.error && crossUpdate.data.length===0,'A cannot write B save');
  check(!!(await a.from('armagedom_profiles').insert({user_id:bid,display_name:'spoof'})).error,'A cannot insert B profile');
  const ap=createPersistence(a);await ap.refreshAccount();
  check((await ap.saveProfile('A')).status==='ok' && (await ap.saveProfile('A renamed')).status==='ok','A can create/update profile without identity update grants');
  check((await bp.getProfile()).data.length===0,'B cannot read A profile');
  const race=await Promise.all([1,2].map(()=>a.from('armagedom_character_saves').update({payload}).eq('user_id',aid).eq('revision',1).select('*')));
  check(race.every(r=>!r.error) && race.filter(r=>r.data.length===1 && Number(r.data[0].revision)===2).length===1 && race.filter(r=>r.data.length===0).length===1,'Conditional updates must have exactly one winner');
  check((await ap.saveCharacter(1,payload)).status==='conflict_or_unavailable','SDK must surface stale save');
  check(!!(await a.from('armagedom_character_saves').update({revision:999}).eq('user_id',aid)).error,'Direct revision update denied');
  check(!!(await a.from('armagedom_character_saves').update({payload:{...payload,currency:999}}).eq('user_id',aid)).error,'Server rejects reward fields');
  for (const table of ['armagedom_profiles','armagedom_character_saves']) {
    check(!!(await anon.from(table).select('*')).error,'Anon read denied');
    check(!!(await a.from(table).delete().eq('user_id',aid)).error,'Client delete denied');
  }
  check((await ap.signOut()).status==='ok' && (await ap.saveCharacter(2,payload)).status==='signed_out','Logout prevents writes');
  ap.dispose();bp.dispose();
  console.log(`PASS: ${count} dedicated dev Auth/REST/SDK checks. Disposable account rows retained; reset dev fixtures before rerun.`);
} catch {
  // Do not print SDK objects, URLs, passwords or bearer credentials on failures.
  console.error(`FAIL: dedicated dev API check ${count+1}; credentials and server response suppressed.`);
  process.exitCode=1;
} finally { await Promise.allSettled([a.auth.signOut({scope:'local'}),b.auth.signOut({scope:'local'})]); }
