# Type-check ratchet

Workflow: `.github/workflows/typecheck-soft.yml`. Config: `Web/tsconfig.check.json`.
TypeScript is pinned in the workflow (`typescript@5.9.3`) and run through `npx`, so
`Web/package.json` and the lockfile are untouched.

## Why it is soft now

- The Web code is plain JavaScript that was never type-checked; the first run will report a large
  backlog, much of it noise (untyped `three` imports, JSDoc gaps, DOM nullability).
- A gate on day one would block unrelated PRs. So the job is `continue-on-error`, ends in
  `|| true`, is not in `web-gate`, and only writes counts to the job summary.
- Config is deliberately lenient: `strict: false`, `strictNullChecks: false`, plus
  `noImplicitThis` (a cheap real-bug check).

## How to ratchet later

1. Read the total from a green run's job summary on `main` and commit it as the baseline, for
   example in `Web/typecheck-baseline.json` as `{ "errors": N }`.
2. Add a step that recomputes the total (same parser as the summary step) and fails only when
   `total > baseline`.
3. Lower the baseline in the same PR whenever a fix reduces the count. Never raise it silently.
4. Once the count is low, turn on `strictNullChecks`, then `noImplicitAny`, re-baselining each time.
5. Last, drop `continue-on-error` and add the job to `web-gate`.
6. Optional: add `@types/three` and `typescript` to Web devDependencies (lockfile change, own PR).
