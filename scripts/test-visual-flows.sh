#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"
OUTPUT="${CROSSPOINT_VISUAL_OUTPUT:-$PROJECT_ROOT/test-screenshots/flows/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUTPUT"
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_OPTS="${MAESTRO_OPTS:-} -Duser.home=\"$PROJECT_ROOT/.local/maestro-home\""

STATUS=0
# Run the workspace, including config.yaml and its ordered flow discovery.
maestro test --exclude-tags appstore --test-output-dir "$OUTPUT" .maestro/ "$@" || STATUS=$?
node scripts/collect-visual-screenshots.cjs "$OUTPUT"
ln -sfn "$OUTPUT" "$PROJECT_ROOT/test-screenshots/latest"
exit "$STATUS"
