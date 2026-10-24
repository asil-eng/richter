#!/usr/bin/env bash
# Build the hosted demo into docs/app/ for GitHub Pages (https://asil-eng.github.io/richter/app/).
# Uses only the committed demo data (models, snapshots, AI notes); never local, uncommitted repos.
set -euo pipefail
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
git -C .. archive HEAD data/models data/snapshots data/notes | tar -x -C "$tmp"
RICHTER_BASE=/richter/app/ RICHTER_DATA="$tmp/data" VITE_STATIC=1 \
  npx vite build --outDir ../docs/app --emptyOutDir
echo "built docs/app ($(du -sh ../docs/app | cut -f1))"
