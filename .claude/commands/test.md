Run the visual testing pipeline and handle any failures. Optional arguments: $ARGUMENTS

## What This Command Does

Run Maestro visual test flows against the running iOS simulator, then run the LLM visual judge to evaluate screenshots against references. If tests fail, diagnose whether failures are expected (due to intentional UI changes) or unexpected (regressions), and take appropriate action.

## Step 0: Ensure Simulator and App Are Running

1. Check if an iOS simulator is booted: `xcrun simctl list devices | grep Booted`
2. If no simulator is booted:
   - Run `npx expo run:ios` to build the app, boot the simulator, and launch the app. This command handles everything — prebuild, native build, simulator boot, install, and launch. Use a timeout of 600000ms (10 min) since native builds can be slow.
   - Wait for the build to complete and the app to launch.
3. If a simulator IS booted but the app might not be running, launch it:
   ```bash
   xcrun simctl launch booted com.crosspointsync.app
   ```
4. Wait a few seconds for the app to fully initialize before running flows.
5. Verify Maestro is available at `~/.maestro/bin/maestro` (or on PATH).
6. For connected-state tests (`requires-device` tag), check if the mock device server is running on port 8082:
   - Run `lsof -i :8082` to check if something is listening.
   - If listening, verify it's the mock server by hitting `curl -s http://localhost:8082/api/status` — it should return valid JSON with device info.
   - If not running, note that `requires-device` flows will be skipped — this is fine for a normal test run. To start the mock server: `npm run mock-device`.

## Step 1: Run Maestro Flows

Run the Maestro test flows to capture screenshots:

```bash
# Clear stale screenshots before each run
rm -rf test-screenshots/*
mkdir -p test-screenshots

~/.maestro/bin/maestro test .maestro/flows/ --test-output-dir test-screenshots/
```

If `$ARGUMENTS` specifies a specific flow or screen name, run only that flow:
```bash
rm -rf test-screenshots/*
mkdir -p test-screenshots
~/.maestro/bin/maestro test .maestro/flows/<matching-flow>.yaml --test-output-dir test-screenshots/
```

If `$ARGUMENTS` says "smoke" or "quick", run only smoke-tagged flows (01, 02, 08, 10).

Note: Some flows may fail if they require a connected device. Flows tagged `requires-device` are expected to fail without the mock server. Do not treat these as regressions.

## Step 1.5: Retry Failed Flows

Maestro flows can be flaky (animation timing, simulator lag, tap not registering). Before diagnosing failures, **re-run only the failed flows** to distinguish flakiness from real issues.

1. After Step 1 completes, identify which flows failed from the Maestro output.
2. Exclude flows that failed because they are tagged `requires-device` and the mock server isn't running — those are expected failures, not flakiness.
3. For each remaining failed flow, re-run it individually:
   ```bash
   ~/.maestro/bin/maestro test .maestro/flows/<failed-flow>.yaml --test-output-dir test-screenshots/
   ```
4. If a flow **passes on retry**, treat it as flaky — it is not a real failure. Use the screenshots from the successful retry.
5. If a flow **fails again on retry**, treat it as a real failure and continue to Step 2 and Step 3 for diagnosis.
6. Report which flows were flaky (passed on retry) so the user is aware, but do not treat them as regressions.

This avoids re-running the entire suite (which is slow) while still catching real failures.

## Step 2: Run LLM Visual Judge

If screenshots were captured, run the visual judge:

```bash
ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY} npx tsx scripts/visual-judge.ts \
  --screenshots test-screenshots/ \
  --references test-references/ios/iphone-16-pro/light/ \
  --specs .maestro/visual-tests/ \
  --run-dir test-runs/
```

Read and display the generated report from `test-runs/latest/report.md`.

## Step 3: Handle Failures

Read the report at `test-runs/latest/report.json` to understand what failed.

For each failing test, determine the cause:

### A) Missing reference screenshots (first run or new screen)
- The judge will report "Reference screenshot missing"
- Action: Tell the user to review the screenshots in `test-screenshots/` and run `./scripts/update-baselines.sh` to commit them as references.

### B) Expected UI change (intentional)
If the user recently made UI changes (check recent git diff) and the failures align with those changes:
1. Update the Maestro flow in `.maestro/flows/` if element text, testIDs, or navigation changed.
2. Update the visual test spec in `.maestro/visual-tests/` — fix assertions, description, and focus_elements to match the new UI.
3. Tell the user to review the new screenshots and update baselines: `./scripts/update-baselines.sh`

### C) Unexpected regression (bug)
If the failure does NOT correspond to intentional changes:
1. Read the LLM judge's detailed reasoning from the report.
2. Identify which component or screen has the regression.
3. Read the relevant source files to understand what went wrong.
4. Fix the regression in the source code.
5. Re-run the failing flow to verify the fix.

### D) Unclear whether expected or not
If you cannot determine whether a failure is intentional:
- Show the user the specific failure details (screenshot name, assertion results, LLM reasoning).
- Ask whether the change was intentional.
- If intentional → follow path B (update tests).
- If not intentional → follow path C (fix regression).

## Rules

- Always show the user a summary of results before taking action on failures.
- Never update reference screenshots without telling the user — they should review them first.
- When updating visual test specs, only change assertions that are actually affected. Don't rewrite entire spec files.
- When fixing regressions, make minimal targeted fixes. Don't refactor surrounding code.
- If Maestro flows fail to run (not screenshot comparison failures, but actual flow execution errors like "element not found"), check if testIDs are present on the relevant components before assuming it's a code bug.
- After fixing failures and re-running, show the updated results.
