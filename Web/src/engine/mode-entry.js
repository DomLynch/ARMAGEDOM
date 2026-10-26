import { createBrowserSession } from "./browser-session.js";
import { assertSession } from "./contracts.js";
import { createCommanderSession } from "./commander/session.js";
import { sessionText } from "./session-text.js";

export function createModeEntry() {
  let current = null,
    mode = "entry",
    busy = false,
    generation = 0,
    disposed = false;
  const byId = (id) => document.getElementById(id),
    listeners = [];
  const listen = (node, type, fn) => {
    node.addEventListener(type, fn);
    listeners.push(() => node.removeEventListener(type, fn));
  };
  function showEntry() {
    byId("entry").hidden = false;
    byId("hud").hidden = true;
    byId("commander-hud").hidden = true;
    byId("commander-result").hidden = true;
    byId("hit-marker").hidden = true;
    byId("mode-cancel").hidden = true;
    byId("enter").disabled = byId("enter-ai").disabled = false;
    byId("enter").textContent = sessionText("mode.playHuman");
    byId("loading").textContent = sessionText("mode.choose");
    document.body.classList.remove("commander-mode", "menu-open");
  }
  function back() {
    generation++;
    busy = false;
    const old = current;
    current = null;
    mode = "entry";
    const menu = byId("menu");
    if (menu.open) menu.close();
    old?.dispose();
    showEntry();
  }
  async function launch(next) {
    if (disposed || busy) return;
    busy = true;
    const token = ++generation;
    const old = current;
    current = null;
    old?.dispose();
    mode = next;
    byId("enter").disabled = byId("enter-ai").disabled = true;
    byId("mode-cancel").hidden = false;
    try {
      current =
        next === "human"
          ? assertSession(createBrowserSession({ prewarm: false }))
          : createCommanderSession({ canvas: byId("world"), baseUrl: new URL("./", document.baseURI), onMenu: back });
      await current.start();
      if (token === generation) byId("mode-cancel").hidden = true;
    } catch (error) {
      if (token === generation) {
        const failed = current;
        current = null;
        mode = "entry";
        failed?.dispose();
        showEntry();
        byId("loading").textContent = sessionText("mode.startFailed", {
          mode: sessionText(next === "human" ? "mode.modeHuman" : "mode.modeCommander"),
          error: error.message,
        });
      }
    } finally {
      if (token === generation) {
        busy = false;
        if (mode === "entry") byId("enter").disabled = byId("enter-ai").disabled = false;
      }
    }
  }
  listen(byId("enter"), "click", () => {
    launch("human");
  });
  listen(byId("enter-ai"), "click", () => {
    launch("commander");
  });
  listen(byId("mode-menu"), "click", back);
  listen(byId("mode-cancel"), "click", back);
  showEntry();
  return Object.freeze({
    get mode() {
      return mode;
    },
    get activeSession() {
      return current;
    },
    back,
    dispose() {
      if (disposed) return;
      disposed = true;
      back();
      for (const remove of listeners) remove();
      listeners.length = 0;
    },
  });
}
