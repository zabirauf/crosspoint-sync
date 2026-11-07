#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"
OUTPUT="${CROSSPOINT_VISUAL_OUTPUT:-$PROJECT_ROOT/test-screenshots/flows/$(date -u +%Y%m%dT%H%M%SZ)}"
if [[ -d "$OUTPUT" && -n "$(find "$OUTPUT" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
  echo "Choose an empty CROSSPOINT_VISUAL_OUTPUT directory to preserve earlier test results." >&2
  exit 1
fi
mkdir -p "$OUTPUT"
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_OPTS="${MAESTRO_OPTS:-} -Duser.home=\"$PROJECT_ROOT/.local/maestro-home\""
MAESTRO_BINARY="${MAESTRO_BINARY:-maestro}"

# Recover only a selected iOS simulator, never an arbitrary booted device or a
# physical reader/phone. Other platforms retain the normal Maestro invocation.
PLATFORM=""
DEVICE=""
ARGS=("$@")
for ((INDEX=0; INDEX<${#ARGS[@]}; INDEX++)); do
  case "${ARGS[INDEX]}" in
    --platform|-p) PLATFORM="${ARGS[INDEX+1]:-}" ;;
    --platform=*) PLATFORM="${ARGS[INDEX]#*=}" ;;
    --device|--udid) DEVICE="${ARGS[INDEX+1]:-}" ;;
    --device=*|--udid=*) DEVICE="${ARGS[INDEX]#*=}" ;;
  esac
done

IOS_SIMULATOR=""
SIMULATOR_STATE=""
if [[ "$PLATFORM" == ios && -n "$DEVICE" ]]; then
  read -r IOS_SIMULATOR SIMULATOR_STATE < <(node - "$DEVICE" <<'NODE'
const { execFileSync } = require('node:child_process');
const inventory = JSON.parse(execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], { encoding: 'utf8' }));
const device = Object.values(inventory.devices).flat().find(device => device.udid === process.argv[2]);
console.log(device ? `${device.udid} ${device.state}` : 'none unknown');
NODE
  )
  if [[ "$IOS_SIMULATOR" == none ]]; then IOS_SIMULATOR=""; fi
fi

if [[ -n "$IOS_SIMULATOR" ]]; then
  if [[ "$SIMULATOR_STATE" != Booted ]]; then xcrun simctl boot "$IOS_SIMULATOR"; fi
  xcrun simctl bootstatus "$IOS_SIMULATOR" -b
  export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-60000}"
fi

run_flows() {
  local attempt_output="$1"
  mkdir -p "$attempt_output"
  # Run the workspace, including config.yaml and its ordered flow discovery.
  "$MAESTRO_BINARY" test --exclude-tags appstore --test-output-dir "$attempt_output" .maestro/ "${ARGS[@]}" \
    2>&1 | tee "$attempt_output/maestro.log"
  return "${PIPESTATUS[0]}"
}

accessibility_startup_failed() {
  # Once flow execution starts, assertions/timeouts/crashes must stay failures.
  if grep -Fq 'Waiting for flows to complete' "$OUTPUT/maestro.log"; then return 1; fi
  local driver_log
  while IFS= read -r driver_log; do
    if grep -Eq 'Failed call to AXDisableAccessibilityOnTermination: kAXErrorCannotComplete|Timed out waiting for AX loaded notification' "$driver_log"; then
      return 0
    fi
  done < <(find "$OUTPUT" -type f -name 'xctest_runner*.log')
  return 1
}

STATUS=0
run_flows "$OUTPUT" || STATUS=$?
if [[ "$STATUS" -ne 0 && -n "$IOS_SIMULATOR" ]] && accessibility_startup_failed; then
  echo "XCTest accessibility failed before flow execution; restarting simulator $IOS_SIMULATOR once."
  echo "Original startup logs are preserved in $OUTPUT."
  xcrun simctl shutdown "$IOS_SIMULATOR"
  xcrun simctl boot "$IOS_SIMULATOR"
  xcrun simctl bootstatus "$IOS_SIMULATOR" -b
  STATUS=0
  run_flows "$OUTPUT/startup-retry" || STATUS=$?
fi
node scripts/collect-visual-screenshots.cjs "$OUTPUT"
ln -sfn "$OUTPUT" "$PROJECT_ROOT/test-screenshots/latest"
exit "$STATUS"
