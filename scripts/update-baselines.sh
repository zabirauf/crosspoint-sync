#!/bin/bash
# Update visual test reference baselines from the latest test screenshots.
#
# Usage:
#   ./scripts/update-baselines.sh                          # iOS light mode (default)
#   ./scripts/update-baselines.sh android pixel-8 dark     # Android dark mode

set -euo pipefail

PLATFORM="${1:-ios}"
DEVICE="${2:-iphone-16-pro}"
THEME="${3:-light}"

SRC_DIR="test-screenshots"
DEST_DIR="test-references/${PLATFORM}/${DEVICE}/${THEME}"

if [ ! -d "$SRC_DIR" ]; then
  echo "Error: $SRC_DIR not found. Run Maestro flows first to capture screenshots."
  exit 1
fi

mkdir -p "$DEST_DIR"

COUNT=0
for f in "$SRC_DIR"/*.png; do
  [ -f "$f" ] || continue
  cp "$f" "$DEST_DIR/"
  echo "  Updated: $(basename "$f")"
  COUNT=$((COUNT + 1))
done

if [ "$COUNT" -eq 0 ]; then
  echo "No screenshots found in $SRC_DIR"
  exit 1
fi

echo ""
echo "Updated $COUNT reference screenshots in $DEST_DIR"
echo "Review them and commit: git add $DEST_DIR && git commit -m 'Update visual test baselines'"
