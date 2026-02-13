#!/usr/bin/env bash
set -euo pipefail

# Release Candidate script for CrossPoint Sync
# Auto-detects next RC number from existing tags and creates a GitHub pre-release.
# Usage: npm run release:rc

# --- Preflight checks ---

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Error: Working tree is not clean. Commit or stash changes first."
  exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [[ "$BRANCH" != "main" ]]; then
  echo "Error: Must be on 'main' branch (currently on '$BRANCH')."
  exit 1
fi

git pull --ff-only origin main

# --- Determine next RC number ---

VERSION=$(node -p "require('./package.json').version")
BASE_TAG="v${VERSION}"

# Find highest existing RC number for this version (macOS-compatible sed)
LAST_RC=$(git tag --list "${BASE_TAG}-rc.*" | sed "s/${BASE_TAG}-rc\.//" | sort -n | tail -1)

if [[ -z "$LAST_RC" ]]; then
  NEXT_RC=1
else
  NEXT_RC=$((LAST_RC + 1))
fi

TAG="${BASE_TAG}-rc.${NEXT_RC}"

echo "Creating release candidate: $TAG"

# --- Create tag and push ---

git tag -a "$TAG" -m "Release candidate ${NEXT_RC} for ${VERSION}"
git push origin "$TAG"

echo "Tag '$TAG' pushed."

# --- Create GitHub pre-release ---

if command -v gh >/dev/null 2>&1; then
  # Build notes from recent commits since last tag
  PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")
  if [[ -n "$PREV_TAG" ]]; then
    NOTES=$(git log --oneline "${PREV_TAG}..HEAD")
  else
    NOTES=$(git log --oneline -10)
  fi

  gh release create "$TAG" \
    --title "$TAG" \
    --notes "Release candidate ${NEXT_RC} for v${VERSION}

### Changes since ${PREV_TAG:-initial commit}
${NOTES}" \
    --prerelease
  echo "GitHub pre-release created: $TAG"
else
  echo "Warning: 'gh' CLI not found. Skipping GitHub Release creation."
  echo "Create it manually at: https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/releases/new?tag=$TAG&prerelease=1"
fi

echo "Done."
