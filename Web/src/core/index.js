/**
 * @typedef {{type:'claimPickup',pickupId:string}|{type:'equip',itemId:string,equipped:boolean}|
 * {type:'retry'}|{type:'save'}|{type:'restore'}} CoreCommand
 * @typedef {{ok:true,changed:boolean,events:ReadonlyArray<object>}|
 * {ok:false,code:'invalid-command'|'invalid-save'|'storage-unavailable'|'not-eligible'|'already-collected',events:ReadonlyArray<object>}} CoreResult
 */
const fields = Object.freeze({claimPickup:['type','pickupId'],equip:['type','itemId','equipped'],retry:['type'],save:['type'],restore:['type']});
const codes = new Set(['invalid-command','invalid-save','storage-unavailable','not-eligible','already-collected']);
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9:_-]{0,127}$/.test(id);
function validCommand(command) {
  if (!command || Object.getPrototypeOf(command) !== Object.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(command), keys = Reflect.ownKeys(descriptors);
  if (keys.some(key => typeof key !== 'string' || !('value' in descriptors[key]))) return false;
  if (typeof command.type !== 'string' || !Object.hasOwn(fields, command.type)) return false;
  const expected = fields[command.type];
  return !!expected && keys.length === expected.length && keys.every(key => expected.includes(key)) &&
    (command.type !== 'claimPickup' || validId(command.pickupId)) &&
    (command.type !== 'equip' || validId(command.itemId) && typeof command.equipped === 'boolean');
}
const failure = code => Object.freeze({ok:false,code,events:Object.freeze([])});
const ioCode = status => status === 'corrupt' || status === 'invalid' ? 'invalid-save' : 'storage-unavailable';
function freezeTree(value, seen = new Set()) {
  if (value && typeof value === 'object' && !seen.has(value)) {
    seen.add(value);for (const child of Object.values(value)) freezeTree(child, seen);Object.freeze(value);
  }
  return value;
}
/** The injected executor owns rules and live state. Core owns validation and IO routing, not a ledger. */
export function createCore({executeDomain,readRun,writeRun,codec,account} = {}) {
  if (typeof executeDomain !== 'function' || typeof readRun !== 'function' || typeof writeRun !== 'function' ||
      typeof codec?.encodeRun !== 'function' || typeof codec?.restoreRun !== 'function')
    throw TypeError('Core requires the domain executor and existing codec/storage IO');
  let active = false;
  return Object.freeze({
    /** @param {CoreCommand} command @returns {CoreResult} */
    dispatch(command) {
      if (!validCommand(command)) return failure('invalid-command');
      if (active) return failure('not-eligible');
      active = true;let error = null, committed = false, restored = false;
      try {
        const result = executeDomain(Object.freeze({...command}), Object.freeze({codec,account,
          writeRun(candidate) {
            let written;try { written = writeRun(candidate,{fresh:command.type === 'retry'}); }
            catch { written = {ok:false,status:'unavailable'}; }
            if (!written?.ok) { error = ioCode(written?.status);return false; }
            committed = true;return true;
          },
          readRun() {
            if (command.type !== 'restore') { error = 'invalid-command';return null; }
            let loaded;try { loaded = readRun(); } catch { loaded = {status:'unavailable'}; }
            if (loaded?.status !== 'ok' || !loaded.saved) { error = ioCode(loaded?.status);return null; }
            restored = true;return loaded.saved;
          },
        }));
        if (error) return failure(error);
        if (!result || !Array.isArray(result.events) || (result.ok !== true && result.ok !== false))
          throw TypeError('Domain executor must return the CoreResult contract synchronously');
        if (!result.ok) { if (!codes.has(result.code)) throw TypeError('Unknown CoreResult code');return failure(result.code); }
        if (typeof result.changed !== 'boolean') throw TypeError('CoreResult changed must be boolean');
        if (command.type === 'restore' ? !restored : !committed && (result.changed || result.events.length || command.type === 'save'))
          return failure('invalid-save');
        return freezeTree({ok:true,changed:result.changed,events:structuredClone(result.events)});
      } finally { active = false; }
    },
  });
}
