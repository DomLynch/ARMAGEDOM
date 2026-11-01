#!/bin/bash
# Idempotently materialise the frozen rollback baselines under $ARMA_WORK/baselines (one Web tree each).
# Usage: prep-baselines.sh <candidate node_modules path> <this release's own baseline name>
# Rows of baselines.txt are "deployN-bM <source sha>" and are rebuilt from GitHub with git archive.
# The 14 oldest baselines (deploy226-b224 .. deploy238-b237) have no recorded sha: they are copied once from the
# read-only VPS harvest at $ARMA_FROZEN (default /mnt/c/arma-work/baselines-frozen).
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
W=${ARMA_WORK:-$HOME/arma-work}
URL=${ARMA_REPO_URL:-https://github.com/DomLynch/ARMAGEDOM.git}
FROZEN=${ARMA_FROZEN:-/mnt/c/arma-work/baselines-frozen}
NM=${1:?candidate node_modules}
mkdir -p "$W/baselines" "$W/baseline-git"
git -C "$W/baseline-git" rev-parse -q --git-dir >/dev/null 2>&1 || { git init -q "$W/baseline-git"; git -C "$W/baseline-git" remote add origin "$URL"; }
for d in "$FROZEN"/deploy*; do
  [ -d "$d" ] || continue
  n=$(basename "$d")
  [ -d "$W/baselines/$n/Web" ] || cp -a "$d" "$W/baselines/$n"
done
while read -r name sha; do
  [ -n "$name" ] || continue
  [ -d "$W/baselines/$name/Web" ] && continue
  for try in 1 2 3; do git -C "$W/baseline-git" fetch -q --depth=1 origin "$sha" && break; [ "$try" = 3 ] && exit 1; sleep 5; done
  mkdir -p "$W/baselines/$name"
  git -C "$W/baseline-git" archive "$sha" Web | tar -x -C "$W/baselines/$name"
done < "$HERE/baselines.txt"
for d in "$W"/baselines/deploy*; do
  [ -d "$d/Web" ] && ln -sfn "$NM" "$d/Web/node_modules"
done
echo "baselines ready: $(ls "$W/baselines" | wc -l)"
