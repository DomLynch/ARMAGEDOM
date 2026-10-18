# Static driver preflight

Backend owns `driver-preflight.mjs`, tests, pinned parser and static fixtures.
Deploy owns calling it **before** `Popen`/upload and binding the exact command and
maintained wrapper bytes to the scanned entrypoint closure. Web owns guarded
browser adapters, actual readiness and ordinary-input acknowledgement/results.
This component does not intercept other shell, HF, legacy or direct submit routes.
Existing frozen172 work is not restarted by this tool.

Install the tiny pinned parser with `npm ci --prefix scripts/qa --ignore-scripts
--no-audit --no-fund`. Acorn8.15 parses JavaScript; there is no regex-only JavaScript
scanner or script execution. Only explicit `.js/.mjs/.cjs/.json` local imports
are supported. Literal imports, JSON/data reads, `new URL(...,import.meta.url)`
and unambiguous constant/path expressions resolve within the exact staged root.
Symlinks/escapes, unresolved dynamic reads/imports/calls/code and child-process
dispatch fail closed. This intentionally rejects unsupported legacy patterns
rather than claiming universal JavaScript analysis.

## API and CLI

```js
const report = await driverPreflight({
  stageRoot: '.', // resolved against CLI CWD: exact prepared upload directory
  entrypoints: ['driver.mjs'],
  dataFiles: [],
  sourceManifest: 'source-manifest.json', // pre-build stages
  expect: {source: '40hex', fingerprint: '64hex', packageSha256: null},
});
```

For same-package retries, use `packageRoot:'export'` and full expected actual
`packageSha256`. The pre-build source manifest is `{version,head,fingerprint,
files:[{path,bytes,sha256}]}`. Its fingerprint uses Python sorted-key compact
JSON of the ordered files list; actual listed file bytes/hashes are checked.
Both source and package identity may be supplied and must agree. No package
hash is invented before build. Package mode verifies release.json and all listed
payloads; Deploy also verifies exact export closure.

`node scripts/qa/driver-preflight.mjs driver-preflight-config.json REPORT.json`
runs no submitted driver, network, child process or browser. Exit0 means static
PASS; exit1 means FAIL. Reports are deterministic on unchanged config/root/tool
and inputs; contain no timestamp or temporary output filename. Deploy may freeze
`driver-preflight.json`, rerun into a separate temporary report and compare it.

Report fields: schemaVersion1, status, phase:`static`, canonical root, actual
identity or null, configSHA256, policySHA256, tool/parser hashes, sorted files
`{path,kind,sha256,bytes}`, graph `{from,to,kind}`, trustedAdapters, external pins,
closureSHA256, structured errors `{code,path,line,message}`, explicit limits.
Without sourceManifest/packageRoot, PASS is a component-only static result;
release submission still requires the identity applicable to that job type.

## Maintained interaction authority

The module's `MAINTAINED_ADAPTER_POLICY` is the authority. A candidate config
cannot add adapters, replace their hashes, broaden exports or callback slots.
The current narrow policy binds the maintained weapon-action-guard.mjs exact
hash and `weaponAction` export; direct inline `press`/`release` callbacks to that
import are inspected as guarded regions. Direct input calls, method extraction,
destructuring and shadowed adapter bindings elsewhere fail. Updating adapter
bytes/policy is an owner-reviewed source change, not candidate self-approval.

**The launcher must independently bind this validator, parser manifest/lock and
wrapper bytes to the maintained source.** Trusting a candidate-generated report
or modified validator is not an authority boundary. Exact launch command and
entrypoint binding is also required; a static PASS never authorizes launching
an unscanned script. Those launcher guards belong to Deploy, not this module.

## Shared tiny fixtures

`fixtures/driver-preflight/valid/driver.mjs` imports the actual hash-bound guard,
a read-only module and a JSON fixture. `missing-fixture-driver.mjs` must fail
DEPENDENCY_UNAVAILABLE. `unguarded-driver.mjs` must fail UNGUARDED_INTERACTION.
`unlisted-driver.mjs` is deliberately outside the valid closure for Deploy's
command-substitution negative. These fixtures are syntax/input contracts, not
actual gameplay or an earned checkpoint. The tests prove zero submission calls
in a local gate harness; Deploy must prove its actual pre-Popen integration.

Dynamic visibility, selected weapon/observer compatibility, action start,
resources, results and checkpoint identity still require Web's browser phase.
Static evidence must never be accepted as those observations.
