// The binary pose wire. One packet per client per tick; JSON is used only for the rare control messages.
//   client -> server  UP:   [type u8 = 2, seq u16, x f32, z f32, heading u8, anim u8, flags u8]            = 14 bytes
//   server -> client  DOWN: [type u8 = 1, tick u16, ack u16, count u8] then count x
//                           [id u8, x f32, z f32, heading u8, anim u8, flags u8]                            = 6 + 12 x count
// x and z are world metres in the area's own frame (the same frame as the client's layout geometry); heading is
// 0..255 round the compass; `anim` and `flags` are opaque bytes the clients agree on. `ack` echoes the last UP `seq`
// the server took from THIS client, so a client can time its own round trip.
export const DOWN = 1;
export const UP = 2;
export const UP_BYTES = 14;
export const HEAD_BYTES = 6;
export const ENTITY_BYTES = 12;
export const MAX_ENTITIES = 255;
const U16 = 0xffff;

export function encodeUp({ seq, x, z, heading, anim, flags }) {
  const bytes = new Uint8Array(UP_BYTES),
    view = new DataView(bytes.buffer);
  bytes[0] = UP;
  view.setUint16(1, seq & U16, true);
  view.setFloat32(3, x, true);
  view.setFloat32(7, z, true);
  bytes[11] = heading;
  bytes[12] = anim;
  bytes[13] = flags;
  return bytes;
}

/** The pose in an UP packet, or null when the packet is not a well-formed UP (wrong size, type or non-finite number). */
export function decodeUp(bytes) {
  if (bytes.length !== UP_BYTES || bytes[0] !== UP) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    x = view.getFloat32(3, true),
    z = view.getFloat32(7, true);
  if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
  return { seq: view.getUint16(1, true), x, z, heading: bytes[11], anim: bytes[12], flags: bytes[13] };
}

export function encodeDown(tick, ack, entities) {
  const count = Math.min(entities.length, MAX_ENTITIES),
    bytes = new Uint8Array(HEAD_BYTES + count * ENTITY_BYTES),
    view = new DataView(bytes.buffer);
  bytes[0] = DOWN;
  view.setUint16(1, tick & U16, true);
  view.setUint16(3, ack & U16, true);
  bytes[5] = count;
  for (let i = 0; i < count; i++) {
    const e = entities[i],
      at = HEAD_BYTES + i * ENTITY_BYTES;
    bytes[at] = e.id;
    view.setFloat32(at + 1, e.x, true);
    view.setFloat32(at + 5, e.z, true);
    bytes[at + 9] = e.heading;
    bytes[at + 10] = e.anim;
    bytes[at + 11] = e.flags;
  }
  return bytes;
}

export function decodeDown(bytes) {
  if (bytes.length < HEAD_BYTES || bytes[0] !== DOWN) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength),
    count = bytes[5];
  if (bytes.length !== HEAD_BYTES + count * ENTITY_BYTES) return null;
  const entities = [];
  for (let i = 0; i < count; i++) {
    const at = HEAD_BYTES + i * ENTITY_BYTES;
    entities.push({
      id: bytes[at],
      x: view.getFloat32(at + 1, true),
      z: view.getFloat32(at + 5, true),
      heading: bytes[at + 9],
      anim: bytes[at + 10],
      flags: bytes[at + 11],
    });
  }
  return { tick: view.getUint16(1, true), ack: view.getUint16(3, true), entities };
}
