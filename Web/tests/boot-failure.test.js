import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { installBootFailureFallback } from "../src/boot-failure.js";

function fakePage({ entryHidden = false, booted = false } = {}) {
  const listeners = new Map();
  const node = (extra = {}) => ({
    textContent: "",
    hidden: false,
    disabled: true,
    dataset: {},
    clicks: [],
    addEventListener(type, fn) {
      if (type === "click") this.clicks.push(fn);
    },
    ...extra,
  });
  const nodes = { entry: node({ hidden: entryHidden }), enter: node(), loading: node() };
  const reloads = [];
  const win = {
    __armagedomBooted: booted,
    document: { getElementById: (id) => nodes[id] ?? null },
    location: { reload: () => reloads.push(1) },
    addEventListener: (type, fn, capture) => listeners.set(type, { fn, capture }),
  };
  installBootFailureFallback(win);
  return { win, nodes, reloads, fire: (type, event) => listeners.get(type).fn(event), listeners };
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

test("a script element that fails to fetch is caught in the capture phase and named", () => {
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

test("after the game booted the button keeps its own handler and only the message changes", () => {
  const page = fakePage({ booted: true });
  page.fire("unhandledrejection", { reason: new Error("texture pack missing") });
  assert.match(page.nodes.loading.textContent, /texture pack missing/);
  assert.equal(page.nodes.enter.textContent, "Retry loading");
  assert.equal(page.nodes.enter.clicks.length, 0);
});

test("errors during a fight, with the entry card hidden, are left alone", () => {
  const page = fakePage({ entryHidden: true });
  page.fire("error", { message: "mid-fight" });
  assert.equal(page.nodes.loading.textContent, "");
  assert.equal(page.nodes.enter.textContent, "");
});

test("the fallback is its own module and loads before main.js", () => {
  const source = readFileSync(new URL("../src/boot-failure.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /^\s*import\s/m);
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const fallback = html.indexOf('src="/src/boot-failure.js"');
  assert.ok(fallback > 0 && fallback < html.indexOf('src="/src/main.js"'));
  const main = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  assert.match(main, /__armagedomBooted = true/);
});
