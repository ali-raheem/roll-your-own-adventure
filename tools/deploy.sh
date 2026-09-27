#!/usr/bin/env bash
# Deploy Roll Your Own Adventure to https://shoryuken.me/roll/
# Validates every pack first; refuses to deploy a broken pack.
set -euo pipefail

HOST="root@185.163.204.17"
DEST="/var/www/shoryuken.me/roll/"
cd "$(dirname "$0")/.."

node tools/validate.mjs

rsync -av --delete \
  --exclude .git --exclude .gitignore --exclude tools --exclude docs \
  --exclude package.json --exclude README.md --exclude CLAUDE.md \
  ./ "$HOST:$DEST"

echo "Deployed. Checking live site..."
for path in "" js/app.js packs/index.json; do
  printf '%-22s %s\n' "/roll/$path" "$(curl -s -o /dev/null -w '%{http_code}' "https://shoryuken.me/roll/$path")"
done
