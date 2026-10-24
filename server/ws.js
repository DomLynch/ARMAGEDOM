// The small part of RFC 6455 a browser client needs, with no npm dependency (the same choice Frankendom's presence
// service made): the opening handshake, masked client frames up to a size limit, text and binary messages, ping/pong
// and close. No fragmented messages and no extensions: a client that sends them is closed with 1002/1003.
import { createHash } from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const OP = { CONTINUATION: 0, TEXT: 1, BINARY: 2, CLOSE: 8, PING: 9, PONG: 10 };
export const CLOSE = { NORMAL: 1000, PROTOCOL: 1002, UNSUPPORTED: 1003, TOO_BIG: 1009, IDLE: 4000, RATE: 4008, SPEED: 4009 };

function frame(opcode, payload) {
  const n = payload.length,
    head =
      n < 126
        ? Buffer.from([0x80 | opcode, n])
        : Buffer.from([0x80 | opcode, 126, n >> 8, n & 255]);
  return Buffer.concat([head, payload]);
}

/** Answer a WebSocket upgrade request; returns false (after writing an HTTP error) when it is not acceptable. */
export function handshake(req, socket, { protocol }) {
  const key = req.headers["sec-websocket-key"],
    offered = String(req.headers["sec-websocket-protocol"] ?? "")
      .split(",")
      .map((s) => s.trim());
  const reject = (status, text) => {
    socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    return false;
  };
  if (String(req.headers.upgrade ?? "").toLowerCase() !== "websocket" || !key) return reject(400, "Bad Request");
  if (req.headers["sec-websocket-version"] !== "13") return reject(426, "Upgrade Required");
  if (!offered.includes(protocol)) return reject(400, "Bad Request");
  const accept = createHash("sha1").update(key + GUID).digest("base64");
  socket.write(
    "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n" +
      `Sec-WebSocket-Accept: ${accept}\r\nSec-WebSocket-Protocol: ${protocol}\r\n\r\n`,
  );
  return true;
}

/**
 * Wrap an upgraded socket. Handlers: onMessage(data, isBinary), onClose(). `send` and `sendBinary` are no-ops after
 * close. `close(code)` sends a close frame and destroys the socket after `graceMs` if the peer does not finish.
 */
export function connection(socket, { maxMessage, graceMs = 1000, onMessage, onClose }) {
  let buffer = Buffer.alloc(0),
    closed = false,
    closing = false;

  const finish = () => {
    if (closed) return;
    closed = true;
    onClose?.();
  };
  const api = {
    get open() {
      return !closed && !closing && !socket.destroyed;
    },
    send: (text) => api.open && socket.write(frame(OP.TEXT, Buffer.from(text))),
    sendBinary: (bytes) => api.open && socket.write(frame(OP.BINARY, Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength))),
    close(code = CLOSE.NORMAL) {
      if (closing || socket.destroyed) return;
      closing = true;
      socket.write(frame(OP.CLOSE, Buffer.from([code >> 8, code & 255])));
      const timer = setTimeout(() => socket.destroy(), graceMs);
      timer.unref();
      socket.once("close", () => clearTimeout(timer));
    },
  };

  function fail(code) {
    api.close(code);
  }
  function parse() {
    for (;;) {
      if (buffer.length < 2) return;
      const first = buffer[0],
        second = buffer[1],
        opcode = first & 0x0f;
      if (first & 0x70) return fail(CLOSE.PROTOCOL); // reserved bits: extensions are not negotiated
      if (!(first & 0x80) || opcode === OP.CONTINUATION) return fail(CLOSE.UNSUPPORTED); // fragmented message
      if (!(second & 0x80)) return fail(CLOSE.PROTOCOL); // client frames must be masked
      let length = second & 0x7f,
        offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) return fail(CLOSE.TOO_BIG);
      if (length > maxMessage) return fail(CLOSE.TOO_BIG);
      if (buffer.length < offset + 4 + length) return;
      const mask = buffer.subarray(offset, offset + 4),
        payload = Buffer.from(buffer.subarray(offset + 4, offset + 4 + length));
      for (let i = 0; i < length; i++) payload[i] ^= mask[i & 3];
      buffer = buffer.subarray(offset + 4 + length);
      if (opcode === OP.PING) socket.write(frame(OP.PONG, payload));
      else if (opcode === OP.PONG) continue;
      else if (opcode === OP.CLOSE) {
        if (!closing) api.close(CLOSE.NORMAL);
        socket.end();
        return;
      } else if (opcode === OP.TEXT) onMessage(payload.toString("utf8"), false);
      else if (opcode === OP.BINARY) onMessage(new Uint8Array(payload.buffer, payload.byteOffset, payload.length), true);
      else return fail(CLOSE.PROTOCOL);
      if (closing) return;
    }
  }

  socket.on("data", (chunk) => {
    if (closing) return;
    buffer = Buffer.concat([buffer, chunk]);
    parse();
  });
  socket.on("close", finish);
  socket.on("error", () => socket.destroy());
  return api;
}
