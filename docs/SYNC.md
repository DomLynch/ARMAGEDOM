# Source synchronization — Three.js only, 2026-10-04

Canonical main: DomLynch/ARMAGEDOM. Active game source is Web/; no Game/ or engine
build/test tooling. scripts/sync_vps.py performs guarded clean-main fast-forward
only; scripts/test_sync.py verifies those guards. The follower is source storage,
not the public live webroot. Deploy publishes reviewed immutable exports separately.

The existing VPS armagedom-sync.timer/service is temporarily held during retirement
until Lead publishes and validates a focused Three.js-only main commit. Never start
sync against a historical engine main or restore Game/ from an old branch.
Deploy owns follower archival/service handling; Lead owns main integration.

After the retirement checkpoint, compare exact canonical main/GitHub main/clean
VPS /opt/armagedom; use VPS Git as armagedom. Require clean status and an ancestry
check. Preserve dirty authoring, never reset/clean/force-push or wholesale-merge the
private lane baseline. A failed fast-forward is a support checkpoint, not permission
to discard work. Browser-only source gates, packaging closure, served HTTPS identity
and real browser play are separate receipts; physical-device gates remain separate.

Rollback may use a reviewed Three.js commit/package only. Historical engine commits
and private archives are provenance/emergency references, not active rollback.
