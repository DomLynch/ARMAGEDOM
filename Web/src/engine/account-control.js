// The one account control in the field menu (settings panel): "Sign in with Google to keep progress", shown only to a guest of the
// live world. Built from the session when the world flag is on, so the static page and the HUD are untouched with it off.
export const SIGN_IN_LABEL = "Sign in with Google to keep progress";

export function mountAccountControl({ doc = globalThis.document, auth, location = globalThis.location }) {
  const host = doc?.getElementById?.("menu-settings");
  if (!host || !auth) return null;
  const wrap = doc.createElement("div"),
    button = doc.createElement("button"),
    status = doc.createElement("p");
  wrap.id = "account-control";
  button.id = "account-signin";
  button.type = "button";
  button.textContent = SIGN_IN_LABEL;
  status.id = "account-status";
  status.setAttribute?.("role", "status");
  wrap.append(button, status);
  host.append(wrap);
  const sync = () => {
    wrap.hidden = !auth.isGuest;
  };
  button.addEventListener("click", async () => {
    button.disabled = true;
    status.textContent = "";
    const url = await auth.googleLinkUrl(`${location.origin}${location.pathname}`);
    if (url) location.assign(url);
    else {
      status.textContent = "Sign-in is unavailable right now.";
      button.disabled = false;
    }
  });
  sync();
  return {
    sync,
    dispose() {
      wrap.remove?.();
    },
  };
}
