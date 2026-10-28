import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { createShareClip } from "../src/engine/share-clip.js";
import { createShareCard } from "../src/engine/share-card.js";
import { webText } from "../src/engine/web-text.js";

const rows = GAME_DATA.shareClip;

function fakeCanvas() {
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  return { width: 0, height: 0, getContext: () => ctx, toBlob: (fn, type) => fn({ size: 8, type }), captureStream: () => stream() };
}
const stream = () => ({ getVideoTracks: () => [{ requestFrame() {} }], getTracks: () => [{ stop() {} }] });
function fakeElement(tag = "div") {
  const el = {
    tag,
    hidden: false,
    disabled: false,
    textContent: "",
    dataset: {},
    attrs: {},
    children: [],
    clicks: 0,
    append(...nodes) {
      el.children.push(...nodes);
    },
    replaceChildren(...nodes) {
      el.children = nodes;
    },
    setAttribute(k, v) {
      el.attrs[k] = v;
    },
    click() {
      el.clicks++;
    },
    remove() {},
    select() {},
    ...(tag === "canvas" ? fakeCanvas() : {}),
  };
  return el;
}
function fakeDoc() {
  const ids = ["share-card", "share-picks", "share-status", "share-send", "share-link", "share-heading", "share-send-label", "share-link-label"];
  const map = Object.fromEntries(ids.map((id) => [id, fakeElement(id === "share-send" || id === "share-link" ? "button" : "div")]));
  map["share-card"].hidden = true;
  const made = [];
  return {
    map,
    made,
    body: fakeElement(),
    getElementById: (id) => map[id] ?? null,
    createElement: (tag) => {
      const el = fakeElement(tag);
      made.push(el);
      return el;
    },
    execCommand: () => true,
  };
}
class Recorder {
  static isTypeSupported = (t) => t === "video/mp4";
  constructor() {
    this.state = "inactive";
  }
  start() {
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable({ data: { size: 4 } });
    this.onstop();
  }
}
const withEncoder = { HTMLCanvasElement: { prototype: { captureStream() {} } }, MediaRecorder: Recorder };
const envFor = (window) => ({
  window,
  MediaRecorderClass: Recorder,
  makeCanvas: fakeCanvas,
  makeFile: (parts, name, type) => ({ parts, name, type }),
  later: (fn, ms) => (ms >= rows.card.statusSeconds * 1000 ? 0 : fn()),
});
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function scene({ window = withEncoder, nav = {}, tier = "full", search = "" } = {}) {
  const doc = fakeDoc(),
    player = { hp: 100, maxHP: 100 },
    share = createShareClip({ rows, search, tier: () => tier, makeCanvas: fakeCanvas }),
    card = createShareCard({ share, rows, doc, nav, env: envFor(window) });
  const play = (seconds, events = []) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      if (i === 0 && events.length) share.observe(events, { player });
      share.capture({ width: 390, height: 844 }, 1 / 60);
    }
  };
  const die = async () => {
    play(12);
    player.hp = 0;
    play(0.1, [{ type: "death", actor: player }]);
    card.sync(true);
    play(2);
    await settle();
    await settle();
  };
  return { doc, share, card, nav, play, die, player };
}

test("the card shows on the death screen, makes the clip and shares it with the homepage link", async () => {
  const shared = [];
  const s = scene({ nav: { canShare: () => true, share: async (d) => shared.push(d) } });
  s.card.sync(true);
  assert.equal(s.doc.map["share-card"].hidden, false);
  assert.equal(s.doc.map["share-status"].textContent, webText("share.making"));
  await s.die();
  assert.equal(s.doc.map["share-picks"].children.length, 1);
  assert.equal(s.doc.map["share-send"].disabled, false);
  assert.equal(s.doc.map["share-send-label"].textContent, webText("share.button.clip"));
  await s.doc.map["share-send"].onclick();
  assert.equal(shared.length, 1);
  assert.equal(shared[0].files[0].type, "video/mp4");
  assert.match(shared[0].files[0].name, /^armagedom-death\.mp4$/);
  assert.ok(shared[0].text.endsWith(rows.shareUrl));
  assert.equal(s.doc.map["share-status"].textContent, webText("share.shared"));
});

test("a browser that cannot record falls back to a PNG still, saved when it cannot share files", async () => {
  const s = scene({ window: {}, nav: {} });
  const urls = [];
  globalThis.URL.createObjectURL = (f) => (urls.push(f), "blob:x");
  await s.die();
  assert.equal(s.doc.map["share-send-label"].textContent, webText("share.button.image"));
  assert.equal(s.doc.map["share-status"].textContent, webText("share.stillOnly"));
  await s.doc.map["share-send"].onclick();
  assert.equal(urls[0].type, rows.files.image);
  assert.equal(urls[0].name, "armagedom-death.png");
  assert.equal(s.doc.map["share-status"].textContent, webText("share.saved"));
});

test("the low tier has no ring: the card still offers the still", async () => {
  const s = scene({ tier: "low" });
  await s.die();
  assert.equal(s.doc.map["share-send-label"].textContent, webText("share.button.image"));
  assert.equal(s.doc.map["share-send"].disabled, false);
});

test("a dismissed share sheet is not an error; a refused one says so", async () => {
  const abort = Object.assign(new Error("x"), { name: "AbortError" });
  const s = scene({ nav: { canShare: () => true, share: async () => Promise.reject(abort) } });
  await s.die();
  await s.doc.map["share-send"].onclick();
  assert.notEqual(s.doc.map["share-status"].textContent, webText("share.failed"));
  const t = scene({ nav: { canShare: () => true, share: async () => Promise.reject(new Error("no")) } });
  await t.die();
  await t.doc.map["share-send"].onclick();
  assert.equal(t.doc.map["share-status"].textContent, webText("share.failed"));
});

test("Copy link copies the bare homepage, and falls back to execCommand", async () => {
  const written = [];
  const s = scene({ nav: { clipboard: { writeText: async (t) => written.push(t) } } });
  await s.doc.map["share-link"].onclick();
  assert.deepEqual(written, [rows.shareUrl]);
  assert.equal(s.doc.map["share-status"].textContent, webText("share.copied"));
  const t = scene({ nav: { clipboard: { writeText: async () => Promise.reject(new Error("blocked")) } } });
  await t.doc.map["share-link"].onclick();
  assert.equal(t.doc.map["share-status"].textContent, webText("share.copied"));
});

test("a boss kill earlier in the life is one tap away, and the death stays the default", async () => {
  const s = scene({ nav: { canShare: () => true, share: async () => {} } });
  s.play(12);
  s.play(0.1, [{ type: "death", actor: { bossProfile: {} } }]);
  s.play(2);
  await s.die();
  const picks = s.doc.map["share-picks"].children;
  assert.deepEqual(
    picks.map((p) => p.dataset.id),
    ["death", "bossKill"],
  );
  assert.equal(picks[0].attrs["aria-pressed"], "true");
  picks[1].onclick();
  await settle();
  await settle();
  assert.equal(picks[1].attrs["aria-pressed"], "true");
});

test("leaving the death screen hides the card and clears the clips", async () => {
  const s = scene();
  await s.die();
  s.card.sync(false);
  assert.equal(s.doc.map["share-card"].hidden, true);
  assert.deepEqual(s.share.clips(), { death: null, best: null });
});

test("?noshare=1: the card never shows", () => {
  const s = scene({ search: "?noshare=1" });
  s.card.sync(true);
  assert.equal(s.doc.map["share-card"].hidden, true);
});
