# Session server (multiplayer proof, P1)

Rooms of four per area shard, presence and movement over WebSocket. **Local only**: it binds 127.0.0.1 and `main.js`
refuses any other host unless `SESSION_ALLOW_PUBLIC=1`. Nothing here is a hosted service; hosting waits for the owner's
approval. No paid service, no TURN/SFU, no voice. No npm dependencies (a small RFC 6455 subset in `ws.js`).

```bash
cd server
npm test                 # unit + real-socket tests on 127.0.0.1 (Node 22+ for the built-in WebSocket client)
node main.js             # SESSION_PORT=8891 by default
```

- `rules.json`: every number (room size, tick rate, speed limits, message limits, timeouts). Nothing is hard-coded.
- `areas.js`: area ids, links and spawns are read from the game's own registry rows in `Web/` (`area-registry.js`, layouts).
- `rooms.js`: pure room/shard logic (fill the lowest shard with a free seat first, join, leave, travel along registry links, speed-clamped pose).
- `wire.js`: binary poses. UP 14 bytes per client per tick; DOWN `6 + 12 x players` bytes (54 bytes for a full room), so about 0.8 kB/s down and 0.2 kB/s up per phone at 15 Hz.
- `session-server.js`: sockets, the wall-clock-aimed tick, heartbeat/idle sweep, per-address and per-second limits, `/health`.

Protocol `armagedom.session.v1` (WebSocket subprotocol, required):

| direction | message |
| --- | --- |
| client to server | `{"t":"join","area":"westminster","name":"..."}`, `{"t":"travel","area":"..."}`, `{"t":"leave"}`, `{"t":"ping","c":n}`, binary UP |
| server to client | `hello` / `travelled` (`id`, `area`, `shard`, `x`, `z`, `players`, `tickHz`, `roomSize`, `session`), `enter`, `leave` (`why`), `left`, `pong`, `beat`, `error` (`code`), binary DOWN |

Closes: 4000 idle, 4008 message rate, 4009 repeated speed violations, 1002/1003/1009 malformed frames.

Not in P1: accounts or tokens, server-held run state and rejoin (P3), combat authority (P2), interest management (four per room needs none).
