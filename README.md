# ARMAGEDOM

Post-nuclear London combat game for mobile web and desktop browsers, built with
Three.js. Play https://playarmagedom.com/.

The active client is Web/. Current served version: three-20261004-008, with the
selected006 fighter scale and unchanged map, stamina, six actions and responsive
portrait/landscape controls. Source promoted from reviewed 5dc5610c; unpublished
lane candidates remain separate. Read PROJECT_STATE.md and AGENTS.md for scope.

```sh
cd Web
npm ci
npm test
npm run test:packaging
npm run build
npm run dev
```

Repository gate: `node scripts/verify_web.mjs`. Static publication requires an
explicit runtime allowlist, exact hashes and browser proof; see
docs/THREEJS-HOSTING-HANDOFF.md. Real-phone performance and feel remain separate.

Unity project, native builds and engine tooling are retired and privately archived
outside the repo at ../ARMAGEDOM-archive/unity-20261004/. They are not active
code, downloads or rollback targets. Historical Git history is retained.
