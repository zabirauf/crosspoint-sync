Generate polished GitHub Release notes for CrossPoint Sync.

Steps:
1. Read `package.json` to get the current version.
2. Read `CHANGELOG.md` and extract the entries for the current version.
3. Find the last git tag and review `git log --oneline <last-tag>..HEAD` plus `git diff --stat <last-tag>..HEAD` for additional context.
4. Read key changed files if needed to add context beyond what the changelog covers.
5. Generate release notes in this format:

```
## What's New

<1-2 sentence summary of the release — what's the headline?>

### Added
- Bullet points from changelog, polished for a public audience

### Changed
- ...

### Fixed
- ...

### Removed
- ...
```

Guidelines:
- Write for end users, not developers.
- Keep it concise — this goes in a GitHub Release body.
- Omit empty categories.
- Do NOT edit any files — just output the release notes text so I can copy it or pipe it into `gh release create`.
