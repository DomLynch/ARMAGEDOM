// The outgoing frame header at every length boundary of RFC 6455 section 5.2 (7-bit, 16-bit and 64-bit lengths).
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { connection } from "./ws.js";

function sent(length) {
  const socket = Object.assign(new EventEmitter(), { destroyed: false, written: [], write(buf) { this.written.push(buf); }, end() {}, destroy() {} });
  connection(socket, { maxMessage: 16, onMessage() {}, onClose() {} }).send("x".repeat(length));
  return Buffer.concat(socket.written);
}
function decode(frame) {
  let length = frame[1] & 0x7f,
    offset = 2;
  if (length === 126) [length, offset] = [frame.readUInt16BE(2), 4];
  else if (length === 127) [length, offset] = [Number(frame.readBigUInt64BE(2)), 10];
  return { opcode: frame[0] & 15, fin: !!(frame[0] & 0x80), length, payload: frame.subarray(offset) };
}

test("frames: the length is encoded correctly at 0, 125, 126, 65535, 65536 and beyond (a full layer's state frame)", () => {
  for (const n of [0, 1, 125, 126, 127, 1000, 65535, 65536, 70000, 300000]) {
    const frame = decode(sent(n));
    assert.equal(frame.length, n, `declared length for ${n}`);
    assert.equal(frame.payload.length, n, `actual payload for ${n}`);
    assert.deepEqual([frame.opcode, frame.fin], [1, true]);
    assert.ok(frame.payload.every((b) => b === 0x78));
  }
  assert.equal(sent(125)[1], 125);
  assert.equal(sent(126)[1], 126);
  assert.equal(sent(65535)[1], 126);
  assert.equal(sent(65536)[1], 127);
});
