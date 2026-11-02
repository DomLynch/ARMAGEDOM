#!/bin/bash
# One-command stage for release 336 (parent 335 is live). Usage: cut336.sh <full candidate sha> <fingerprint>
set -euo pipefail
SHA=${1:?candidate sha}
FP=${2:?fingerprint}
PSHA=acc47f4efbe3f5ef96aa2e387fa90e9784a2db3c
R=/mnt/HC_Volume_107195252
cd $R
rm -rf deploy334
python3 gencut.py 336 "$SHA" "$FP" deploy335-b334
grep -o "deploy335-b334 deploy336-b335" gate336.sh
mkdir -p deploy336-b335 repo336
( cd repo336 && git init -q && git remote add origin https://github.com/DomLynch/armagedom.git && nice -n 19 git fetch -q --depth=1 origin "$PSHA" "$SHA" )
git -C repo336 archive "$PSHA" Web | tar -x -C deploy336-b335
mkdir deploy336
git -C repo336 archive "$SHA" | tar -x -C deploy336
rm -rf repo336
cd deploy336/Web
nice -n 19 npm ci --no-audit --no-fund > ../npmci336.log 2>&1
echo NPMCI=$?
cd ..
bash ../gate336.sh
grep -h EXIT rb336.log build336.log pack336.log
node Web/scripts/area-presence-rows.mjs area336.json 2>area336.err
cmp area336.json ../deploy335/area335.json && echo AREA_IDENTICAL || { echo AREA_DIFFERS; grep -m1 version area336.json; }
python3 ../mkmanifest336.py
python3 scripts/deploy/package_preview.py --runtime Web/dist --manifest release-manifest.json --output export 2>&1 | tail -1
S=$(sha256sum export/release.json | cut -d' ' -f1)
echo PKG=$S
cd ..
python3 mk336.py "$S" "$SHA" "$FP"
nice -n 19 bash install336.sh 2>&1 | tail -1
curl -s -m 15 https://playarmagedom.com/armagedom/preview/three-20261028-336/release.json | grep -m1 sourceCommit
