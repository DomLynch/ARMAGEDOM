"""Follow verified main commits; never reset, clean, build or execute game code."""

import fcntl
import pathlib
import subprocess
import sys


def sync(root, expected_remote):
    def git(*args):
        return subprocess.check_output(
            ["git", "-c", "core.hooksPath=/dev/null", "-C", str(root), *args],
            text=True,
            stderr=subprocess.PIPE,
            timeout=90,
        ).strip()

    lock_path = (
        pathlib.Path(git("rev-parse", "--absolute-git-dir")) / "armagedom-sync.lock"
    )
    with lock_path.open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if git("remote", "get-url", "origin") != expected_remote:
            raise RuntimeError("unexpected origin")
        if git("symbolic-ref", "--short", "HEAD") != "main":
            raise RuntimeError("checkout must be on main")
        if git("status", "--porcelain", "--untracked-files=all"):
            raise RuntimeError("local edits must be resolved by their owner")
        git("fetch", "--quiet", "--no-tags", "origin", "main")
        target = git("rev-parse", "FETCH_HEAD")
        git("merge-base", "--is-ancestor", "HEAD", target)
        if git("status", "--porcelain", "--untracked-files=all"):
            raise RuntimeError("checkout changed during fetch")
        git("merge", "--ff-only", "--no-edit", target)
        if git("rev-parse", "HEAD") != target or git("status", "--porcelain"):
            raise RuntimeError("post-sync parity failed")
        print("SYNCED", target)


if __name__ == "__main__":
    try:
        sync(pathlib.Path(sys.argv[1]), sys.argv[2])
    except (RuntimeError, OSError, subprocess.SubprocessError, IndexError) as error:
        print("REFUSED:", str(error), file=sys.stderr)
        sys.exit(1)
