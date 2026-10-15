#!/bin/sh
# Builds screenshots/site/: the current app + demo scenes, served by the "fadeprev" preview
# at http://localhost:3790/screenshots/site/index.html?s=home|profile|pay|track|account
cd "$(dirname "$0")/.."
rm -rf screenshots/site && mkdir -p screenshots/site
cp -R vendor screenshots/site/vendor
sed -e 's#<head>#<head><script src="../demo-pre.js"></script>#' \
    -e 's#<script src="native-bridge.js"></script>#<script src="../demo.js"></script>#' index.html > screenshots/site/index.html
cp apple-touch-icon.png screenshots/site/ 2>/dev/null || true
echo "site ready"
