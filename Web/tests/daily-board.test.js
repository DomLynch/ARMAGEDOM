import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateDailyBoard } from "../src/engine/game-data-daily-board.js";
import { webText } from "../src/engine/web-text.js";
import { boardOn, createBoardApi, createDailyBoard, normalizeBoard } from "../src/engine/daily-board.js";

const RULES = GAME_DATA.dailyBoard;
const board = (top, me = null) => ({ day: "2026-11-05", top, me });
const row = (rank, name, score, extra = {}) => ({ rank, name, score, kills: 3, you: false, ...extra });

function element(tag = "div") {
  const listeners = {},
    attributes = {},
    e = {
      tag,
      hidden: false,
      textContent: "",
      className: "",
      children: [],
      classes: new Set(),
      attributes,
      classList: { toggle: (name, on) => (on ? e.classes.add(name) : e.classes.delete(name)) },
      append: (...nodes) => e.children.push(...nodes),
      replaceChildren: (...nodes) => (e.children = nodes),
      setAttribute: (name, value) => (attributes[name] = String(value)),
      addEventListener: (type, fn) => (listeners[type] = fn),
      removeEventListener: (type) => delete listeners[type],
      click: () => listeners.click?.(),
    };
  return e;
}
function page() {
  const els = Object.fromEntries(
    ["daily-board", "daily-board-open", "daily-board-panel", "daily-board-heading", "daily-board-list", "daily-board-me", "daily-board-status"].map((id) => [id, element()]),
  );
  return { els, getElementById: (id) => els[id] ?? null, createElement: element };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));
const names = (list) => list.children.map((li) => li.children[1].textContent);

test("dailyBoard.json is valid data and the validator refuses a stray field, a bad switch and a bad number", () => {
  const data = () => structuredClone(JSON.parse(fs.readFileSync(new URL("../src/data/dailyBoard.json", import.meta.url), "utf8")));
  assert.doesNotThrow(() => validateDailyBoard(data()));
  assert.equal(RULES.op, "leaderboard", "the writer's op name");
  for (const change of [{ extra: 1 }, { enabled: "yes" }, { offSwitch: "No Board" }, { op: "x-y" }, { maxRows: 0 }, { maxRows: 21 }, { cacheMs: -1 }, { nameMax: 2 }])
    assert.throws(() => validateDailyBoard({ ...data(), ...change }), Error, JSON.stringify(change));
});

test("the off switch: enabled false or ?noboard=1 turns the panel off", () => {
  assert.equal(boardOn("", RULES), true);
  assert.equal(boardOn("?noboard=1", RULES), false);
  assert.equal(boardOn("?other=1", RULES), true);
  assert.equal(boardOn("", { ...RULES, enabled: false }), false);
});

test("normalizeBoard keeps the known shape, drops bad rows, cleans names and cuts to the data's limits", () => {
  const long = "x".repeat(RULES.nameMax + 10);
  const cleaned = normalizeBoard(
    board([row(1, "Survivor-0042", 300, { you: true }), row(2, "Bad\u0000Name\u0007", 200), row(3, "", 100), row(0, "ZeroRank", 100), row(4, long, 50), { rank: 5, name: "NoScore" }, null, row(6, "Float", 1.5)], {
      rank: 7,
      score: 20,
      kills: 1,
    }),
  );
  assert.deepEqual(cleaned.rows.map((r) => [r.rank, r.name.length, r.you]), [[1, 13, true], [2, 7, false], [4, RULES.nameMax, false]]);
  assert.equal(cleaned.rows[1].name, "BadName");
  assert.deepEqual(cleaned.me, { rank: 7, score: 20, kills: 1 });
  assert.equal(normalizeBoard({ top: "x" }), null);
  assert.equal(normalizeBoard(null), null);
  assert.equal(normalizeBoard({ error: "rate-limited" }), null);
  assert.equal(normalizeBoard(board([row(1, "A", 1)], { rank: 0, score: 1, kills: 1 })).me, null);
  const many = normalizeBoard(board(Array.from({ length: RULES.maxRows + 5 }, (_, i) => row(i + 1, `P${i}`, 100 - i))));
  assert.equal(many.rows.length, RULES.maxRows);
});

test("the api asks the leaderboard op, reuses an answer for cacheMs, shares an in-flight ask and keeps the last good board when a read fails", async () => {
  let clock = 1000;
  const calls = [];
  let reply = board([row(1, "A", 100)]);
  const api = createBoardApi({ send: async (op, body) => (calls.push([op, body]), reply), now: () => clock });
  const [a, b] = await Promise.all([api.load(), api.load()]);
  assert.deepEqual(calls, [[RULES.op, {}]], "one request for two asks");
  assert.equal(a, b);
  assert.equal((await api.load()).rows.length, 1);
  assert.equal(calls.length, 1, "cached");
  clock += RULES.cacheMs;
  reply = { error: "rate-limited" };
  const kept = await api.load();
  assert.deepEqual([calls.length, kept.ok, kept.rows.length], [2, true, 1], "a refused read answers the last good board");
  const cold = createBoardApi({ send: async () => ({ error: "no-token" }), now: () => clock });
  assert.deepEqual(await cold.load(), { ok: false, reason: "offline" });
  const thrown = createBoardApi({ send: async () => Promise.reject(new Error("network")), now: () => clock });
  assert.deepEqual(await thrown.load(), { ok: false, reason: "offline" });
  assert.deepEqual(await createBoardApi({ send: undefined }).load(), { ok: false, reason: "offline" });
});

test("the panel is hidden offline, opens on tap with the rows, marks you, and shows your rank when you are outside the rows", async () => {
  const doc = page();
  let online = false;
  const asked = [];
  const reply = board([row(1, "Survivor-0001", 900), row(2, "Survivor-0002", 300, { you: true })], { rank: 2, score: 300, kills: 3 });
  let clock = 1000;
  const view = createDailyBoard({ search: "", doc, request: async (op) => (asked.push(op), reply), online: () => online, watch: false, now: () => clock });
  assert.equal(doc.els["daily-board"].hidden, true, "offline: hidden");
  assert.equal(doc.els["daily-board-heading"].textContent, webText("board.heading"));
  online = true;
  view.sync();
  assert.equal(doc.els["daily-board"].hidden, false);
  assert.equal(doc.els["daily-board-panel"].hidden, true, "folded until tapped");
  assert.equal(doc.els["daily-board-open"].textContent, webText("board.open"));
  assert.deepEqual(asked, [], "no request until the player asks");
  doc.els["daily-board-open"].click();
  assert.equal(doc.els["daily-board-status"].textContent, webText("board.loading"));
  await flush();
  const list = doc.els["daily-board-list"];
  assert.deepEqual(names(list), ["Survivor-0001", `Survivor-0002 ${webText("board.you")}`]);
  assert.equal(list.children[1].classes.has("db-you"), true);
  assert.equal(list.children[0].children[2].textContent, webText("board.score", { score: 900 }));
  assert.equal(doc.els["daily-board-me"].textContent, "", "you are in the rows");
  assert.equal(doc.els["daily-board-open"].textContent, webText("board.close"));
  assert.equal(doc.els["daily-board-open"].attributes["aria-expanded"], "true");
  doc.els["daily-board-open"].click();
  assert.equal(doc.els["daily-board-panel"].hidden, true);
  // Outside the rows: the own line shows.
  reply.top[1].you = false;
  clock += RULES.cacheMs;
  view.sync();
  doc.els["daily-board-open"].click();
  await flush();
  assert.equal(doc.els["daily-board-me"].textContent, webText("board.me", { rank: 2, score: 300 }));
  view.dispose();
  assert.equal(doc.els["daily-board"].hidden, true);
});

test("an empty board, a failed read and the off switch each end in a friendly state", async () => {
  const doc = page();
  const view = createDailyBoard({ search: "", doc, request: async () => board([]), online: () => true, watch: false });
  doc.els["daily-board-open"].click();
  await flush();
  assert.equal(doc.els["daily-board-status"].textContent, webText("board.empty"));
  const failing = page();
  createDailyBoard({ search: "", doc: failing, request: async () => ({ error: "rate-limited" }), online: () => true, watch: false });
  failing.els["daily-board-open"].click();
  await flush();
  assert.equal(failing.els["daily-board-status"].textContent, webText("board.offline"));
  assert.equal(failing.els["daily-board-list"].children.length, 0);
  const off = page();
  const asked = [];
  createDailyBoard({ search: "?noboard=1", doc: off, request: async (op) => asked.push(op), online: () => true, watch: false });
  assert.equal(off.els["daily-board"].hidden, true);
  assert.deepEqual(asked, []);
  // A missing page (no markup) is inert, not a crash.
  assert.doesNotThrow(() => createDailyBoard({ search: "", doc: { getElementById: () => null }, online: () => true }).dispose());
  view.dispose();
});

test("a tap while the ask is out and a fold before the answer lands draws nothing stale", async () => {
  const doc = page();
  let release;
  const view = createDailyBoard({ search: "", doc, request: () => new Promise((resolve) => (release = resolve)), online: () => true, watch: false });
  doc.els["daily-board-open"].click();
  doc.els["daily-board-open"].click();
  release(board([row(1, "Late", 5)]));
  await flush();
  assert.equal(doc.els["daily-board-list"].children.length, 0, "folded before the answer: nothing drawn");
  view.dispose();
});
