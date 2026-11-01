#!/usr/bin/env python3
"""source_manifest.py <repo> <full-sha> <version> <out.json>

Fingerprint rule (documented 1 Nov 2026, replaces the lost Mac script): every file tracked by git at <full-sha>
(git ls-tree -r, blob bytes as stored, so no CRLF effects), as [{path, bytes, sha256}] sorted by path;
fingerprint = sha256(json.dumps(files, sort_keys=True, separators=(',', ':')).encode()).
Anyone with the repo can recompute it. It is a consistency value, not a security boundary."""
import hashlib, json, subprocess, sys

repo, sha, version, out = sys.argv[1:5]
NUL = chr(0)


def git(*a, text=False):
    r = subprocess.run(["git", "-C", repo, *a], capture_output=True, check=True)
    return r.stdout.decode() if text else r.stdout


assert len(sha) == 40, "need the full sha"
assert git("rev-parse", sha + "^{commit}", text=True).strip() == sha
entries = []
for line in git("ls-tree", "-r", "-z", sha, text=True).split(NUL):
    if not line:
        continue
    meta, path = line.split("\t", 1)
    _mode, typ, obj = meta.split()
    if typ == "blob":
        entries.append((path, obj))
files = []
proc = subprocess.Popen(["git", "-C", repo, "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
for path, obj in entries:
    proc.stdin.write((obj + "\n").encode())
    proc.stdin.flush()
    size = int(proc.stdout.readline().split()[2])
    data = proc.stdout.read(size)
    proc.stdout.read(1)
    files.append({"path": path, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
proc.stdin.close()
proc.wait()
files.sort(key=lambda f: f["path"])
fp = hashlib.sha256(json.dumps(files, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
json.dump({"version": version, "head": sha, "fingerprint": fp, "fileCount": len(files), "files": files}, open(out, "w"), indent=1)
print(version, sha, fp, len(files))
