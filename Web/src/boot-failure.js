// Standalone on purpose: it imports nothing, so it still runs when the game's
// own module graph (main.js and everything under it) fails to load.
export function installBootFailureFallback(win = window) {
  const doc = win.document;
  const describe = (event) => {
    const target = event.target;
    if (target && target !== win && (target.src || target.href)) return `could not fetch ${target.src || target.href}`;
    return event.reason?.message ?? event.message ?? "unknown error";
  };
  function show(event) {
    const entry = doc.getElementById("entry");
    const enter = doc.getElementById("enter");
    const loading = doc.getElementById("loading");
    // Only the entry card: a fight in progress has its own recovery messages.
    if (!entry || entry.hidden || !enter || !loading) return;
    loading.textContent = `Could not load the game: ${describe(event)}. Check your connection and retry.`;
    enter.textContent = "Retry loading";
    enter.disabled = false;
    // Before the game booted nothing else listens on the button, so Retry reloads.
    if (!win.__armagedomBooted && !enter.dataset.bootRetry) {
      enter.dataset.bootRetry = "1";
      enter.addEventListener("click", () => win.location.reload());
    }
  }
  // Capture phase: a failed <script type="module"> fires a non-bubbling error on the element.
  win.addEventListener("error", show, true);
  win.addEventListener("unhandledrejection", show);
}

if (typeof window !== "undefined") installBootFailureFallback();
