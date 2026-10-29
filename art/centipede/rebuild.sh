#!/bin/bash
# Mac side: sync the checkout to the VPS scratch copy (repo2), vite-build there, fetch dist for the still driver.
set -e
cd "$(dirname "$0")/../.."
KEY=${SSH_KEY:-$HOME/.ssh/binance_futures_tool}
rsync -a --delete -e "ssh -i $KEY" --exclude=.git --exclude=art --exclude=docs --exclude=node_modules ./ root@49.12.7.18:/srv/dev-jobs/centipede/repo2/
ssh -o BatchMode=yes -i $KEY root@49.12.7.18 'cd /srv/dev-jobs/centipede/repo2/Web && ln -sfn /srv/dev-jobs/centipede/repo/Web/node_modules node_modules && nice -n 10 npx vite build --base=./ --outDir /srv/dev-jobs/centipede/dist2 --emptyOutDir > /srv/dev-jobs/centipede/build2.log 2>&1; tail -1 /srv/dev-jobs/centipede/build2.log'
rsync -a --delete -e "ssh -i $KEY" root@49.12.7.18:/srv/dev-jobs/centipede/dist2/ /private/tmp/claude-501/centipede-work/dist/
echo fetched
