// The N-real-client scenario (loaded by e2e-clients-driver.mjs). Every client is the unmodified built game in headless Chromium, signed in as a local guest.
//   1 enter Westminster       press "Enter Westminster", wait until the game is loaded and its presence socket has joined (window.__qa, Web PR "Local QA bridge")
//   2 see each other          wait until every client draws the other N-1 players (__qa.state().remotes)
//   3 play                    walk toward the nearest living enemy with the arrow keys the player would use, attack with the mouse, for ARMA_E2E_SECONDS
//   4 save and reload         the client saves by itself; one client is then reloaded and must come back as the same character with its progress
//   5 measure                 position-update latency client-to-client and to self, saves, frame times, console errors; screenshots with other players on screen
import fs from "node:fs";
import path from "node:path";

export async function run({ launch, newClient, crossLatency, serverUsage, clientlogLines, ORIGIN, CLIENTS, PLAY_SECONDS, OUT, sleep, pct, summarise, db, finish }) {
  const t0 = Date.now();
  const log = (msg) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0).padStart(4)}s] ${msg}`);
  fs.mkdirSync(OUT, { recursive: true });
  await launch();
  const clients = [];
  for (let i = 0; i < CLIENTS; i++) {
    const c = await newClient(i);
    c.loadRuns = [];
    c.page.on("response", async (r) => {
      if (r.url().endsWith("/arma/api/load_run")) c.loadRuns.push((await r.json().catch(() => null))?.run?.revision ?? null);
    });
    clients.push(c);
  }
  const qa = (c) => c.page.evaluate(() => window.__qa?.state()).catch(() => null);
  // The run record the client keeps, sampled DURING play (a record read after the fight is a dead player's, hp 0): every non-integer number seen, and the richest hurt records.
  const seenFractional = new Set(),
    hurtRecords = [];
  const walkRec = (value, trail) => {
    if (Array.isArray(value)) for (const v of value) walkRec(v, `${trail}[]`);
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walkRec(v, trail ? `${trail}.${k}` : k);
    else if (typeof value === "number" && !Number.isInteger(value)) seenFractional.add(trail);
  };
  const sampleRecord = async (c) => {
    const raw = await c.page.evaluate(() => localStorage.getItem("armagedom:marked-run:v18")).catch(() => null);
    if (!raw) return;
    try {
      const rec = JSON.parse(raw);
      const before = seenFractional.size;
      walkRec(rec, "");
      if (seenFractional.size > before || (Number.isFinite(rec.hp) && !Number.isInteger(rec.hp) && hurtRecords.length < 6)) hurtRecords.push(raw);
    } catch {
      /* unreadable: skip */
    }
  };

  // 1. enter
  await Promise.all(
    clients.map(async (c, i) => {
      await sleep(i * 2500); // stagger the cold starts: eight at once would measure the VPS, not the world
      await c.page.goto(`${ORIGIN}/?qa=1`, { waitUntil: "domcontentloaded" });
      await c.page.getByRole("button", { name: /Enter Westminster/i }).click({ timeout: 120_000 });
      const deadline = Date.now() + 240_000;
      for (;;) {
        const s = await qa(c);
        if (s?.loaded && s.presence?.joined) break;
        if (Date.now() > deadline) throw new Error(`client ${i} never joined: ${JSON.stringify(s)} ${c.consoleErrors.slice(0, 3)}`);
        await sleep(1000);
      }
    }),
  );
  log(`all ${CLIENTS} clients are in the world`);
  // What the page really renders with: the WebGL renderer string (SwiftShader on a VPS, the GPU on a Mac).
  const renderer = await clients[0].page.evaluate(() => {
    const gl = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
    const info = gl?.getExtension("WEBGL_debug_renderer_info");
    return gl ? { vendor: gl.getParameter(info ? info.UNMASKED_VENDOR_WEBGL : gl.VENDOR), renderer: gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) } : null;
  });
  log(`WebGL renderer: ${JSON.stringify(renderer)}`);

  // 2. see each other
  const seeDeadline = Date.now() + 120_000;
  let remotes = [];
  for (;;) {
    remotes = await Promise.all(clients.map(async (c) => (await qa(c))?.remotes ?? 0));
    if (remotes.every((n) => n === CLIENTS - 1) || Date.now() > seeDeadline) break;
    await sleep(500);
  }
  const sawAllAt = ((Date.now() - t0) / 1000).toFixed(0);
  log(`remote players drawn per client: ${remotes.join(",")}`);
  // Players arrive at spread-out points (tens of metres apart). Gather everyone around client 0, who waits, so that the others are inside one camera view,
  // then take stills while everyone is alive and before anyone fights: the proof that other players are on screen.
  const makeHold = (c) => {
    const held = new Set();
    return async (keys) => {
      for (const k of [...held]) if (!keys.has(k)) (await c.page.keyboard.up(k), held.delete(k));
      for (const k of keys) if (!held.has(k)) (await c.page.keyboard.down(k), held.add(k));
    };
  };
  const meet = (await qa(clients[0]))?.pos;
  const gatherDeadline = Date.now() + 90_000;
  const gathered = await Promise.all(
    clients.slice(1).map(async (c) => {
      const hold = makeHold(c);
      let d = Infinity;
      while (meet && Date.now() < gatherDeadline) {
        const pos = (await qa(c))?.pos;
        if (!pos) break;
        const dx = meet.x - pos.x + (c.index % 3) * 1.2 - 1.2, // stand a little apart from each other, 1-3 m from the meeting point
          dz = meet.z - pos.z + (c.index % 2) * 1.5;
        d = Math.hypot(dx, dz);
        if (d < 1) break;
        const keys = new Set();
        if (Math.abs(dx) > 0.5) keys.add(dx > 0 ? "KeyD" : "KeyA");
        if (Math.abs(dz) > 0.5) keys.add(dz > 0 ? "KeyW" : "KeyS");
        await hold(keys);
        await sleep(150);
      }
      await hold(new Set());
      return d;
    }),
  );
  log(`gathered around client 0; distances left (m): ${gathered.map((d) => d.toFixed(1)).join(",")}`);
  await sleep(2500);
  const usageBefore = serverUsage();
  const inViewShots = [];
  for (const c of clients.slice(0, 3)) {
    const file = `client-${c.index}-in-view-${(await qa(c))?.remotes}-others.png`;
    await c.page.screenshot({ path: path.join(OUT, file) }).catch(() => {});
    inViewShots.push(file);
  }

  // 3. play: walk to the nearest living enemy, then attack it
  const stop = { at: Date.now() + PLAY_SECONDS * 1000 };
  const playing = clients.map(async (c) => {
    const hold = makeHold(c);
    c.attacks = 0;
    c.minDist = Infinity;
    while (Date.now() < stop.at) {
      const view = await c.page.evaluate(() => {
        const g = window.__qa.game,
          p = g.player.pos;
        let best = null;
        for (const e of g.enemies ?? []) {
          if (!(e.hp > 0)) continue;
          const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
          if (!best || d < best.d) best = { d, dx: e.pos.x - p.x, dz: e.pos.z - p.z, x: e.pos.x, z: e.pos.z };
        }
        // Where a world point lands on screen (CSS px), through the game's own camera. The game flips z between game and render space, so the sign that puts the
        // player near the middle of the screen (the camera follows the player) is the right one.
        const w = window.__qa.world,
          cam = w.camera,
          T = w.THREE;
        const screen = (x, z, sign) => {
          const v = new T.Vector3(x, 0.9, sign * z).project(cam);
          return { sx: ((v.x + 1) / 2) * innerWidth, sy: ((1 - v.y) / 2) * innerHeight, off: Math.hypot(v.x, v.y) };
        };
        const sign = screen(p.x, p.z, 1).off < screen(p.x, p.z, -1).off ? 1 : -1;
        const at = best ? screen(best.x, best.z, sign) : null;
        return { me: { x: p.x, z: p.z }, best: best && { ...best, sx: at.sx, sy: at.sy }, hp: g.player.hp, kills: g.kills };
      }).catch(() => null);
      if (!view?.best) {
        await hold(new Set());
        await sleep(300);
        continue;
      }
      c.minDist = Math.min(c.minDist, view.best.d);
      if (Date.now() - (c.lastSample ?? 0) > 1000) ((c.lastSample = Date.now()), await sampleRecord(c));
      const keys = new Set();
      if (view.best.d > 2.0) {
        if (Math.abs(view.best.dx) > 0.4) keys.add(view.best.dx > 0 ? "KeyD" : "KeyA");
        if (Math.abs(view.best.dz) > 0.4) keys.add(view.best.dz > 0 ? "KeyW" : "KeyS");
      } else {
        const x = Math.min(370, Math.max(5, view.best.sx)),
          y = Math.min(660, Math.max(5, view.best.sy));
        await c.page.mouse.click(x, y).catch(() => {}); // a slash toward the enemy's place on screen
        c.attacks++;
      }
      await hold(keys);
      c.lastView = view;
      await sleep(180);
    }
    await hold(new Set());
  });
  await Promise.all(playing);
  log("play phase over");
  const usageAfter = serverUsage();

  // 4. let the saves land, reload one client, check it is the same character with its progress
  await sleep(8000);
  const probes = await Promise.all(clients.map((c) => c.probe()));
  const killsEnd = await Promise.all(clients.map((c) => c.page.evaluate(() => window.__qa.game.kills).catch(() => null)));
  const dbBefore = (await db.query("select count(*)::int as characters, (select count(*)::int from public.arma_runs) as runs from public.arma_characters")).rows[0];
  const who = 3 % CLIENTS;
  const target = clients[who];
  const beforeReload = await target.page.evaluate(() => ({ kills: window.__qa.game.kills, hp: window.__qa.game.player.hp, area: window.__qa.state().area })).catch(() => null);
  const runBefore = (await db.query("select character, revision from public.arma_runs order by character")).rows;
  const shots = [];
  for (const c of clients.slice(0, 3)) {
    const file = `client-${c.index}-sees-${(await qa(c))?.remotes}-others.png`;
    await c.page.screenshot({ path: path.join(OUT, file) }).catch(() => {});
    shots.push(file);
  }
  const loadsBefore = target.loadRuns.length;
  await target.page.reload({ waitUntil: "domcontentloaded" });
  await target.page.getByRole("button", { name: /Enter Westminster/i }).click({ timeout: 120_000 });
  const reloadDeadline = Date.now() + 240_000;
  let afterReload = null;
  for (;;) {
    const s = await qa(target);
    if (s?.loaded && s.presence?.joined) {
      afterReload = s;
      break;
    }
    if (Date.now() > reloadDeadline) break;
    await sleep(1000);
  }
  await sleep(4000);
  const afterState = await target.page.evaluate(() => ({ kills: window.__qa.game.kills, hp: window.__qa.game.player.hp, area: window.__qa.state().area })).catch(() => null);
  const dbAfter = (await db.query("select count(*)::int as characters, (select count(*)::int from public.arma_runs) as runs from public.arma_characters")).rows[0];
  log(`client ${who} reloaded: ${JSON.stringify(beforeReload)} -> ${JSON.stringify(afterState)}`);

  // Every non-integer number in the clients' own run records (the server's record envelope treats numbers as whole unless a cap row says otherwise).
  const fractional = new Set();
  const walk = (value, trail) => {
    if (Array.isArray(value)) for (const v of value) walk(v, `${trail}[]`);
    else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) walk(v, trail ? `${trail}.${k}` : k);
    else if (typeof value === "number" && !Number.isInteger(value)) fractional.add(trail);
  };
  const rawRecords = await Promise.all(clients.map((c) => c.page.evaluate(() => localStorage.getItem("armagedom:marked-run:v18")).catch(() => null)));
  rawRecords.forEach((raw, i) => {
    try {
      walk(JSON.parse(raw), "");
      fs.writeFileSync(path.join(OUT, `record-client-${i}.json`), raw); // a real played run record, exactly as the client would send it
    } catch {
      /* no record */
    }
  });
  for (const p of seenFractional) fractional.add(p);
  hurtRecords.forEach((raw, i) => fs.writeFileSync(path.join(OUT, `record-played-${i}.json`), raw));
  log(`non-integer numbers in the clients' run records (sampled through play): ${JSON.stringify([...fractional])}`);

  // 4b. a second device of the same guest: only the sign-in session is copied, so its run and character caches are empty and it must pull the run from the server.
  const RUN_KEY = "armagedom:marked-run:v18",
    SESSION_KEY = "armagedom.world.session.v1";
  const local = await target.page.evaluate(([run, session]) => ({ run: localStorage.getItem(run), session: localStorage.getItem(session) }), [RUN_KEY, SESSION_KEY]);
  const account = (() => {
    try {
      return JSON.parse(local.session).user_id;
    } catch {
      return null;
    }
  })();
  const characterId = account ? ((await db.query("select character from public.arma_active_character where account = $1", [account])).rows[0]?.character ?? null) : null;
  const dbRun = characterId ? (await db.query("select revision, record from public.arma_runs where character = $1", [characterId])).rows[0] : null;
  const device2 = await newClient(CLIENTS);
  await device2.context.addInitScript(([key, session]) => localStorage.getItem(key) === null && localStorage.setItem(key, session), [SESSION_KEY, local.session]);
  await device2.page.goto(`${ORIGIN}/?qa=1`, { waitUntil: "domcontentloaded" });
  await device2.page.getByRole("button", { name: /Enter Westminster/i }).click({ timeout: 120_000 });
  let device2Joined = null;
  for (const deadline = Date.now() + 240_000; Date.now() < deadline; await sleep(1000)) {
    const s = await qa(device2);
    if (s?.loaded && s.presence?.joined) {
      device2Joined = s;
      break;
    }
  }
  await sleep(4000);
  const restored = await device2.page.evaluate((run) => localStorage.getItem(run), RUN_KEY);
  const { isDeepStrictEqual } = await import("node:util");
  const secondDevice = {
    joined: !!device2Joined,
    character: characterId,
    sameCharacterRows: (await db.query("select count(*)::int as n from public.arma_characters")).rows[0].n,
    localRunEqualsServerRecord: !!(local.run && dbRun) && isDeepStrictEqual(JSON.parse(local.run), dbRun.record),
    restoredEqualsServerRecord: !!(restored && dbRun) && isDeepStrictEqual(JSON.parse(restored), dbRun.record),
    serverRevision: dbRun?.revision ?? null,
    loadRunRevisions: device2.loadRuns,
  };
  log(`second device: ${JSON.stringify(secondDevice)}`);

  // 5. measure
  const sum = probes.map(summarise);
  const allCross = [];
  for (let a = 0; a < CLIENTS; a++)
    for (let b = 0; b < CLIENTS; b++) {
      if (a === b) continue;
      const id = probes[a].welcome?.id;
      for (const s of probes[a].sent) {
        const seen = probes[b].states.find((st) => st.wall >= s.wall && st.players.some((p) => p[0] === id && p[1] === s.x && p[2] === s.z));
        if (seen) allCross.push(seen.wall - s.wall);
      }
    }
  const saves = clients.map((c) => c.net.filter((n) => n.startsWith("POST /arma/api/save_run")).map((n) => n.split(" ").pop()));
  const realErrors = clients.map((c, i) => c.consoleErrors.filter((e) => !e.startsWith("requestfailed")));
  const aborted = clients.map((c) => c.consoleErrors.filter((e) => e.startsWith("requestfailed")).length);
  const qaErrors = await Promise.all(clients.map((c) => c.page.evaluate(() => window.__qa.errors).catch(() => [])));
  const report = {
    clients: CLIENTS,
    webgl: renderer,
    serverUsage: { atStartOfPlay: usageBefore, atEndOfPlay: usageAfter },
    // Every client reaches the writer from 127.0.0.1 here, so the beacon's per-IP limit (burst 3, 1 per 10 s) is shared by all of them; real players have their own IPs.
    beacon: { journalLines: clientlogLines.length, sample: clientlogLines.slice(0, 6), responses429: clients.map((c) => c.net.filter((n) => n.endsWith(" 429")).map((n) => n.split(" ").slice(0, 2).join(" "))) },
    machine: { platform: process.platform, load: (await import("node:os")).loadavg().map((n) => Number(n.toFixed(1))), cpus: (await import("node:os")).cpus().length },
    sawAllAtSeconds: Number(sawAllAt),
    remotesPerClient: remotes,
    positionUpdate: { crossClient: { n: allCross.length, p50: pct(allCross, 50), p95: pct(allCross, 95), max: pct(allCross, 100) } },
    perClient: sum.map((s, i) => ({
      client: i,
      welcomed: s.welcomed,
      maxPlayersSeen: s.maxPlayersSeen,
      locSent: s.locSent,
      locToOwnStateMs: s.locToStateMs,
      frameMs: s.frameMs,
      closes: s.closes,
      savesStatus: saves[i],
      attacks: clients[i].attacks,
      closestToEnemyM: Number(clients[i].minDist.toFixed(2)),
      killsAtEndOfPlay: killsEnd[i],
      consoleErrors: realErrors[i],
      qaErrors: qaErrors[i],
      abortedAssetRequests: aborted[i],
      ws: clients[i].net.filter((n) => n.startsWith("WS")).length,
    })),
    reload: { client: who, before: beforeReload, after: afterState, sameCharacter: dbAfter.characters === dbBefore.characters, charactersBefore: dbBefore.characters, charactersAfter: dbAfter.characters, loadRunRevisions: target.loadRuns, joinedAgain: !!afterReload },
    secondDevice,
    fractionalPathsInClientRecords: [...fractional],
    db: { before: dbBefore, after: dbAfter, runs: runBefore },
    screenshots: { inView: inViewShots, afterPlay: shots },
  };
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 1));
  await finish(0);
}
