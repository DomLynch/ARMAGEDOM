// Glue between the browser session and the presence client (W2). Created only when presenceConfig() says the flag is on; with it off
// nothing in this file runs, so the game is exactly the single-player game. The phone still moves itself: this only REPORTS where the
// player is and DRAWS the other players of the same area.
import { createPresenceClient, presenceConfig } from "./presence-client.js";
import { createRemotePlayers } from "./remote-players.js";
import { createRemotePlayersView } from "./remote-players-view.js";

export function createPresenceSession(s, { config, getToken = async () => null, WebSocketImpl, now } = {}) {
  if (!config) return null;
  const client = createPresenceClient({ url: config.url, getToken, WebSocketImpl, now }),
    remote = createRemotePlayers({ selfId: () => client.id });
  let view = null, // built on the first frame: the scene does not exist yet when the session is created
    area = null,
    clock = now ?? (() => globalThis.performance?.now?.() ?? Date.now());

  client.on("state", (message) => remote.apply(message, clock()));
  // A welcome starts a fresh layer: nobody from the area I left is shown any more.
  client.on("welcome", () => remote.clear());
  // The server only lets me travel from inside an exit zone it knows about; if it said no, start again in the area I am really in.
  client.on("refuse", (message) => {
    if (message.reason === "travel" && area && s.game) client.reconnect(area, s.game.player.pos);
  });

  return {
    client,
    remote,
    get view() {
      return view;
    },
    // Every frame, after the game has moved: join or change layers when the area changed, report my position, draw the others.
    update() {
      const g = s.game;
      if (!g || !s.world || s.traveling) return;
      const position = g.player.pos;
      if (s.world.areaId !== area) {
        const previous = area;
        area = s.world.areaId;
        remote.clear();
        // First area: join. A later area: the server only moves me through an exit zone, so ask to travel.
        if (previous === null || !client.joined) client.join(area, position);
        else client.travel(area);
      }
      client.report(position, clock());
      view ??= createRemotePlayersView({ scene: s.scene, toRender: (p, y) => s.world.toRender(p, y) });
      view.update(client.joined ? remote.sample(clock()) : []);
    },
    dispose() {
      client.close();
      view?.dispose();
      view = null;
    },
  };
}

export { presenceConfig };
