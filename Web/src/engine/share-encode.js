// Viral death cam, the encode half. Borrowed from Frankendom 1 (DomLynch frankendom, src/clip.ts @ 8e376b781, "Export clip"): a plain
// canvas.captureStream + MediaRecorder with the first type the browser records (MP4 where it can: iOS Safari, recent Chrome; WebM
// elsewhere), a 2D canvas as the stream source (a WebGL canvas stream is unreliable on iOS), and a recorder that may throw on start,
// in which case the caller falls back to a still. Differences: the frames come from the ring (share-clip.js), replayed in real time,
// and there is no game audio. Nothing here uploads anything.
import { GAME_DATA } from "./game-data.js";

export const pickType = (types, supported) =>
  types.find((type) => {
    try {
      return supported(type);
    } catch {
      return false;
    }
  }) ?? null;

export const canEncode = (rows = GAME_DATA.shareClip, env = globalThis) =>
  typeof env.MediaRecorder !== "undefined" &&
  typeof env.HTMLCanvasElement !== "undefined" &&
  "captureStream" in env.HTMLCanvasElement.prototype &&
  pickType(rows.encode.types, (type) => env.MediaRecorder.isTypeSupported(type)) !== null;

export const fileName = (rows, id, mime) => `${rows.files.prefix}${id}.${rows.files.extensions[mime]}`;

// The brand strip along the bottom of every frame and of the still: the amber rule, then the name and the homepage.
export function drawBrand(ctx, width, height, brand, line) {
  const bar = Math.round((height * brand.barPct) / 100),
    top = height - bar;
  ctx.fillStyle = brand.background;
  ctx.fillRect(0, top, width, bar);
  ctx.fillStyle = brand.accent;
  ctx.fillRect(0, top, width, brand.rulePx);
  ctx.font = brand.font.replace("{px}", String(Math.round((height * brand.fontPct) / 100)));
  ctx.fillStyle = brand.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(line, width >> 1, top + (bar >> 1) + brand.rulePx, (width * brand.maxWidthPct) / 100);
}

// The still as a PNG blob with the brand strip (the fallback where a clip cannot be recorded, and the share image).
export function stillBlob(rows, still, line, makeCanvas = () => globalThis.document.createElement("canvas")) {
  const canvas = makeCanvas();
  canvas.width = still.width;
  canvas.height = still.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(still, 0, 0);
  drawBrand(ctx, canvas.width, canvas.height, rows.brand, line);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), rows.files.image));
}

// Replays the frozen frames in real time through a 2D canvas into a MediaRecorder. Resolves { blob, type } or null (cancelled, no
// frames, a recorder that refused or errored). `token.cancelled = true` stops it. Throws nothing.
export function encodeClip(rows, clip, line, token = { cancelled: false }, env = {}) {
  const { MediaRecorderClass = globalThis.MediaRecorder, makeCanvas = () => globalThis.document.createElement("canvas"), later = setTimeout } = env;
  return new Promise((resolve) => {
    const frames = clip.frames,
      type = pickType(rows.encode.types, (t) => MediaRecorderClass.isTypeSupported(t));
    if (!type || frames.length < rows.encode.minFrames || !(clip.fps > 0)) return resolve(null);
    const out = makeCanvas(),
      first = frames[0].canvas;
    out.width = first.width;
    out.height = first.height;
    const ctx = out.getContext("2d"),
      stream = out.captureStream(clip.fps),
      track = stream.getVideoTracks()[0],
      chunks = [];
    let recorder,
      failed = false,
      next = 0;
    const stopTracks = () => stream.getTracks().forEach((t) => t.stop());
    try {
      recorder = new MediaRecorderClass(stream, { mimeType: type, videoBitsPerSecond: rows.encode.bitsPerSecond });
      recorder.ondataavailable = (event) => event.data?.size && chunks.push(event.data);
      recorder.onerror = () => {
        failed = true;
      };
      recorder.onstop = () => {
        stopTracks();
        resolve(!token.cancelled && !failed && chunks.length ? { blob: new Blob(chunks, { type: type.split(";")[0] }), type: type.split(";")[0] } : null);
      };
      recorder.start(rows.encode.timesliceMs);
    } catch {
      stopTracks();
      return resolve(null);
    }
    const finish = () => (recorder.state === "inactive" ? recorder.onstop() : recorder.stop());
    const step = () => {
      if (token.cancelled || failed) return finish();
      if (next >= frames.length) return void later(finish, rows.encode.holdSeconds * 1000);
      ctx.drawImage(frames[next++].canvas, 0, 0);
      drawBrand(ctx, out.width, out.height, rows.brand, line);
      track?.requestFrame?.();
      later(step, 1000 / clip.fps);
    };
    step();
  });
}
