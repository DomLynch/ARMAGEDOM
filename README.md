# ARMAGEDOM

Post-nuclear London combat game for mobile web and desktop browsers, built with
Three.js. Play https://playarmagedom.com/.

The active client is Web/, with portrait and landscape controls. The melee touch
layout has five actions: Slash, Stab, Heavy, Dodge and Guard/timed Parry; keyboard
Special remains available. Pistol equipment switches the contextual controls.
Read PROJECT_STATE.md and the current deployment receipts for separate source,
candidate and verified served identities; this README does not pin a live version.
Read AGENTS.md for current ownership and scope.

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
