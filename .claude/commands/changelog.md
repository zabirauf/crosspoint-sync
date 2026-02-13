Generate changelog entries for CrossPoint Sync.

Steps:
1. Find the last git tag by running `git describe --tags --abbrev=0 HEAD 2>/dev/null`. If no tags exist, use the initial commit hash from `git rev-list --max-parents=0 HEAD`.
2. Run `git log --oneline <last-tag>..HEAD` to see all commits since the last tag.
3. Run `git diff --stat <last-tag>..HEAD` to see which files changed.
4. Read the key changed files to understand what actually changed (not just commit messages).
5. Read the current `CHANGELOG.md` to understand the existing format and entries.
6. Draft new changelog entries in [Keep a Changelog](https://keepachangelog.com/) format, categorized as:
   - **Added** — new features
   - **Changed** — changes to existing functionality
   - **Fixed** — bug fixes
   - **Removed** — removed features
7. Present the draft entries to me for review. Do NOT directly edit CHANGELOG.md — just show me the proposed entries so I can review, edit, and decide where to insert them.

Guidelines:
- Write entries from the user's perspective, not the developer's.
- Be concise — one line per change, no implementation details.
- Group related commits into single entries where appropriate.
- Use commit message prefixes (add:/fix:/change:/remove:) as hints but verify against the actual code diffs.
- Omit pure chore/docs/config commits unless they affect the user experience.
