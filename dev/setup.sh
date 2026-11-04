#!/usr/bin/env bash
# One-time dev harness setup: shallow ST release clone, deps, extension symlink, mock seeding.
# Everything it downloads lands in dev/SillyTavern, which is git-ignored.
set -euo pipefail
cd "$(dirname "$0")"
REPO="$(cd .. && pwd)"
[ -d SillyTavern ] || git clone --depth 1 -b release https://github.com/SillyTavern/SillyTavern.git SillyTavern
(cd SillyTavern && npm ci --ignore-scripts --no-audit --no-fund)
ln -sfn "$REPO" SillyTavern/public/scripts/extensions/third-party/Image-gen-kazuma
# First boot creates data/default-user; stop it once settings.json exists, then seed.
(cd SillyTavern && node server.js --port 8000 --listen false > ../st-firstboot.log 2>&1 &)
for _ in $(seq 1 90); do [ -f SillyTavern/data/default-user/settings.json ] && curl -sf -o /dev/null http://127.0.0.1:8000 && break; sleep 1; done
pkill -f "^node server.js --port 8000" || true
sleep 1
node seed-st.mjs
npm install --no-audit --no-fund
echo "Done. Run ./start.sh, then: npx playwright test"
