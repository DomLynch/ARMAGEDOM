import { createBrowserSession } from "./browser-session.js";
import { assertSession } from "./contracts.js";
export function createSession(options) {
  return assertSession(createBrowserSession(options));
}
