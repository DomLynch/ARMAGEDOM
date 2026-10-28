import test from "node:test";
import assert from "node:assert/strict";
import { GAME_DATA } from "../src/engine/game-data.js";
import { validateShareClip } from "../src/engine/game-data-share.js";
import { cropRect, createShareClip, shareEnabled } from "../src/engine/share-clip.js";
import { canEncode, drawBrand, encodeClip, pickType, stillBlob } from "../src/engine/share-encode.js";
import { webText } from "../src/engine/web-text.js";

const rows = GAME_DATA.shareClip;
const SOURCE = { width: 390, height: 844 };
const bad = (patch) => assert.throws(() => validateShareClip({ ...structuredClone(rows), ...patch }));

function fakeCanvas() {
  const calls = [];
  const ctx = new Proxy({ calls }, { get: (t, k) => (k in t ? t[k] : (...a) => calls.push([k, ...a])), set: (t, k, v) => ((t[k] = v), true) });
  return { width: 0, height: 0, calls, getContext: () => ctx, toBlob: (fn, type) => fn({ size: 8, type }) };
}
function rig(options = {}) {
  const made = [];
  const player = { hp: 100, maxHP: 100 };
  const clip = createShareClip({
    rows,
    search: options.search ?? "",
    tier: () => options.tier ?? "full",
    makeCanvas: () => {
      const c = fakeCanvas();
      made.push(c);
      return c;
    },
  });
  const game = { player };
  // Plays `seconds` of 60 Hz frames, feeding `events` on the first one.
  const play = (seconds, events = []) => {
    for (let i = 0; i < Math.round(seconds * 60); i++) {
      if (i === 0 && events.length) clip.observe(events, game);
      clip.capture(SOURCE, 1 / 60);
    }
  };
  return { clip, made, game, player, play };
}
const death = (player) => [{ type: "death", actor: player }];

test("the shipped row validates and bad rows are refused", () => {
  validateShareClip(structuredClone(rows));
  bad({ extra: 1 });
  bad({ shareUrl: "https://playarmagedom.com/?ref=me" });
  bad({ tiers: { ...rows.tiers, low: { fps: 4 } } });
  bad({ moments: rows.moments.filter((m) => m.trigger !== "playerDeath") });
  bad({ moments: rows.moments.map((m) => (m.id === "bossKill" ? { ...m, priority: 1 } : m)) });
  bad({ brand: { ...rows.brand, font: "bold sans-serif" } });
});

test("every moment has its card text and the link is the bare homepage with no player data", () => {
  for (const m of rows.moments) {
    assert.ok(webText(`share.moment.${m.id}`));
    const text = webText(`share.text.${m.id}`, { url: rows.shareUrl });
    assert.ok(text.endsWith(rows.shareUrl) || text.includes(rows.shareUrl));
  }
  assert.equal(rows.shareUrl, "https://playarmagedom.com/");
  assert.equal(new URL(rows.shareUrl).search, "");
});

test("?noshare=1 turns it off: no frames, no canvases, no moments", () => {
  assert.equal(shareEnabled(rows, "?noshare=1"), false);
  assert.equal(shareEnabled(rows, ""), true);
  assert.equal(shareEnabled(rows, "?noshare=0"), true);
  const r = rig({ search: "?noshare=1" });
  assert.equal(r.clip.enabled, false);
  r.play(3, death(r.player));
  r.play(3);
  assert.equal(r.made.length, 0);
  assert.deepEqual(r.clip.clips(), { death: null, best: null });
});

test("the ring holds about buffer.seconds of frames and no more, at the tier's rate", () => {
  const r = rig();
  r.play(60);
  const fps = rows.tiers.full.fps,
    cap = Math.ceil(((rows.buffer.seconds + 1.5) * fps) + 1);
  assert.ok(r.clip.size().ring <= cap, `${r.clip.size().ring} <= ${cap}`);
  assert.ok(r.clip.size().ring >= rows.buffer.seconds * fps, "at least the window is kept");
  assert.ok(r.made.length <= cap + 1, "canvases are pooled, not made per frame");
  const mid = rig({ tier: "mid" });
  mid.play(30);
  assert.ok(mid.clip.size().ring < r.clip.size().ring, "the mid tier samples less");
});

test("the player's death freezes the last ten seconds after its tail, with a still", () => {
  const r = rig();
  r.play(30);
  r.player.hp = 0;
  r.play(0.5, death(r.player));
  assert.equal(r.clip.clips().death, null, "the tail is still playing");
  r.play(1.5);
  const { death: clip } = r.clip.clips();
  assert.equal(clip.id, "death");
  const span = (clip.frames.at(-1).t - clip.frames[0].t) / 1000;
  assert.ok(span <= rows.buffer.seconds && span > rows.buffer.seconds - 1, `span ${span}`);
  assert.ok(Math.abs(clip.fps - rows.tiers.full.fps) < 1, `fps ${clip.fps}`);
  assert.equal(clip.still.width, rows.still.width);
  assert.equal(r.clip.size().ring, 0, "frozen: the ring is released");
  assert.equal(r.clip.size().frozen, true);
  r.clip.reset();
  assert.deepEqual(r.clip.clips(), { death: null, best: null });
  assert.ok(r.clip.size().pool > 0, "canvases return to the pool");
});

test("a boss kill, a big blast and a close escape each freeze a best moment; the higher priority wins", () => {
  const r = rig();
  r.play(12, [{ type: "grenade-blast", radius: 1.5 }]);
  r.play(2);
  assert.equal(r.clip.clips().best, null, "a small blast is not shareable");
  r.play(1, [{ type: "grenade-blast", radius: 3 }]);
  r.play(2);
  assert.equal(r.clip.clips().best.id, "bigBlast");
  r.play(1, [{ type: "death", actor: { bossProfile: {} } }]);
  r.play(2);
  assert.equal(r.clip.clips().best.id, "bossKill");
  r.play(1, [{ type: "grenade-blast", radius: 3 }]);
  r.play(20);
  assert.equal(r.clip.clips().best.id, "bossKill", "a lower moment never replaces a higher one");
});

test("a trash mob death is not a moment, and a cooldown stops the same moment firing twice", () => {
  const r = rig();
  r.play(5, [{ type: "death", actor: { pos: {} } }]);
  r.play(3);
  assert.equal(r.clip.clips().best, null);
  r.play(0.5, [{ type: "grenade-blast", radius: 3 }]);
  r.play(0.2, [{ type: "grenade-blast", radius: 3 }]);
  assert.equal(r.clip.size().pending, 1, "the second blast while one waits its tail adds nothing");
  r.play(2);
  r.play(1, [{ type: "grenade-blast", radius: 3 }]);
  assert.equal(r.clip.size().pending, 0, "inside the cooldown a blast is not a new moment");
});

test("a close escape fires only when the player survives the low-health spell", () => {
  const r = rig();
  r.play(8);
  r.player.hp = 15;
  r.play(0.1, [{ type: "hit", actor: r.player }]);
  r.play(rows.moments.find((m) => m.id === "closeEscape").surviveSeconds + 1);
  assert.equal(r.clip.clips().best.id, "closeEscape");
  const dies = rig();
  dies.play(8);
  dies.player.hp = 15;
  dies.play(0.1, [{ type: "hit", actor: dies.player }]);
  dies.player.hp = 0;
  dies.play(6);
  assert.equal(dies.clip.clips().best, null);
});

test("a boss kill and the death in the same step both keep their frames", () => {
  const r = rig();
  r.play(12);
  r.player.hp = 0;
  r.play(0.1, [...death(r.player), { type: "death", actor: { bossProfile: {} } }]);
  r.play(2);
  const { death: d, best } = r.clip.clips();
  assert.ok(d.frames.length > 1 && best.frames.length > 1);
});

test("the low tier keeps no ring: a death still gets a still to share", () => {
  const r = rig({ tier: "low" });
  r.play(20);
  assert.equal(r.clip.size().ring, 0);
  r.player.hp = 0;
  r.play(0.1, death(r.player));
  r.play(2);
  const { death: clip } = r.clip.clips();
  assert.equal(clip.frames.length, 0);
  assert.ok(clip.still);
});

test("a hidden tab clears the ring so no clip joins frames across the gap", () => {
  const r = rig();
  r.play(5);
  r.clip.gap();
  assert.equal(r.clip.size().ring, 0);
});

test("cropRect crops to the clip's aspect on a phone and on a wide screen", () => {
  const aspect = rows.buffer.width / rows.buffer.height;
  const tall = cropRect(390, 844, aspect);
  assert.equal(tall.w, 390);
  assert.ok(Math.abs(tall.w / tall.h - aspect) < 0.01);
  const wide = cropRect(1280, 720, aspect);
  assert.equal(wide.h, 720);
  assert.ok(Math.abs(wide.w / wide.h - aspect) < 0.01);
});

// ---------- encode ----------
class FakeRecorder {
  static types = ["video/webm"];
  static isTypeSupported = (t) => FakeRecorder.types.includes(t);
  static throwOnStart = false;
  constructor(stream, options) {
    this.options = options;
    this.state = "inactive";
  }
  start() {
    if (FakeRecorder.throwOnStart) throw new Error("refused");
    this.state = "recording";
  }
  stop() {
    this.state = "inactive";
    this.ondataavailable({ data: { size: 4 } });
    this.onstop();
  }
}
const stream = () => ({ getVideoTracks: () => [{ requestFrame() {} }], getTracks: () => [{ stop() {} }] });
const frames = (n) => Array.from({ length: n }, (_, i) => ({ canvas: Object.assign(fakeCanvas(), { width: 180, height: 320 }), t: i * 125 }));
const env = (extra = {}) => ({
  MediaRecorderClass: FakeRecorder,
  makeCanvas: () => Object.assign(fakeCanvas(), { captureStream: stream }),
  later: (fn) => fn(),
  ...extra,
});
globalThis.Blob ??= class {};

test("pickType takes the first supported type, MP4 before WebM, and survives a throwing probe", () => {
  assert.equal(pickType(rows.encode.types, (t) => t.startsWith("video/mp4")), "video/mp4;codecs=avc1");
  assert.equal(pickType(rows.encode.types, (t) => t === "video/webm"), "video/webm");
  assert.equal(pickType(rows.encode.types, () => false), null);
  assert.equal(pickType(rows.encode.types, () => { throw new Error("no"); }), null);
});

test("canEncode is false where MediaRecorder or captureStream is missing (the PNG fallback)", () => {
  assert.equal(canEncode(rows, {}), false);
  assert.equal(canEncode(rows, { MediaRecorder: FakeRecorder, HTMLCanvasElement: { prototype: {} } }), false);
  assert.equal(canEncode(rows, { MediaRecorder: FakeRecorder, HTMLCanvasElement: { prototype: { captureStream() {} } } }), true);
  const none = class { static isTypeSupported = () => false; };
  assert.equal(canEncode(rows, { MediaRecorder: none, HTMLCanvasElement: { prototype: { captureStream() {} } } }), false);
});

test("encodeClip replays the frames and resolves one file; refusals and short clips resolve null", async () => {
  const clip = { frames: frames(6), fps: 8 };
  const result = await encodeClip(rows, clip, "line", { cancelled: false }, env());
  assert.equal(result.type, "video/webm");
  assert.equal(rows.encode.bitsPerSecond, 1200000);
  FakeRecorder.throwOnStart = true;
  assert.equal(await encodeClip(rows, clip, "line", { cancelled: false }, env()), null);
  FakeRecorder.throwOnStart = false;
  assert.equal(await encodeClip(rows, { frames: frames(1), fps: 8 }, "line", { cancelled: false }, env()), null);
  assert.equal(await encodeClip(rows, clip, "line", { cancelled: true }, env()), null);
  FakeRecorder.types = [];
  assert.equal(await encodeClip(rows, clip, "line", { cancelled: false }, env()), null);
  FakeRecorder.types = ["video/webm"];
});

test("the still fallback is a PNG with the brand strip", async () => {
  const blob = await stillBlob(rows, fakeCanvas(), "ARMAGEDOM", fakeCanvas);
  assert.equal(blob.type, rows.files.image);
  const canvas = fakeCanvas();
  drawBrand(canvas.getContext(), 100, 200, rows.brand, "ARMAGEDOM");
  assert.ok(canvas.calls.some(([k, , , , h]) => k === "fillRect" && h === Math.round((200 * rows.brand.barPct) / 100)));
  assert.ok(canvas.calls.some(([k, text]) => k === "fillText" && text === "ARMAGEDOM"));
});
