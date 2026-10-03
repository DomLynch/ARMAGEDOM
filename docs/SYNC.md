# ARMAGEDOM source sync

GitHub: https://github.com/DomLynch/ARMAGEDOM (public).
Mac authoring checkout: `/Users/domininclynch/Desktop/Business/ARMAGEDOM`.
VPS follower: `/opt/armagedom`, branch `main`, dedicated user `armagedom`.
The Unity project remains `Game/`; the existing Mac app remains Ashvault.

Installed2026-10-02: baseline `f672c25` matched GitHub and the clean VPS checkout.
Six sync tests passed on both Mac and VPS;15/15 Unity tests and Mac player smoke
passed locally. Service runs as armagedom with success/exit0; timer enabled.
Pre-existing Mac ProjectSettings/TimeManager edits and untracked art/cache backups
remain local intentionally. A clean follower does not imply the authoring tree is clean.

Only reviewed, verified commits are pushed. Unfinished local edits, Unity caches,
builds and untracked art/captures stay on the Mac. No automatic commit, force push,
reset, clean, or bidirectional merge. The VPS is a source copy, not a playable
Linux deployment; no game server, backend or Unity installation is added.

Before publishing, run every command in `.quality-gate.json`, review the scoped
diff and stage only the intended files. Then commit and `git push origin main`.
New game behavior also needs a matching packaged build and native visual check.

`armagedom-sync.timer` checks once a minute. The installed root-owned script
`/usr/local/libexec/armagedom-sync.py` runs as the unprivileged `armagedom` user.
It permits only a clean fast-forward from the exact configured origin and main
branch. Dirty files, local commits, detached/wrong branches or fetch errors fail
without discarding work. Git hooks are disabled in the follower. Script changes
require deliberate reinstallation; pulling source never executes new repo code.

Inspect: `systemctl status armagedom-sync.timer armagedom-sync.service` and
`journalctl -u armagedom-sync.service -n 10 --no-pager`.
Immediate refresh: `systemctl start armagedom-sync.service`.
Pause: `systemctl disable --now armagedom-sync.timer`.
Resume: `systemctl enable --now armagedom-sync.timer`.
On failure, inspect the journal and resolve the underlying problem; never reset
the checkout to conceal divergence. The next timer run retries normally.

Reinstall the reviewed script/unit from this repo using `install -m 644` into
`/usr/local/libexec/armagedom-sync.py` and `/etc/systemd/system/` respectively;
run `systemd-analyze verify` on both units, `systemctl daemon-reload`, then enable
the timer. The service account must own only `/opt/armagedom`, with no sudo rights.

For rollback, revert the relevant main commit on the Mac, rerun its checks and
push the revert. This preserves fast-forward history on every machine.
