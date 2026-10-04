import test from 'node:test';
import assert from 'node:assert/strict';
const module = await import('../src/client.mjs').catch(() => ({}));
const payload = { character: 'vagrant', area: 'westminster', equipment: [] };
// These test SDK-boundary safety, not database policies.
function sdk() {
  let callback; const writes = []; let respond = async () => ({ data: [], error: null });
  const client = { auth: {
    onAuthStateChange(fn) { callback = fn; return { data: { subscription: { unsubscribe() {} } } }; },
    async getUser() { return { data: { user: { id: 'A', is_anonymous: false } }, error: null }; },
    async signOut() { return { error: null }; },
    async signInWithOtp() { return { data: {}, error: null }; },
    async verifyOtp() { return { data: {}, error: null }; },
  }, from(table) {
    const query = { eq() { return query; }, select() { return query; },
      update(row) { writes.push({ table, row }); return query; },
      insert(row) { writes.push({ table, row }); return query; },
      upsert(row) { writes.push({ table, row }); return query; },
      then(resolve, reject) { return respond().then(resolve, reject); } };
    return query;
  } };
  return { client, writes, change(user) { callback('SIGNED_IN', { user }); },
    response(fn) { respond = fn; } };
}
test('missing config leaves account features disabled without throwing', async () => {
  assert.equal(typeof module.createPersistence, 'function');
  assert.deepEqual(await module.createPersistence().loadCharacter(), { status: 'disabled' });
});
test('no session cannot write a character', async () => {
  assert.equal(typeof module.createPersistence, 'function');
  const s = sdk(); s.client.auth.getUser = async () => ({data:{user:null},error:null});
  const api = module.createPersistence(s.client);
  assert.equal((await api.saveCharacter(0,payload)).status,'signed_out');
  assert.equal(s.writes.length,0);
});
test('arbitrary reward fields and invalid revisions never reach the SDK', async () => {
  assert.equal(typeof module.createPersistence, 'function');
  const s=sdk(),api=module.createPersistence(s.client); await api.refreshAccount();
  assert.equal((await api.saveCharacter(0,{...payload,currency:999})).status,'validation');
  assert.equal((await api.saveCharacter(-1,payload)).status,'validation');
  assert.equal(s.writes.length,0);
});
test('zero-row update is conflict and does not destroy local draft', async () => {
  assert.equal(typeof module.createPersistence, 'function');
  const s=sdk(),api=module.createPersistence(s.client); await api.refreshAccount();
  assert.equal((await api.saveCharacter(1,payload)).status,'conflict_or_unavailable');
  assert.deepEqual(api.state().draft,payload);
  assert.equal(s.writes[0].row.revision,undefined);
});
test('account switch discards draft and pending old-account response', async () => {
  assert.equal(typeof module.createPersistence, 'function');
  const s=sdk(),api=module.createPersistence(s.client); await api.refreshAccount();
  let complete; s.response(()=>new Promise(resolve=>complete=resolve));
  const pending=api.saveCharacter(0,payload); await new Promise(resolve=>setImmediate(resolve));
  s.change({id:'B',is_anonymous:false});
  complete({data:[{user_id:'A',revision:1,schema_version:1,payload}],error:null});
  assert.equal((await pending).status,'account_changed');
  assert.equal(api.state().draft,null); assert.equal(api.state().save,null);
  assert.equal(api.state().userId,'B');
});
test('failed logout keeps writes suspended and account state empty', async () => {
  assert.equal(typeof module.createPersistence, 'function');
  const s=sdk(),api=module.createPersistence(s.client); await api.refreshAccount();
  s.client.auth.signOut=async()=>({error:{message:'offline'}});
  assert.equal((await api.signOut()).status,'network');
  assert.equal((await api.saveCharacter(0,payload)).status,'signed_out');
});
test('unique first-save race becomes conflict and network failure retains draft', async()=>{
  assert.equal(typeof module.createPersistence,'function');
  const s=sdk(),api=module.createPersistence(s.client);await api.refreshAccount();
  s.response(async()=>({data:null,error:{code:'23505'}}));
  assert.equal((await api.saveCharacter(0,payload)).status,'conflict_or_unavailable');
  s.response(async()=>{throw new Error('offline');});
  assert.equal((await api.saveCharacter(0,payload)).status,'network');
  assert.deepEqual(api.state().draft,payload);
});
test('save profile handles existing-row conflict without updating identity',async()=>{
  const s=sdk(),api=module.createPersistence(s.client);await api.refreshAccount();
  let calls=0;s.response(async()=>++calls===1?{data:null,error:{code:'23505'}}:
    {data:[{user_id:'A',display_name:'Dom'}],error:null});
  const result=await api.saveProfile(' Dom ');
  assert.equal(result.status,'ok'); assert.equal(result.data[0].display_name,'Dom');
  assert.deepEqual(s.writes.at(-1).row,{display_name:'Dom'});
});
test('pending OTP verify cannot restore account after logout',async()=>{
  const s=sdk(),api=module.createPersistence(s.client);await api.refreshAccount();
  let complete;s.client.auth.verifyOtp=()=>new Promise(resolve=>complete=resolve);
  const pending=api.verifyOtp('test@example.com','123456');
  await api.signOut();complete({data:{},error:null});
  assert.equal((await pending).status,'account_changed');assert.equal(api.state().userId,null);
});
test('loaded future schema never becomes current save',async()=>{
  const s=sdk(),api=module.createPersistence(s.client);await api.refreshAccount();
  s.response(async()=>({data:[{user_id:'A',schema_version:2}],error:null}));
  assert.equal((await api.loadCharacter()).status,'unsupported_schema');assert.equal(api.state().save,null);
});
test('zero-row profile update cannot report success',async()=>{
  const s=sdk(),api=module.createPersistence(s.client);await api.refreshAccount();
  let calls=0;s.response(async()=>++calls===1?{data:null,error:{code:'23505'}}:{data:[],error:null});
  assert.equal((await api.saveProfile('Dom')).status,'conflict_or_unavailable');
});
test('anonymous account stays guest and auth events cannot undo failed logout',async()=>{
  const s=sdk(),api=module.createPersistence(s.client);await api.refreshAccount();
  s.change({id:'A',is_anonymous:true});assert.equal(api.state().userId,null);
  s.change({id:'A',is_anonymous:false});
  await api.signOut();s.change({id:'A',is_anonymous:false});
  assert.equal(api.state().userId,null);
});
test('successful save clears draft and returns revision without mutable state alias',async()=>{
  const s=sdk(),api=module.createPersistence(s.client);await api.refreshAccount();
  s.response(async()=>({data:[{user_id:'A',schema_version:1,revision:1,payload}],error:null}));
  const result=await api.saveCharacter(0,payload);
  assert.equal(result.status,'ok');assert.equal(result.data.revision,1);assert.equal(api.state().draft,null);
  const copy=api.state();copy.save.revision=999;assert.equal(api.state().save.revision,1);
});
test('old refresh rejection preserves the new account and its unsaved draft',async()=>{
  const s=sdk(),api=module.createPersistence(s.client);await api.refreshAccount();
  let reject;s.client.auth.getUser=()=>new Promise((_,fail)=>reject=fail);
  const pending=api.refreshAccount();
  s.change({id:'B',is_anonymous:false});
  await api.saveCharacter(0,payload);
  reject(new Error('old account request failed'));
  assert.equal((await pending).status,'account_changed');
  assert.deepEqual(api.state(),{userId:'B',draft:payload,save:null});
});
test('current account refresh rejection still clears account state',async()=>{
  const s=sdk(),api=module.createPersistence(s.client);await api.refreshAccount();
  await api.saveCharacter(0,payload);
  s.client.auth.getUser=async()=>{throw new Error('offline');};
  assert.equal((await api.refreshAccount()).status,'network');
  assert.deepEqual(api.state(),{userId:null,draft:null,save:null});
});
