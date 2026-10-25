// Local world harness (dev tool; never imported by the game, so never in the shipped bundle). It lets the world flag run on this
// machine with no Supabase and no VPS: the REAL presence server (server/presence/server.js) on 127.0.0.1:8892 with a fake token
// check, plus walking bots so a page sees other players. Used for the measured totals and the 375 stills of the remote survivors.
//   node scripts/world-harness.mjs [--area <id>] [--walk north,east,...] [--port 8892] [--origin http://127.0.0.1:5391]
// Then open the dev server page with  ?world=1&presenceUrl=ws://127.0.0.1:8892  after seeding a stored guest session whose
// access_token is "harness-me" (printed on start). Tokens "harness-<anything>" are accepted; "harness-bot-N" are the bots.
import http from "node:http";
import crypto from "node:crypto";
import { loadAreaRows } from "../../server/presence/area-rules.js";
import { presenceLimits } from "../../server/presence/limits.js";
import { createPresence } from "../../server/presence/server.js";
import { areaPresenceData, loadContent } from "./area-presence-rows.mjs";

const arg = (name, fallback) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 0 ? process.argv[at + 1] : fallback;
};
const port = Number(arg("port", 8892)),
  origin = arg("origin", "http://127.0.0.1:5391"),
  walks = arg("walk", "north,east").split(",").filter(Boolean);
const content = loadContent(),
  rules = loadAreaRows(areaPresenceData(content)),
  area = arg("area", Object.keys(rules.areas)[0]);

const verify = async (token) => {
  if (!/^harness-[a-z0-9-]{1,32}$/.test(token)) return null;
  const id = crypto.createHash("sha1").update(token).digest("hex");
  return { id: `${id.slice(0, 8)}-0000-4000-8000-${id.slice(8, 20)}`, name: token === "harness-me" ? "Me" : token.replace("harness-bot-", "Bot ") };
};
const presence = createPresence({ rules, limits: presenceLimits(rules, content), verify, allowedOrigins: [origin], devOrigins: true, log: console.log });
presence.server.listen(port, "127.0.0.1", () => console.log(`harness: presence on ws://127.0.0.1:${port}, area ${area}, origin ${origin}`));
setInterval(() => presence.tick().catch((error) => console.error(error.message)), 100);

// A minimal client frame: masked text, payloads under 126 bytes (a loc or a join is about 30).
const frame = (text) => {
  const body = Buffer.from(text),
    mask = crypto.randomBytes(4),
    out = Buffer.alloc(6 + body.length);
  out[0] = 0x81;
  out[1] = 0x80 | body.length;
  mask.copy(out, 2);
  for (let i = 0; i < body.length; i++) out[6 + i] = body[i] ^ mask[i % 4];
  return out;
};
const DIRECTIONS = { north: [0, 1], south: [0, -1], east: [1, 0], west: [-1, 0] }; // game space: north (up the screen) is +z, toRender flips z

// Where the bots stand (cm), a few metres from where the player enters Westminster, so they are in the fight camera.
const START = [
  { x: 200, z: -300 },
  { x: -100, z: 300 },
  { x: 300, z: 300 },
  { x: -300, z: -200 },
  { x: 400, z: 0 },
  { x: -400, z: 100 },
  { x: 100, z: 450 },
  { x: -200, z: -450 },
];
function bot(index, direction) {
  const [dx, dz] = DIRECTIONS[direction],
    req = http.request({
      host: "127.0.0.1",
      port,
      headers: {
        Connection: "Upgrade",
        Upgrade: "websocket",
        Origin: origin,
        "Sec-WebSocket-Version": "13",
        "Sec-WebSocket-Key": crypto.randomBytes(16).toString("base64"),
        "Sec-WebSocket-Protocol": `arma.v1, token.harness-bot-${index}`,
      },
    });
  req.on("error", (error) => console.error(`bot ${index}: ${error.message}`));
  req.on("response", (res) => console.error(`bot ${index}: refused ${res.statusCode}`));
  req.on("upgrade", (_res, socket) => {
    let position = null;
    socket.on("data", (data) => {
      if (position || data[0] !== 0x81) return;
      try {
        const message = JSON.parse(data.subarray(data[1] < 126 ? 2 : 4).toString());
        if (message.t === "welcome") {
          position = { x: message.x, z: message.z };
          console.log(`bot ${index} (${direction}) welcome at ${position.x},${position.z} cm`);
          // Stands still until the harness gets SIGUSR2 (kill -USR2 <pid>), then walks 40 steps (6 m, 6 s) one way and stops: 15 cm
          // every 100 ms is 1.5 m/s, under the server's speed cap, slow enough to take a still mid-walk. Another SIGUSR2 walks the same way once more.
          process.on("SIGUSR2", () => {
            let steps = 0;
            const walk = setInterval(() => {
              if (steps++ >= 40) return clearInterval(walk);
              position = { x: position.x + dx * 15, z: position.z + dz * 15 };
              socket.write(frame(JSON.stringify({ t: "loc", x: position.x, z: position.z })));
            }, 100);
          });
        }
      } catch {
        /* Frames that are not a single short text message are ignored. */
      }
    });
    socket.on("error", () => {});
    socket.write(frame(JSON.stringify({ t: "join", area, ...START[index - 1] })));
  });
  req.end();
}
walks.forEach((direction, i) => setTimeout(() => bot(i + 1, direction), 500 + i * 300));
