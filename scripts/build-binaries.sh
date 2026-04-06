#!/usr/bin/env bash
set -euo pipefail

echo "Building adpilot binaries..."

# Build TypeScript first
npm run build

# Install pkg if not present
npx pkg dist/index.js \
  --targets node20-macos-x64,node20-macos-arm64,node20-linux-x64,node20-win-x64 \
  --output dist/bin/adpilot \
  --compress GZip

echo ""
echo "Binaries created:"
ls -lh dist/bin/
