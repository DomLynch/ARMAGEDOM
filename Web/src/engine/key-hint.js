// Context buttons say " · G" for keyboard players; a touch device has no G key, so it gets the plain label.
export function keySuffix(key = "G") {
  const touch =
    globalThis.document?.body?.classList?.contains("touch") || !!globalThis.matchMedia?.("(pointer: coarse)")?.matches;
  return touch ? "" : ` · ${key}`;
}
