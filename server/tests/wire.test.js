import test from "node:test";
import assert from "node:assert/strict";
import { UP_BYTES, ENTITY_BYTES, HEAD_BYTES, decodeDown, decodeUp, encodeDown, encodeUp } from "../wire.js";

test("an UP packet round-trips and is 14 bytes", () => {
  const pose = { seq: 65535, x: -17.25, z: 40.5, heading: 200, anim: 3, flags: 255 };
  const bytes = encodeUp(pose);
  assert.equal(bytes.length, UP_BYTES);
  assert.deepEqual(decodeUp(bytes), pose);
  assert.equal(decodeUp(encodeUp({ ...pose, seq: 65536 + 5 })).seq, 5, "the sequence wraps at 16 bits");
});

test("malformed UP packets are refused", () => {
  const good = encodeUp({ seq: 1, x: 1, z: 1, heading: 0, anim: 0, flags: 0 });
  assert.equal(decodeUp(good.subarray(0, 13)), null);
  assert.equal(decodeUp(Uint8Array.from([...good, 0])), null);
  assert.equal(decodeUp(Uint8Array.from([9, ...good.subarray(1)])), null);
  assert.equal(decodeUp(encodeUp({ seq: 1, x: NaN, z: 1, heading: 0, anim: 0, flags: 0 })), null);
  assert.equal(decodeUp(encodeUp({ seq: 1, x: 1, z: Infinity, heading: 0, anim: 0, flags: 0 })), null);
});

test("a DOWN packet carries up to four entities in 6 + 12 bytes each", () => {
  const entities = [1, 2, 3, 4].map((id) => ({ id, x: id * 1.5, z: -id, heading: id, anim: id + 1, flags: id + 2 }));
  const bytes = encodeDown(70000, 9, entities);
  assert.equal(bytes.length, HEAD_BYTES + 4 * ENTITY_BYTES);
  assert.deepEqual(decodeDown(bytes), { tick: 70000 & 0xffff, ack: 9, entities });
  assert.equal(decodeDown(bytes.subarray(0, bytes.length - 1)), null);
});
