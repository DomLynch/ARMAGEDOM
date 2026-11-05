// A tiny DOM for the HUD-option tests (ui-scale, colour-blind, heat-dial): elements with children, classes, attributes, inline styles,
// listeners, an insertion point for `after`, and a document that finds elements by id.
export function fakeElement(tag = "div") {
  const classes = new Set(),
    listeners = new Map(),
    el = {
      tag,
      id: "",
      value: "",
      hidden: false,
      textContent: "",
      children: [],
      attributes: {},
      parent: null,
      removed: false,
      style: {
        props: {},
        setProperty(name, value) {
          this.props[name] = value;
        },
        removeProperty(name) {
          delete this.props[name];
        },
      },
      classList: {
        add: (n) => classes.add(n),
        remove: (n) => classes.delete(n),
        contains: (n) => classes.has(n),
        toggle(n, force) {
          const on = force === undefined ? !classes.has(n) : !!force;
          if (on) classes.add(n);
          else classes.delete(n);
          return on;
        },
      },
      get className() {
        return [...classes].join(" ");
      },
      set className(value) {
        classes.clear();
        for (const n of String(value).split(/\s+/).filter(Boolean)) classes.add(n);
      },
      setAttribute(name, value) {
        el.attributes[name] = String(value);
      },
      append(...nodes) {
        for (const n of nodes) {
          n.parent = el;
          el.children.push(n);
        }
      },
      after(node) {
        const list = el.parent?.children;
        if (!list) return;
        node.parent = el.parent;
        list.splice(list.indexOf(el) + 1, 0, node);
      },
      remove() {
        el.removed = true;
        if (el.parent) el.parent.children.splice(el.parent.children.indexOf(el), 1);
      },
      get parentElement() {
        return el.parent;
      },
      addEventListener(type, fn) {
        listeners.set(type, [...(listeners.get(type) ?? []), fn]);
      },
      removeEventListener(type, fn) {
        listeners.set(
          type,
          (listeners.get(type) ?? []).filter((f) => f !== fn),
        );
      },
      fire(type) {
        for (const fn of listeners.get(type) ?? []) fn();
      },
      listenerCount: (type) => (listeners.get(type) ?? []).length,
    };
  return el;
}

// A page with the elements the options look for: #menu-settings holding a View row, #hud-top holding #run-hud, and the body.
export function fakeOptionsDoc({ bodyClasses = [] } = {}) {
  const byId = new Map(),
    reg = (el, id) => {
      el.id = id;
      byId.set(id, el);
      return el;
    },
    body = fakeElement("body"),
    root = fakeElement("html"),
    settings = reg(fakeElement("section"), "menu-settings"),
    viewRow = fakeElement("div"),
    view = reg(fakeElement("select"), "view-preset"),
    top = reg(fakeElement("div"), "hud-top"),
    runHud = reg(fakeElement("p"), "run-hud");
  for (const c of bodyClasses) body.classList.add(c);
  viewRow.append(view);
  settings.append(viewRow);
  top.append(runHud);
  const find = (nodes, id) => {
    for (const n of nodes) {
      if (n.id === id) return n;
      const hit = find(n.children, id);
      if (hit) return hit;
    }
    return null;
  };
  const doc = {
    body,
    documentElement: root,
    getElementById: (id) => byId.get(id) ?? find([settings, top], id),
    createElement: (tag) => fakeElement(tag),
  };
  return { doc, body, root, settings, viewRow, top, runHud, reg };
}

// A localStorage stand-in; `broken` throws on every access, as a locked-down browser does.
export function fakeStorage({ broken = false, seed = {} } = {}) {
  const store = new Map(Object.entries(seed));
  return {
    store,
    getItem(key) {
      if (broken) throw new Error("storage blocked");
      return store.get(key) ?? null;
    },
    setItem(key, value) {
      if (broken) throw new Error("storage blocked");
      store.set(key, String(value));
    },
  };
}
