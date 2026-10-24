import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";

const indexUrl = new URL("../index.html", import.meta.url);
const distUrl = new URL("../dist/", import.meta.url);

function inlineScript(html) {
  const match = /<script id="boot-failure">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(match, "boot-failure inline script present");
  return match[1];
}

// Runs the real inline script from index.html against a fake window and entry card.
function fakePage({ entryHidden = false, booted = false, readyState = "complete" } = {}) {
  const listeners = new Map();
  const node = (extra = {}) => ({
    textContent: "",
    hidden: false,
    disabled: true,
    attributes: {},
    clicks: [],
    getAttribute(name) {
      return this.attributes[name] ?? null;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
    addEventListener(type, fn) {
      if (type === "click") this.clicks.push(fn);
    },
    ...extra,
  });
  const nodes = { entry: node({ hidden: entryHidden }), enter: node(), loading: node() };
  const reloads = [];
  const win = {
    __armagedomBooted: booted,
    location: { reload: () => reloads.push(1) },
    addEventListener: (type, fn, capture) => listeners.set(type, { fn, capture }),
  };
  const docListeners = new Map();
  const doc = {
    readyState,
    getElementById: (id) => nodes[id] ?? null,
    addEventListener: (type, fn) => docListeners.set(type, fn),
  };
  new Function("window", "document", inlineScript(readFileSync(indexUrl, "utf8")))(win, doc);
  return {
    nodes,
    reloads,
    listeners,
    docListeners,
    fire: (type, event) => listeners.get(type).fn(event),
  };
}

test("a failed game module import shows a message and a Retry that reloads", async () => {
  const page = fakePage();
  const failure = await import("../src/does-not-exist-boot-probe.js").catch((error) => error);
  assert.ok(failure instanceof Error);
  page.fire("unhandledrejection", { reason: failure });
  assert.match(page.nodes.loading.textContent, /^Could not load the game: .+Check your connection and retry\.$/);
  assert.equal(page.nodes.enter.textContent, "Retry loading");
  assert.equal(page.nodes.enter.disabled, false);
  page.nodes.enter.clicks[0]();
  assert.equal(page.reloads.length, 1);
});

test("a script element that fails to download is caught in the capture phase and named", () => {
  const page = fakePage();
  assert.equal(page.listeners.get("error").capture, true);
  page.fire("error", { target: { src: "https://example.test/assets/index-abc.js" } });
  assert.match(page.nodes.loading.textContent, /could not fetch https:\/\/example\.test\/assets\/index-abc\.js/);
  assert.equal(page.nodes.enter.textContent, "Retry loading");
});

test("repeated failures add one reload handler, not one per error", () => {
  const page = fakePage();
  page.fire("error", { message: "first" });
  page.fire("error", { message: "second" });
  assert.equal(page.nodes.enter.clicks.length, 1);
  assert.match(page.nodes.loading.textContent, /second/);
});

test("a failure that arrives before the entry card is parsed is shown once the page has loaded", () => {
  const page = fakePage({ readyState: "loading" });
  page.fire("error", { target: { src: "https://example.test/assets/index-abc.js" } });
  assert.equal(page.nodes.loading.textContent, "");
  page.docListeners.get("DOMContentLoaded")();
  assert.match(page.nodes.loading.textContent, /could not fetch/);
  assert.equal(page.nodes.enter.textContent, "Retry loading");
});

test("after the game booted the fallback leaves the message and the Retry button alone", () => {
  const page = fakePage({ booted: true });
  page.fire("unhandledrejection", { reason: new Error("texture pack missing") });
  assert.equal(page.nodes.loading.textContent, "");
  assert.equal(page.nodes.enter.textContent, "");
  assert.equal(page.nodes.enter.disabled, true);
  assert.equal(page.nodes.enter.clicks.length, 0);
});

test("errors with the entry card hidden are left alone", () => {
  const page = fakePage({ entryHidden: true });
  page.fire("error", { message: "mid-fight" });
  assert.equal(page.nodes.loading.textContent, "");
  assert.equal(page.nodes.enter.textContent, "");
});

test("the fallback is a classic inline script before the module tag, and main.js marks the boot", () => {
  const html = readFileSync(indexUrl, "utf8");
  const fallback = html.indexOf('<script id="boot-failure">');
  const moduleTag = html.indexOf('<script type="module"');
  assert.ok(fallback > 0 && fallback < moduleTag);
  assert.doesNotMatch(inlineScript(html), /\b(import|export)\b\s*[{(*\w]/);
  assert.match(readFileSync(new URL("../src/main.js", import.meta.url), "utf8"), /__armagedomBooted = true/);
});

// The packaged build is what players download. Vite bundles module scripts, so check the
// output: the fallback must be in dist/index.html itself and absent from the game bundle.
test(
  "packaged build: fallback stays inline in dist/index.html, outside the game bundle",
  { skip: !existsSync(new URL("index.html", distUrl)) && "run npm run build first" },
  () => {
    const html = readFileSync(new URL("index.html", distUrl), "utf8");
    const bundles = readdirSync(new URL("assets/", distUrl)).filter((name) => /^index-.*\.js$/.test(name));
    assert.ok(bundles.length >= 1);
    assert.ok(html.indexOf('id="boot-failure"') >= 0);
    assert.ok(html.indexOf('id="boot-failure"') < html.indexOf('type="module"'));
    for (const name of bundles) {
      const bundle = readFileSync(new URL("assets/" + name, distUrl), "utf8");
      assert.ok(!bundle.includes("Could not load the game"), name + " must not contain the fallback");
    }
  },
);
