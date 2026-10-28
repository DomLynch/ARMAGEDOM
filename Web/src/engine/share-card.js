// Viral death cam, the SHARE card on the death screen (index.html #share-card). Look and feel from Frankendom 1's end-screen SHARE/CLIP
// pair (icon + label, one tap, "Shared." / "Link copied." confirmations that clear after 2 s); it lives inside the #ending card.
// The thumbnails are the frozen moments (share-clip.js); the file is made once the card shows, so the tap that shares it is a fresh
// gesture. Share clip = Web Share API with the file where the browser allows it, else a download; Copy link = the homepage, nothing else.
import { GAME_DATA } from "./game-data.js";
import { webText } from "./web-text.js";
import { canEncode, encodeClip, fileName, stillBlob } from "./share-encode.js";

const inert = { sync() {}, dispose() {} };

export function createShareCard({
  share,
  rows = GAME_DATA.shareClip,
  doc = globalThis.document,
  nav = globalThis.navigator,
  env = {},
}) {
  const el = (id) => (typeof doc?.getElementById === "function" ? doc.getElementById(id) : null),
    card = el("share-card"),
    picks = el("share-picks"),
    status = el("share-status"),
    send = el("share-send"),
    link = el("share-link");
  if (!share.enabled || !card || !picks || !status || !send || !link) return inert;
  const { later = setTimeout, makeFile = (parts, name, type) => new File(parts, name, { type }), clear = clearTimeout } = env,
    prepared = new Map();
  let shown = false,
    chosen = false,
    selected = null,
    token = { cancelled: false },
    queue = Promise.resolve(),
    unsubscribe = null,
    statusTimer = null;

  const say = (text, confirmation = false) => {
    clear(statusTimer);
    status.textContent = text ?? "";
    if (confirmation) statusTimer = later(() => say(null), rows.card.statusSeconds * 1000);
  };
  const line = () => webText("share.brand"),
    moment = (id) => rows.moments.find((m) => m.id === id); // each moment's label and share text are data rows

  // One file per frozen moment: a recorded clip where the browser records one, else the branded still as a PNG.
  async function make(clip) {
    try {
      if (canEncode(rows, env.window) && clip.frames.length >= rows.encode.minFrames) {
        const result = await encodeClip(rows, clip, line(), token, env);
        if (result) return { kind: "clip", file: makeFile([result.blob], fileName(rows, clip.id, result.type), result.type) };
      }
      if (token.cancelled) return null;
      const blob = await stillBlob(rows, clip.still, line(), env.makeCanvas);
      return blob ? { kind: "image", file: makeFile([blob], fileName(rows, clip.id, rows.files.image), rows.files.image) } : null;
    } catch {
      return null; // the queue must go on: the card says it could not be made
    }
  }
  function prepare(clip) {
    if (!prepared.has(clip)) prepared.set(clip, (queue = queue.then(() => make(clip))));
    return prepared.get(clip);
  }
  async function choose(clip) {
    selected = clip;
    send.disabled = true;
    for (const pick of picks.children) pick.setAttribute("aria-pressed", String(pick.dataset.id === clip.id));
    say(webText("share.making"));
    const made = await prepare(clip);
    if (selected !== clip || !shown) return;
    if (!made) return say(webText("share.failed"));
    el("share-send-label").textContent = webText(made.kind === "clip" ? "share.button.clip" : "share.button.image");
    send.disabled = false;
    say(made.kind === "clip" ? webText("share.ready") : webText("share.stillOnly"));
  }
  function render() {
    const { death, best } = share.clips(),
      list = [death, best].filter(Boolean);
    picks.replaceChildren();
    for (const clip of list) {
      const pick = doc.createElement("button"),
        thumb = doc.createElement("canvas"),
        label = doc.createElement("span");
      pick.type = "button";
      pick.className = "share-pick";
      pick.dataset.id = clip.id;
      pick.setAttribute("aria-label", webText("share.pick", { moment: moment(clip.id).label }));
      thumb.width = rows.buffer.width;
      thumb.height = rows.buffer.height;
      thumb.getContext("2d").drawImage(clip.still, 0, 0, thumb.width, thumb.height);
      label.textContent = moment(clip.id).label;
      pick.append(thumb, label);
      pick.onclick = () => {
        chosen = true;
        void choose(clip);
      };
      picks.append(pick);
    }
    // Nothing is made until the death is frozen (its tail is still playing): the death is the default, and a boss kill or blast
    // earlier in the life is one tap away.
    if (!death) return say(webText("share.making"));
    void choose(chosen && list.includes(selected) ? selected : death);
  }
  function download(file) {
    const a = doc.createElement("a"),
      url = URL.createObjectURL(file);
    a.href = url;
    a.download = file.name;
    a.click();
    later(() => URL.revokeObjectURL(url), rows.card.revokeSeconds * 1000);
  }
  send.onclick = async () => {
    const made = selected ? await prepared.get(selected) : null;
    if (!made) return say(webText("share.failed"));
    const row = moment(selected.id),
      data = { files: [made.file], title: row.label, text: row.text.replace("{url}", rows.shareUrl) };
    if (nav?.share && nav.canShare?.({ files: data.files })) {
      try {
        await nav.share(data);
        say(webText("share.shared"), true);
      } catch (error) {
        if (error?.name !== "AbortError") say(webText("share.failed"), true); // dismissed is not an error
      }
      return;
    }
    download(made.file);
    say(webText("share.saved"), true);
  };
  link.onclick = async () => {
    try {
      await nav.clipboard.writeText(rows.shareUrl);
      return say(webText("share.copied"), true);
    } catch {
      const area = doc.createElement("textarea");
      area.value = rows.shareUrl;
      doc.body.append(area);
      area.select();
      const ok = !!doc.execCommand?.("copy");
      area.remove();
      say(ok ? webText("share.copied") : webText("share.failed"), true);
    }
  };

  function show() {
    shown = true;
    token = { cancelled: false };
    card.hidden = false;
    el("share-heading").textContent = webText("share.heading");
    el("share-send-label").textContent = webText("share.button.clip");
    el("share-link-label").textContent = webText("share.button.link");
    unsubscribe = share.subscribe(render);
    render();
  }
  function hide() {
    shown = false;
    token.cancelled = true; // an encode still running stops before the frames it reads are reused
    unsubscribe?.();
    card.hidden = true;
    picks.replaceChildren();
    prepared.clear();
    queue = Promise.resolve();
    selected = null;
    chosen = false;
    say(null);
    share.reset();
  }
  return {
    // Called every frame: `dead` is the death screen being up. The card shows with it and goes (and the ring resets) with it.
    sync(dead) {
      if (dead && !shown) show();
      else if (!dead && shown) hide();
    },
    dispose: () => shown && hide(),
  };
}
