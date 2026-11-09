#!/usr/bin/env bash
set -euo pipefail

# Requires ImageMagick. The editable SVG is the source; PNGs are native UIKit
# template images so the system controls selected, inactive and dark-mode tint.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

for SCALE in 1 2 3; do
  SUFFIX=""
  if [[ "$SCALE" != 1 ]]; then SUFFIX="@${SCALE}x"; fi
  magick -background none -density 384 assets/icons/reader.svg \
    -resize "$((24 * SCALE))x$((28 * SCALE))!" \
    "PNG32:assets/icons/reader${SUFFIX}.png"
done
