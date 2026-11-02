// Soft, non-gating lint (see .github/workflows/lint-soft.yml). Real-bug rules only, no style rules.
// Self-contained on purpose: no plugin imports, so `npx eslint@<pin>` works without devDependencies.
const browser = [
  "window", "document", "navigator", "location", "history", "localStorage", "sessionStorage", "fetch", "Request",
  "Response", "Headers", "URL", "URLSearchParams", "FormData", "Blob", "File", "FileReader", "Image", "Audio",
  "AudioContext", "OfflineAudioContext", "WebSocket", "Worker", "MessageChannel", "BroadcastChannel", "XMLHttpRequest",
  "requestAnimationFrame", "cancelAnimationFrame", "requestIdleCallback", "cancelIdleCallback", "performance",
  "devicePixelRatio", "innerWidth", "innerHeight", "screen", "matchMedia", "getComputedStyle", "alert", "confirm",
  "prompt", "HTMLElement", "HTMLCanvasElement", "Element", "Node", "Event", "CustomEvent", "KeyboardEvent",
  "MouseEvent", "PointerEvent", "TouchEvent", "ResizeObserver", "IntersectionObserver", "MutationObserver",
  "OffscreenCanvas", "ImageBitmap", "createImageBitmap", "ImageData", "DOMParser", "DOMMatrix", "AbortController",
  "TextEncoder", "TextDecoder", "crypto", "atob", "btoa", "indexedDB", "caches", "self", "globalThis",
  "WebGLRenderingContext", "WebGL2RenderingContext", "Path2D", "CSS", "MediaStream", "structuredClone",
  "queueMicrotask"
];
const node = [
  "process", "Buffer", "global", "console", "setTimeout", "clearTimeout", "setInterval", "clearInterval",
  "setImmediate", "clearImmediate", "__dirname", "__filename", "require", "module", "exports"
];
const globals = Object.fromEntries([...browser, ...node].map((name) => [name, "readonly"]));

export default [
  {
    ignores: ["dist/**", "public/**", "node_modules/**", "**/*.min.js", "**/generated/**", "**/*.generated.*", "coverage/**"]
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals },
    rules: {
      "no-undef": "warn",
      "no-unused-vars": ["warn", { args: "none", caughtErrors: "none", ignoreRestSiblings: true }],
      "no-unreachable": "warn",
      "no-dupe-keys": "warn",
      "no-dupe-args": "warn",
      "no-dupe-else-if": "warn",
      "no-duplicate-case": "warn",
      "no-self-assign": "warn",
      "no-self-compare": "warn",
      "no-const-assign": "warn",
      "no-func-assign": "warn",
      "no-import-assign": "warn",
      "no-class-assign": "warn",
      "no-redeclare": "warn",
      "no-shadow-restricted-names": "warn",
      "no-sparse-arrays": "warn",
      "no-unsafe-negation": "warn",
      "no-unsafe-finally": "warn",
      "no-unused-labels": "warn",
      "no-empty-pattern": "warn",
      "no-cond-assign": "warn",
      "no-constant-condition": ["warn", { checkLoops: false }],
      "no-fallthrough": "warn",
      "no-loss-of-precision": "warn",
      "no-setter-return": "warn",
      "no-useless-backreference": "warn",
      "use-isnan": "warn",
      "valid-typeof": "warn",
      "getter-return": "warn"
    }
  }
];
