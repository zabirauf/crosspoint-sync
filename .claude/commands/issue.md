Manage the file-based issue tracker in `docs/issues/`. The user's request: $ARGUMENTS

## Issue Tracker Location

All issues live in `docs/issues/`. Each issue is a markdown file with YAML front matter. The `docs/issues/README.md` is the index with summary tables.

## Supported Actions

Interpret the user's `$ARGUMENTS` to determine what they want. Common actions:

### Create a new issue
1. Read `docs/issues/README.md` to find the current highest number for the issue type (BUG, FEAT, UX, PERF, TODO).
2. Assign the next sequential number (do NOT reuse deleted numbers — always increment past the highest ever used). Zero-pad to 3 digits.
3. Create the file `docs/issues/{TYPE}-{NNN}-{short-slug}.md` with this front matter:

```yaml
---
id: {TYPE}-{NNN}
type: bug | feature | ux | performance | todo
title: Short descriptive title
status: open
priority: critical | high | medium | low
source: reddit-beta | reddit-appstore | github | internal
reporter: ""
date_reported: {today's date YYYY-MM-DD}
date_closed:
labels: []
blocked_by: ""
related: []
reddit_thread: ""
---
```

4. Write a description section with all relevant details the user provides.
5. Add the issue to the correct summary table in `docs/issues/README.md`, preserving the existing row order. Bugs go in the Bugs table, features in Feature Requests, TODOs in the TODOs table.
6. Show the user the created issue ID and filename.

### List issues
- Read `docs/issues/README.md` and display the summary tables.

### View an issue
- Read the specific issue file and display its contents.

### Update an issue (change status, priority, details, etc.)
1. Read the issue file.
2. Apply the requested changes to the front matter and/or body.
3. Update the corresponding row in `docs/issues/README.md` if status or priority changed.

### Close an issue
1. Read the issue file and set `status: closed` and `date_closed: {today's date}`.
2. Remove the row from its table in `docs/issues/README.md`.
3. Add it to the "Closed / Declined" table with the outcome.

### Delete an issue
1. Delete the issue file.
2. Remove its row from `docs/issues/README.md`.
3. Remove any `related` cross-references to it from other issue files.

## Rules

- Always read `docs/issues/README.md` before making changes to understand the current state.
- Always keep `docs/issues/README.md` in sync with individual issue files.
- When creating issues, ask the user for any missing details (title, priority, type) rather than guessing.
- Use the naming convention `{TYPE}-{NNN}-{short-slug}.md` where the slug is lowercase, hyphen-separated, and descriptive.
- Today's date for `date_reported` or `date_closed` should use YYYY-MM-DD format.
- When the user says "bug" use type BUG, "feature" use FEAT, "ux issue" use UX, "perf issue" use PERF, "todo" use TODO.
- Use TODO for internal technical tasks, migrations, follow-ups, and maintenance work (not user-facing features).
- If the user just describes a problem or request without specifying an action, default to creating a new issue.
