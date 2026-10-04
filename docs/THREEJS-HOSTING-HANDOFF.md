# Three.js immutable hosting contract — 2026-10-04

Deploy owns scripts/deploy/ and hosting. Lead owns accepted Web sources,
lockfile/runtime selection. Official origin: https://playarmagedom.com/.
Current exact version: three-20261004-008, source5dc5610c,
fingerprint4ae5b085e759d7c2ebe2719d95bb660ab6337927ad64bbba4a63544882ab9224.

Lead supplies unique version, reviewed manifest with EVERY runtime path/bytes/
SHA256, source fingerprint, exact export directory and browser receipt. Package
only that allowlist; never copy all public assets. Existing packager:
`python3 scripts/deploy/package_preview.py --runtime <export> --manifest <manifest> --output <new-staging>`.
It rejects unsafe paths/symlinks/overwrite/tamper and rechecks copied bytes.

Stage outside webroot. Publish new immutable paths under
/var/www/playarmagedom.com/armagedom/preview/<version>/ using the guarded
artifacts/unity-retirement/20261004/activate-next-preview.sh. Never overwrite a
served version. HTML/manifest no-store; successful immutable assets require exact
version, MIME/nosniff, strict404, negotiated-gzip decoded equality and Vary.
Actual browser startup/fight/retry/console and physical-phone acceptance remain
separate from hashes. Apex/www/HTTP and legacy mirror game links canonicalise.

Unity is retired. Old page/index URLs redirect no-store to current Three.js;
old engine loaders/framework/WASM/data/StreamingAssets/native downloads return
410 no-store, never successful current HTML. Private server archive:
/var/backups/armagedom/unity-retired-20261004 (root700). Local private archive:
../ARMAGEDOM-archive/unity-20261004/. Neither is a public fallback.
Rollback uses reviewed Three.js packages only. Previous migration activation/
rollback scripts and old hosting receipts are historical, not executable recovery
instructions. Current safe rollback-three-only.sh and before/after evidence live
under artifacts/unity-retirement/20261004/. All old engine public payloads are
withdrawn. TLS apex/www, certbot timer/reload and renewal dry-run were verified.

Current008: 17 served files, payload identities unchanged during retirement.
Migration receipts: artifacts/domain-migration/playarmagedom-20261004/.
Retirement receipts: artifacts/unity-retirement/20261004/.
Hollow, lean maintenance, isolated backend and phone acceptance are separate.
