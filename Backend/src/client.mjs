// Inject a dedicated ARMAGEDOM supabase-js client. No SDK dependency or credentials here.
const validId = value => typeof value === 'string' && /^[a-z0-9_-]{1,64}$/.test(value);
export function validPayload(value) {
  return value && Object.getPrototypeOf(value) === Object.prototype &&
    Object.keys(value).length === 3 && validId(value.character) &&
    ['westminster', 'east', 'south'].includes(value.area) &&
    Array.isArray(value.equipment) && value.equipment.length <= 16 &&
    value.equipment.every(validId) &&
    new TextEncoder().encode(JSON.stringify(value)).length <= 32768;
}
export function createPersistence(client = null) {
  let userId = null, epoch = 0, authEpoch = 0, suspended = false, draft = null, save = null;
  const changeAccount = id => {
    if (id !== userId) { userId = id; epoch++; draft = null; save = null; }
  };
  const accountId = user => user && !user.is_anonymous ? user.id : null;
  const subscription = client?.auth.onAuthStateChange((_event, session) => {
    changeAccount(suspended ? null : accountId(session?.user));
  }).data.subscription;
  const ready = () => !client ? { status: 'disabled' } : !userId ? { status: 'signed_out' } : null;
  async function query(action) {
    const denied = ready(); if (denied) return denied;
    const owner = userId, generation = epoch;
    try {
      const { data, error } = await action(owner);
      if (generation !== epoch || owner !== userId) return { status: 'account_changed' };
      if (error) return { status: error.code === '23505' ? 'conflict_or_unavailable' :
        ['23514','22023'].includes(error.code) ? 'validation' : 'network' };
      return { status: 'ok', data };
    } catch { return { status: generation !== epoch ? 'account_changed' : 'network' }; }
  }
  async function authCall(action) {
    if (!client) return { status: 'disabled' };
    try { const { error } = await action(); return { status: error ? 'network' : 'ok' }; }
    catch { return { status: 'network' }; }
  }
  const api = {
    state: () => structuredClone({ userId, draft, save }),
    async refreshAccount() {
      if (!client) return { status: 'disabled' };
      const generation = epoch;
      try {
        const { data, error } = await client.auth.getUser();
        if (generation !== epoch) return { status: 'account_changed' };
        if (error) { changeAccount(null); return { status: 'network' }; }
        suspended = false; changeAccount(accountId(data.user));
        return { status: userId ? 'ok' : 'signed_out' };
      } catch { changeAccount(null); return { status: 'network' }; }
    },
    requestOtp: email => authCall(() => client.auth.signInWithOtp({ email })),
    async verifyOtp(email, token) {
      // Explicit sign-in resumes auth events after a failed/offline logout.
      const generation = authEpoch;
      suspended = false;
      const result = await authCall(() => client.auth.verifyOtp({ email, token, type: 'email' }));
      if (generation !== authEpoch) {
        await authCall(() => client.auth.signOut({ scope: 'local' }));
        return { status: 'account_changed' };
      }
      return result.status === 'ok' ? api.refreshAccount() : result;
    },
    async signOut() {
      suspended = true; authEpoch++; epoch++; changeAccount(null); draft = null; save = null;
      return authCall(() => client.auth.signOut({ scope: 'local' }));
    },
    getProfile: () => query(id => client.from('armagedom_profiles').select('user_id,display_name').eq('user_id', id)),
    async saveProfile(displayName) {
      if (typeof displayName !== 'string' || displayName.trim().length < 1 || displayName.length > 32)
        return { status: 'validation' };
      const generation = epoch;
      const result = await query(id => client.from('armagedom_profiles')
        .insert({ user_id: id, display_name: displayName.trim() }).select('user_id,display_name'));
      if (generation !== epoch) return { status: 'account_changed' };
      if (result.status !== 'conflict_or_unavailable') return result;
      const updated = await query(id => client.from('armagedom_profiles').update({ display_name: displayName.trim() })
        .eq('user_id', id).select('user_id,display_name'));
      return updated.status === 'ok' && updated.data?.length !== 1 ?
        { status: 'conflict_or_unavailable' } : updated;
    },
    async loadCharacter() {
      const result = await query(id => client.from('armagedom_character_saves').select('*').eq('user_id', id));
      if (result.status !== 'ok') return result;
      const row = result.data?.[0] ?? null;
      if (row && row.schema_version !== 1) return { status: 'unsupported_schema' };
      save = structuredClone(row); return { status: 'ok', data: row };
    },
    async saveCharacter(expectedRevision, payload) {
      const denied = ready(); if (denied) return denied;
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || !validPayload(payload))
        return { status: 'validation' };
      draft = structuredClone(payload);
      // Never upsert a save: an unconditional upsert destroys conflict detection.
      const result = await query(id => {
        const table = client.from('armagedom_character_saves');
        return (expectedRevision === 0 ? table.insert({ user_id: id, payload: draft }) :
          table.update({ payload: draft }).eq('user_id', id).eq('revision', expectedRevision)).select('*');
      });
      if (result.status !== 'ok') return result;
      if (result.data?.length !== 1) return { status: 'conflict_or_unavailable' };
      const row = result.data[0];
      if (row.schema_version !== 1) return { status: 'unsupported_schema' };
      save = structuredClone(row); draft = null; return { status: 'ok', data: row };
    },
    dispose() { subscription?.unsubscribe(); suspended = true; authEpoch++; epoch++; changeAccount(null); },
  };
  return api;
}
