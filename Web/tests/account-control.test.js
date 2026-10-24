import test from "node:test";
import assert from "node:assert/strict";
import { mountAccountControl, SIGN_IN_LABEL } from "../src/engine/account-control.js";

class Node {
  constructor(tag) {
    Object.assign(this, { tag, children: [], hidden: false, textContent: "", disabled: false, listeners: {}, attrs: {} });
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  addEventListener(type, fn) {
    this.listeners[type] = fn;
  }
  remove() {
    this.removed = true;
  }
}
function page() {
  const host = new Node("section");
  return { host, doc: { getElementById: (id) => (id === "menu-settings" ? host : null), createElement: (t) => new Node(t) } };
}
const find = (host, id) => host.children[0].children.find((n) => n.id === id);

test("a guest sees the sign-in button in the settings panel; a signed-in player does not", () => {
  const { host, doc } = page();
  const auth = { isGuest: true };
  const control = mountAccountControl({ doc, auth, location: {} });
  const wrap = host.children[0];
  assert.equal(find(host, "account-signin").textContent, SIGN_IN_LABEL);
  assert.equal(wrap.hidden, false);
  auth.isGuest = false;
  control.sync();
  assert.equal(wrap.hidden, true);
  control.dispose();
  assert.equal(wrap.removed, true);
});

test("clicking it goes to the Google link for this page; an unavailable link shows a message and re-enables the button", async () => {
  const { host, doc } = page();
  const assigned = [];
  let url = "https://accounts.google.com/x";
  const asked = [];
  const auth = {
    isGuest: true,
    googleLinkUrl: async (redirect) => (asked.push(redirect), url),
  };
  mountAccountControl({
    doc,
    auth,
    location: { origin: "https://playarmagedom.com", pathname: "/", assign: (u) => assigned.push(u) },
  });
  const button = find(host, "account-signin");
  await button.listeners.click();
  assert.deepEqual(asked, ["https://playarmagedom.com/"]);
  assert.deepEqual(assigned, ["https://accounts.google.com/x"]);
  url = null;
  await button.listeners.click();
  assert.equal(assigned.length, 1);
  assert.ok(find(host, "account-status").textContent.length > 0);
  assert.equal(button.disabled, false);
});

test("without a settings panel or without auth there is nothing to mount", () => {
  assert.equal(mountAccountControl({ doc: { getElementById: () => null }, auth: {}, location: {} }), null);
  assert.equal(mountAccountControl({ doc: page().doc, auth: null, location: {} }), null);
  assert.equal(mountAccountControl({ doc: undefined, auth: {}, location: {} }), null);
});
