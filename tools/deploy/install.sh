#!/bin/bash
# VPS side: verify an uploaded release tarball and stage it as an immutable PREVIEW. Never flips root.
# Usage: install.sh <tarball path> <N> [parent N, only when N-1 was never staged]        (tarball uploaded to /mnt/HC_Volume_107195252/incoming/)
# Needs mk.py beside it. The flip (resume-publish.sh) stays a separate, deliberate step.
set -euo pipefail
TGZ=${1:?tarball}
N=${2:?release number}
HERE=$(cd "$(dirname "$0")" && pwd)
R=/mnt/HC_Volume_107195252
S=/opt/armagedom-preview-staging

# 1. sidecar checksum
( cd "$(dirname "$TGZ")" && sha256sum -c "$(basename "$TGZ").sha256" )

X=$R/deploy$N
test ! -e "$X"
mkdir "$X"
tar -xzf "$TGZ" -C "$X"
cd "$X"

# 2. manifest, per-file hashes, and agreement with the releases.json row carried in the tarball
python3 - "$N" <<'PY'
import hashlib, json, sys
n = sys.argv[1]
m = json.load(open('manifest.json'))
rows = json.load(open('releases.json'))
row = rows[n]
assert m['version'] == row['version'] and m['version'].endswith('-' + n), m['version']
assert m['sourceCommit'] == row['source'], 'sourceCommit differs from releases.json'
assert m['sourceFingerprint'] == row['fingerprint'], 'fingerprint differs from releases.json'
assert m['releaseSha256'] == row['releaseSHA'], 'release sha differs from releases.json'
for f in m['files']:
    assert hashlib.sha256(open('site/' + f['path'], 'rb').read()).hexdigest() == f['sha256'], f['path']
assert hashlib.sha256(open('site/release.json', 'rb').read()).hexdigest() == m['releaseSha256']
print('MANIFEST_OK', m['version'], len(m['files']), 'files', m['node'], m['buildTime'])
PY

# 3. the source commit must be fetchable from origin
SHA=$(python3 -c "import json;print(json.load(open('manifest.json'))['sourceCommit'])")
T=$(mktemp -d)
git -C "$T" init -q
git -C "$T" remote add origin https://github.com/DomLynch/armagedom.git
git -C "$T" fetch -q --depth=1 origin "$SHA"
echo "SOURCE_ON_ORIGIN $SHA"
rm -rf "$T"

# 4. ops set for this release from the previous one, constants from the tarball's releases.json row
python3 "$HERE/mk.py" "$N" --base "$R" --releases "$X/releases.json" ${3:+--parent "$3"}

# 5. stage as preview only (same sequence as the old installNNN.sh)
V=$(python3 -c "import json;print(json.load(open('manifest.json'))['version'])")
ops=$S/$V-ops
test ! -e "$ops"
test ! -e "$S/$V-private"
test ! -e "$S/$V"
exec 9>/run/lock/armagedom-deploy.lock
flock -x 9
mkdir "$ops"
cp "$R"/ops$N-upload/* "$ops"/
cp -a "$X/site" "$S/$V-private"
cp "$X/site/release.json" "$ops/private-release.json"
cp "$X/site/release.json" "$ops/intake-export-manifest.json"
python3 "$R/ops$N-upload/mksums$N.py" "$X/site/release.json" > "$ops/SHA256SUMS"
python3 "$ops/verify-parent.py" "$ops/deployment-plan.json"
cp -a "$S/$V-private" "$S/$V"
bash "$ops/activate-preview.sh" > "$ops/activation.log" 2>&1
tail -3 "$ops/activation.log"
