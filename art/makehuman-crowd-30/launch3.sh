#!/usr/bin/env bash
# launch3.sh  (VPS)  three parallel batches of the crowd build, no load gate (nice 10 keeps other lanes first); ids come from crowd30-rows.json in thirds
W=/srv/dev-jobs/armagedom-crowd30
cd "$W"
for p in $(pgrep -f "build_batch.sh") $(pgrep -f "mh_batch.py --par 1 $W"); do      # only my own: cwd must be this job folder or its tools copy
  c=$(readlink "/proc/$p/cwd" 2>/dev/null); case "$c" in "$W"|"$W"/*) kill "$p" 2>/dev/null ;; esac
done
sleep 2
rm -rf "$W"/build/.lock-* 2>/dev/null
ids=($(python3 -c "import json;print(' '.join(json.load(open('$W/crowd30-rows.json'))['bodies']))"))
n=${#ids[@]}; k=$(( (n + 2) / 3 ))
for b in 0 1 2; do
  part="${ids[@]:$((b * k)):$k}"
  IDS="$part" LOADMAX=1000 setsid nohup bash build_batch.sh > "batch$((b + 1)).log" 2>&1 < /dev/null &
  echo "batch$((b + 1)): $part"
done
