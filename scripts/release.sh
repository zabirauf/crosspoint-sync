#!/usr/bin/env bash
set -euo pipefail

# Release script for CrossPoint Sync
# Creates an annotated git tag from package.json version and a GitHub Release.
# Usage: npm run release

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

# Pull latest to avoid divergence
git pull --ff-only origin main

# --- Read version ---

VERSION=$(node -p "require('./package.json').version")
TAG="v${VERSION}"

if git rev-parse "$TAG" >/dev/null 2>&1; then
  echo "Error: Tag '$TAG' already exists."
  exit 1
fi

echo "Releasing $TAG..."

# --- Extract release notes from CHANGELOG.md ---

NOTES=$(awk -v ver="$VERSION" '
  /^## \[/ {
    if (found) exit
    if (index($0, "[" ver "]")) found=1
    next
  }
  found { print }
' CHANGELOG.md)

if [[ -z "$NOTES" ]]; then
  echo "Warning: No changelog entry found for version $VERSION."
  echo "Continue without release notes? (y/N)"
  read -r CONFIRM
  if [[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]]; then
    echo "Aborted."
    exit 1
  fi
  NOTES="Release $TAG"
fi

# --- Create tag and push ---

git tag -a "$TAG" -m "Release $TAG"
git push origin "$TAG"

echo "Tag '$TAG' pushed."

# --- Create GitHub Release ---

if command -v gh >/dev/null 2>&1; then
  gh release create "$TAG" \
    --title "$TAG" \
    --notes "$NOTES"
  echo "GitHub Release created: $TAG"
else
  echo "Warning: 'gh' CLI not found. Skipping GitHub Release creation."
  echo "Create it manually at: https://github.com/$(git remote get-url origin | sed 's/.*github.com[:/]\(.*\)\.git/\1/')/releases/new?tag=$TAG"
fi

echo "Done."
