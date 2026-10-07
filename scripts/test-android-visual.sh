#!/usr/bin/env bash
set -euo pipefail

# Run through with-dev-env.sh so adb, Maestro, and Java 17 are available.
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"
MAESTRO_BINARY="${MAESTRO_BINARY:-maestro}"
command -v "$MAESTRO_BINARY" >/dev/null || { echo "Install Maestro 2.10+ and add it to PATH." >&2; exit 1; }
command -v adb >/dev/null || { echo "Android platform-tools are required." >&2; exit 1; }
command -v node >/dev/null || { echo "Node.js is required." >&2; exit 1; }
curl -fsS http://localhost:8082/api/status >/dev/null || {
  echo "Start the mock reader first: npm run mock-device" >&2
  exit 1
}

SERIAL="${ANDROID_SERIAL:-}"
if [[ -z "$SERIAL" ]]; then
  DEVICES=()
  while IFS= read -r device; do
    DEVICES+=("$device")
  done < <(adb devices | awk 'NR > 1 && ($2 == "device" || $2 == "offline") { print $1 }')
  if [[ ${#DEVICES[@]} -ne 1 ]]; then
    echo "Start one Android emulator, or select it with ANDROID_SERIAL." >&2
    exit 1
  fi
  SERIAL="${DEVICES[0]}"
fi
wait_for_device() {
  for ((RETRY=0; RETRY<30; RETRY++)); do
    if [[ "$(adb -s "$SERIAL" get-state 2>/dev/null || true)" == device ]]; then
      return 0
    fi
    sleep 1
  done
  echo "Android device $SERIAL did not become ready." >&2
  return 1
}
wait_for_device
if [[ -z "$(adb -s "$SERIAL" shell pm path com.crosspointsync.app)" ]]; then
  echo "Install the CrossPoint Sync APK on $SERIAL first." >&2
  exit 1
fi

# Keep Maestro's configuration and analytics state in the ignored project cache.
mkdir -p "$PROJECT_ROOT/.local/maestro-home/.maestro"
export MAESTRO_CLI_NO_ANALYTICS=1
export MAESTRO_OPTS="${MAESTRO_OPTS:-} -Duser.home=\"$PROJECT_ROOT/.local/maestro-home\""

ORIGINAL_MODE="$(adb -s "$SERIAL" shell cmd uimode night | tr -d '\r' | awk '{ print $NF }')"
case "$ORIGINAL_MODE" in yes|no|auto) ;; *) ORIGINAL_MODE=no ;; esac
trap 'adb -s "$SERIAL" shell cmd uimode night "$ORIGINAL_MODE" >/dev/null 2>&1 || true' EXIT

OUTPUT="${CROSSPOINT_VISUAL_OUTPUT:-$PROJECT_ROOT/test-screenshots/android/$(date -u +%Y%m%dT%H%M%SZ)}"
mkdir -p "$OUTPUT"
if [[ $# -eq 0 ]]; then
  set -- .maestro/flows/
fi

# Use the shared order, but start a fresh Maestro session for each flow. This
# avoids the driver's ADB/gRPC transport failure between flows on this emulator.
node - "$OUTPUT" "$@" <<'NODE'
const fs = require('fs');
const path = require('path');
const YAML = require('yaml');
const output = process.argv[2];
if (fs.existsSync(path.join(output, 'manifest.json'))) {
  throw new Error('Choose a new CROSSPOINT_VISUAL_OUTPUT directory to preserve previous results.');
}
const files = [...new Set(process.argv.slice(3).flatMap(file => fs.statSync(file).isDirectory()
  ? fs.readdirSync(file).filter(name => name.endsWith('.yaml')).map(name => path.join(file, name))
  : [file]))];
const config = YAML.parse(fs.readFileSync('.maestro/config.yaml', 'utf8'));
const order = config.executionOrder?.flowsOrder || [];
const flows = files.map(file => {
  const header = YAML.parseAllDocuments(fs.readFileSync(file, 'utf8'))[0].toJS();
  return {file, name: header.name || path.basename(file, '.yaml'), tags: header.tags || []};
}).filter(flow => !flow.tags.includes('appstore')).sort((a, b) => {
  const rank = name => order.includes(name) ? order.indexOf(name) : order.length;
  return rank(a.name) - rank(b.name) || a.file.localeCompare(b.file);
});
if (!flows.length) throw new Error('No test flows selected.');
flows.forEach((flow, index) => { flow.directory = `flow-${String(index).padStart(2, '0')}-${path.basename(flow.file, '.yaml')}`; });
delete config.executionOrder;
fs.writeFileSync(path.join(output, 'config.yaml'), YAML.stringify(config));
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(flows, null, 2));
fs.writeFileSync(path.join(output, 'flows.txt'), flows.map(flow => `${flow.directory}\t${flow.file}`).join('\n') + '\n');
NODE

STATUS=0
# Keep the manifest on its own descriptor; adb also reads standard input.
while IFS=$'\t' read -r FLOW_DIRECTORY FLOW <&3; do
  FLOW_OUTPUT="$OUTPUT/$FLOW_DIRECTORY"
  mkdir -p "$FLOW_OUTPUT"
  FLOW_STATUS=0
  if wait_for_device && adb -s "$SERIAL" shell cmd uimode night no >/dev/null; then
    "$MAESTRO_BINARY" test --platform android --device "$SERIAL" \
      --no-reinstall-driver --config "$OUTPUT/config.yaml" --exclude-tags appstore \
      --test-output-dir "$FLOW_OUTPUT" --debug-output "$FLOW_OUTPUT/debug" \
      --format JUNIT --output "$FLOW_OUTPUT/results.xml" \
      "$FLOW" </dev/null 2>&1 | tee "$FLOW_OUTPUT/maestro.log" || FLOW_STATUS=$?
  else
    FLOW_STATUS=1
  fi
  printf '%s\n' "$FLOW_STATUS" > "$FLOW_OUTPUT/exit-status.txt"
  if [[ "$FLOW_STATUS" -ne 0 ]]; then STATUS=1; fi
done 3< "$OUTPUT/flows.txt"

# Combine the native per-flow reports, retaining their screenshots and logs.
AGGREGATE_STATUS=0
node - "$OUTPUT" <<'NODE' || AGGREGATE_STATUS=$?
const fs = require('fs');
const path = require('path');
const output = process.argv[2];
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[char]));
const flows = JSON.parse(fs.readFileSync(path.join(output, 'manifest.json'), 'utf8'));
const cases = [];
const summary = flows.map(flow => {
  const directory = path.join(output, flow.directory);
  const statusFile = path.join(directory, 'exit-status.txt');
  const code = fs.existsSync(statusFile) ? Number(fs.readFileSync(statusFile, 'utf8')) : 1;
  const report = path.join(directory, 'results.xml');
  let test = fs.existsSync(report) ? fs.readFileSync(report, 'utf8').match(/<testcase\b[^>]*(?:\/>|>[\s\S]*?<\/testcase>)/)?.[0] : undefined;
  if (!test || (code !== 0 && !/<(?:failure|error)\b/.test(test))) {
    test = `<testcase name="${escape(flow.name)}" file="${escape(flow.file)}"><error message="Maestro exited with status ${code}; see per-flow logs."/></testcase>`;
  }
  const passed = code === 0 && !/<(?:failure|error)\b/.test(test);
  cases.push(test);
  return {...flow, passed, exitCode: code, report: path.join(flow.directory, 'results.xml')};
});
const failures = summary.filter(flow => !flow.passed).length;
fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify({tests: summary.length, passed: summary.length - failures, failed: failures, flows: summary}, null, 2));
fs.writeFileSync(path.join(output, 'results.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites><testsuite name="Android visual flows" tests="${summary.length}" failures="${failures}">\n${cases.join('\n')}\n</testsuite></testsuites>\n`);
console.log(`\nAndroid visual flows: ${summary.length - failures}/${summary.length} passed.`);
if (failures) process.exitCode = 1;
NODE
if [[ "$AGGREGATE_STATUS" -ne 0 ]]; then STATUS=1; fi
printf '\nAndroid visual-test artifacts: %s\n' "$OUTPUT"
exit "$STATUS"
