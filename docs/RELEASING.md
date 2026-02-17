# Releasing CrossPoint Sync

## Version Locations

| Field | File | Purpose |
|---|---|---|
| `version` | `package.json` | Source of truth (SemVer) |
| `expo.version` | `app.json` | iOS CFBundleShortVersionString (auto-synced) |
| `ios.buildNumber` | EAS remote | CFBundleVersion (auto-incremented by EAS) |

RC designations live only in git tags (e.g. `v1.0.0-rc.1`). The `package.json` and `app.json` always contain the clean target version — App Store Connect rejects pre-release suffixes.

## Workflows

### Cutting a Release Candidate

1. Ensure all changes are committed and pushed to `main`.

2. Generate changelog entries:
   ```
   /project:changelog
   ```
   Review the output, edit as needed, and commit updates to `CHANGELOG.md`.

3. Run the RC script:
   ```bash
   npm run release:rc
   ```
   This auto-detects the next RC number (e.g. `v1.0.0-rc.2`), creates an annotated tag, pushes it, and creates a GitHub pre-release.

### Promoting to a Full Release

1. Finalize `CHANGELOG.md` — update the date on the version header:
   ```markdown
   ## [1.0.0] - 2025-06-15
   ```

2. Generate release notes:
   ```
   /project:release-notes
   ```

3. Commit the changelog update.

4. Run the release script:
   ```bash
   npm run release
   ```
   This creates an annotated tag from `package.json` version, pushes it, and creates a GitHub Release with notes extracted from `CHANGELOG.md`.

### Bumping the Version (After a Release)

After releasing, bump the version for the next development cycle:

```bash
# For a patch release (1.0.0 → 1.0.1):
npm run version:bump -- patch

# For a minor release (1.0.0 → 1.1.0):
npm run version:bump -- minor

# For a major release (1.0.0 → 2.0.0):
npm run version:bump -- major
```

This updates both `package.json` and `app.json` automatically (via the `postversion` hook). Then add a new `## [x.y.z] - Unreleased` section to `CHANGELOG.md` and commit:

```bash
git add package.json app.json CHANGELOG.md
git commit -m "chore: bump version to x.y.z"
```

### Hotfixes

1. Fix the issue on `main` and commit.
2. Bump the patch version: `npm run version:bump -- patch`
3. Update `CHANGELOG.md` with the fix under the new version.
4. Commit, then run `npm run release`.

## Building & Publishing

### Android

1. Build the production `.aab` locally via EAS:
   ```bash
   eas build --platform android --profile production --local
   ```
2. Upload the resulting `.aab` file to [Google Play Console](https://play.google.com/console).

### iOS

1. Open `ios/CrossPointSync.xcworkspace` in Xcode.
2. Select **Product → Archive**.
3. In the Xcode Organizer, click **Distribute App** to upload to App Store Connect.

## Commit Message Convention

Lightweight prefixes (not enforced, just a guideline):

| Prefix | Meaning | Changelog Category |
|---|---|---|
| `add:` | New feature | Added |
| `fix:` | Bug fix | Fixed |
| `change:` | Modify existing behavior | Changed |
| `remove:` | Remove feature | Removed |
| `docs:` | Documentation | — |
| `chore:` | Build/deps/config | — |

These help Claude Code categorize changes more accurately when generating changelogs via `/project:changelog`.
