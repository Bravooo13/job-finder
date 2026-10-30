#!/bin/bash
# Builds the mock Greenhouse form (React + React Select) for tests/e2e/auto_apply_e2e.py.
# Usage: tests/e2e/fixtures/build.sh /tmp/jf-fixture   → /tmp/jf-fixture/form.html and app.js
set -euo pipefail
OUT="${1:?output folder}"
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
mkdir -p "$OUT"
cp "$HERE/greenhouse_form.jsx" "$OUT/app.jsx"
cp "$HERE/greenhouse_form.html" "$OUT/form.html"
cd "$OUT"
[ -f package.json ] || npm init -y >/dev/null
npm install --no-audit --no-fund react@18.3.1 react-dom@18.3.1 react-select@5.8.0 >/dev/null
"$ROOT/node_modules/esbuild/bin/esbuild" app.jsx --bundle --minify --format=iife --define:process.env.NODE_ENV='"production"' --outfile=app.js
echo "Built $OUT/form.html and $OUT/app.js"
