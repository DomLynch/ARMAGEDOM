# Exact 173 native proof submission

The maintained command is `bash scripts/qa/run-native-proof.sh`, through
`submit-release.py`. The wrapper runs exact reviewed observer preparation,
checks the generated module syntax, starts the owned export server, then runs
only stage-root `proof.mjs` with pinned Playwright and verified non-Snap
Chromium. It stops its own server on exit. Arbitrary `run.sh`, direct
`node proof.mjs`, and substituted commands remain rejected before upload.

The frozen stage must contain the exact game `export/`, `proof.mjs`,
`observer.mjs`, reviewed `observer-preflight.mjs`, `qa-173-config.json`,
and the maintained QA wrapper/adapters. Root `package.json` and lockfile
must match the maintained pinned QA dependencies.
`driver-preflight-config.json` must name `proof.mjs` as an entrypoint,
`qa-173-config.json` as declared data, `export` as `packageRoot`, the actual
source/fingerprint/release SHA in `expect`, and pinned Playwright in `externals`.
`qa-173-config.json` must repeat `expect`, set `baseURL` to the wrapper-owned
`http://127.0.0.1:19413/` export server. The frozen static receipt must match
a fresh maintained scan and include exact hashes for `proof.mjs`, `observer.mjs`,
the config and all three guarded adapters. Observer preparation is separately
bound byte-for-byte to `fixtures/observer-preflight173.mjs`, because treating
the compiled game bundle it reads as driver code would give a false rejection.

This binds the consumer, observer, maintained adapters, package and launch
command. Static PASS permits submission; it is not native gameplay evidence.
The original VPS exit and recovered browser receipts determine that result.
