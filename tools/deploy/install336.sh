#!/bin/bash
# Install candidate 336 as an immutable preview only. Root stays on 310.
set -euo pipefail
S=/opt/armagedom-preview-staging
V=three-20261028-336
ops=$S/$V-ops
test ! -e $ops
test ! -e $S/$V-private
test ! -e $S/$V
exec 9>/run/lock/armagedom-deploy.lock
flock -x 9
mkdir $ops
cp /mnt/HC_Volume_107195252/ops336-upload/* $ops/
cp -a /mnt/HC_Volume_107195252/deploy336/export $S/$V-private
cp /mnt/HC_Volume_107195252/deploy336/export/release.json $ops/private-release.json
cp /mnt/HC_Volume_107195252/deploy336/export/release.json $ops/intake-export-manifest.json
python3 /mnt/HC_Volume_107195252/ops336-upload/mksums336.py /mnt/HC_Volume_107195252/deploy336/export/release.json > $ops/SHA256SUMS
python3 $ops/verify-parent.py $ops/deployment-plan.json
cp -a $S/$V-private $S/$V
bash $ops/activate-preview.sh > $ops/activation.log 2>&1
tail -3 $ops/activation.log
