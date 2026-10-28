#!/usr/bin/env bash
# queue.sh  (VPS)  PM ruling: one batch at a time. Stops batches 2 and 3 (mine only, matched by their IDS env), then runs batch 2 and batch 3 after batch 1 finishes.
W=/srv/dev-jobs/armagedom-crowd30
cd "$W"
kids() { local p; for p in $(pgrep -P "$1"); do kids "$p"; echo "$p"; done; }
for p in $(pgrep -f "build_batch.sh"); do
  [ "$(readlink /proc/$p/cwd 2>/dev/null)" = "$W/tools-mh" ] || continue
  ids=$(tr '\0' '\n' < /proc/$p/environ 2>/dev/null | sed -n 's/^IDS=//p')
  case "$ids" in body-0114*|body-0127*) for k in $(kids "$p") "$p"; do kill "$k" 2>/dev/null; done ;; esac
done
sleep 3
for id in $(cat <<E
body-0114 body-0115 body-0116 body-0117 body-0118 body-0119 body-0120 body-0121 body-0122 body-0123 body-0124 body-0125 body-0127 body-0128 body-0129 body-0130 body-0137 body-0139 body-0140 body-0141 body-0142 body-0144
E
); do [ -f build/$id/extended/proofs.txt ] || rm -rf "build/.lock-$id"; done
(
  while ! grep -q '^DONE' batch1.log; do sleep 20; done
  IDS="body-0114 body-0115 body-0116 body-0117 body-0118 body-0119 body-0120 body-0121 body-0122 body-0123 body-0124 body-0125" LOADMAX=1000 bash build_batch.sh > batch2.log 2>&1
  IDS="body-0127 body-0128 body-0129 body-0130 body-0137 body-0139 body-0140 body-0141 body-0142 body-0144" LOADMAX=1000 bash build_batch.sh > batch3.log 2>&1
) > queue.log 2>&1 < /dev/null &
echo queued
