#!/bin/bash
# Build, gate and package release N on the laptop (Windows, Git Bash, Node 22.23.2 portable at C:/arma-work/node22). No VPS access.
# Usage: cut-local.sh N <full candidate sha> <fingerprint>
# Output: $ARMA_WORK/out/three-<date>-N.tgz and its .sha256 sidecar.
set -euo pipefail
N=${1:?release number}
SHA=${2:?full candidate sha}
FP=${3:?fingerprint}
[[ $SHA =~ ^[0-9a-f]{40}$ ]] || { echo "sha must be 40 hex" >&2; exit 2; }
HERE=$(cd "$(dirname "$0")" && pwd)
W=${ARMA_WORK:-$HOME/arma-work}
URL=${ARMA_REPO_URL:-https://github.com/DomLynch/ARMAGEDOM.git}
P=$((N - 1))
node -v | grep -q '^v22\.' || { echo "Node 22.x required (VPS is v22); got $(node -v)" >&2; exit 2; }

PSHA=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))[sys.argv[2]]['source'])" "$HERE/releases.json" "$P")
PREFIX=$(python3 -c "import json,sys;v=json.load(open(sys.argv[1]))[sys.argv[2]]['version'];print(v[:-len(sys.argv[2])])" "$HERE/releases.json" "$P")
VERSION=${PREFIX}${N}

D=$W/deploy$N
test ! -e "$D" || { echo "$D exists; remove it first (fresh build per cut)" >&2; exit 2; }
mkdir -p "$D" "$W/out"
cd "$D"

# Fresh checkout by sha, as the VPS cut did: parent Web tree is this release's rollback baseline.
# HTTP/1.1: GitHub's HTTP/2 streams get cancelled mid-pack on this network. A persistent cache repo keeps later fetches incremental.
export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.version GIT_CONFIG_VALUE_0=HTTP/1.1
CACHE=$W/git-cache
[ -d "$CACHE/.git" ] || { git init -q "$CACHE"; git -C "$CACHE" remote add origin "$URL"; }
for s in "$PSHA" "$SHA"; do
  for try in 1 2 3 4 5; do git -C "$CACHE" fetch -q --depth=1 origin "$s" && break; [ "$try" = 5 ] && { echo "FETCH_FAILED $s" >&2; exit 1; }; sleep 5; done
done
repo=$CACHE
mkdir -p "$D/parent/deploy$N-b$P"
git -C "$CACHE" -c core.autocrlf=false archive "$PSHA" Web | tar -x -C "$D/parent/deploy$N-b$P"
mkdir src && git -C "$CACHE" -c core.autocrlf=false archive "$SHA" | tar -x -C src
cd src/Web
npm ci --no-audit --no-fund > ../../npmci.log 2>&1
cd ..

bash "$HERE/prep-baselines.sh" "$D"
bash "$HERE/gate.sh" "$N" "$D"
grep -h EXIT ../rb.log ../build.log ../pack.log
grep -q 'RB_EXIT=0' ../rb.log && grep -q 'BUILD_EXIT=0' ../build.log && grep -q 'ASSETS_EXIT=0' ../build.log && grep -q 'PACK_EXIT=0' ../pack.log \
  || { echo "GATE FAILED" >&2; exit 1; }

# Presence layout: candidate rows must equal the parent's (otherwise a presence restart is needed).
node "$HERE/area-rows.mjs" . ../area.json 2> ../area.err
node "$HERE/area-rows.mjs" "$D/roots/deploy$N-b$P" "$D/area-parent.json" 2> "$D/area-parent.err"
cmp ../area.json ../area-parent.json && echo AREA_IDENTICAL || { echo AREA_DIFFERS; grep -m1 version ../area.json; }

python3 "$HERE/mkmanifest.py" "$N" "$SHA" "$FP" "$HERE/releases.json" ../assets.log release-manifest.json
python3 scripts/deploy/package_preview.py --runtime Web/dist --manifest release-manifest.json --output export 2>&1 | tail -1
REL=$(sha256sum export/release.json | cut -d' ' -f1)
echo PKG=$REL

python3 "$HERE/mktarball.py" "$N" "$SHA" "$FP" "$REL" "$HERE/releases.json" export "$W/out"
echo "Add/confirm the releases.json row for $N (source, fingerprint, releaseSHA=$REL) in the PR record; the tarball carries its own copy."
