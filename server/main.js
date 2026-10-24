// node server/main.js: start the session server for local runs. It binds 127.0.0.1 and refuses any other host unless
// SESSION_ALLOW_PUBLIC=1 is set, so it cannot be exposed by accident (hosting needs the owner's approval first).
import fs from "node:fs";
import { loadAreas } from "./areas.js";
import { createSessionServer } from "./session-server.js";

const rules = JSON.parse(fs.readFileSync(new URL("./rules.json", import.meta.url), "utf8")),
  host = process.env.SESSION_HOST ?? "127.0.0.1",
  port = Number(process.env.SESSION_PORT ?? 8891);
if (host !== "127.0.0.1" && process.env.SESSION_ALLOW_PUBLIC !== "1")
  throw new Error("The session server binds 127.0.0.1 only; SESSION_ALLOW_PUBLIC=1 is for an approved deployment");

const areas = await loadAreas();
const app = createSessionServer({ areas, rules, host, port, log: console.log });
await app.listen();
setInterval(() => console.log("session:", JSON.stringify(app.stats())), 60_000).unref();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, async () => {
    await app.close();
    process.exit(0);
  });
