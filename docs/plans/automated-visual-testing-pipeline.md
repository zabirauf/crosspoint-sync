# Automated Visual Testing Pipeline for CrossPoint Sync

## Executive Summary

A fully automated testing pipeline that runs UI scenarios on iOS and Android simulators/emulators, captures screenshots at key states, uses LLM vision models (Claude) to judge visual correctness against reference screenshots, and reports pass/fail results for each test in a checklist.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CI Trigger (GitHub Actions)               │
│         Push / PR / Scheduled / Manual Dispatch              │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│              Phase 1: Build App for Simulators               │
│                                                             │
│  iOS:  npx expo prebuild --platform ios --clean             │
│        xcodebuild -workspace ... -sdk iphonesimulator       │
│                                                             │
│  Android: npx expo prebuild --platform android --clean      │
│           ./gradlew assembleDebug                           │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│           Phase 2: Launch Simulators & Install App           │
│                                                             │
│  iOS:  xcrun simctl boot "iPhone 16 Pro"                    │
│        xcrun simctl install booted <app-path>               │
│        xcrun simctl launch booted com.crosspointsync.app    │
│                                                             │
│  Android: emulator @Pixel_8 -no-window -no-audio            │
│           adb install <apk-path>                            │
│           adb shell am start -n <package>/<activity>        │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│          Phase 3: Run Maestro E2E Test Flows                 │
│                                                             │
│  maestro test .maestro/ --format junit --output results/    │
│                                                             │
│  Each flow:                                                 │
│    1. Navigate to screen                                    │
│    2. Interact with UI elements                             │
│    3. takeScreenshot at key states                          │
│    4. assertWithAI for semantic checks (optional)           │
│    5. Screenshots saved to test-screenshots/                │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│         Phase 4: LLM Vision Judgment (Claude API)            │
│                                                             │
│  Node.js script: scripts/visual-judge.ts                    │
│                                                             │
│  For each test screenshot:                                  │
│    1. Load current screenshot + reference screenshot        │
│    2. Send both to Claude Vision API with structured prompt │
│    3. Claude returns JSON: pass/fail + reasoning + severity │
│    4. Aggregate results into test report                    │
│                                                             │
│  Judgment criteria per test:                                │
│    - Layout correctness (element positions, spacing)        │
│    - Text content accuracy (labels, values, counts)         │
│    - Visual state (colors, icons, enabled/disabled)         │
│    - Element presence/absence                               │
│    - No UI defects (truncation, overlap, misalignment)      │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│           Phase 5: Report Generation & PR Comment            │
│                                                             │
│  Generate:                                                  │
│    - JSON report with per-test pass/fail + LLM reasoning    │
│    - Markdown summary posted as PR comment (via gh CLI)     │
│    - JUnit XML for CI integration                           │
│    - Side-by-side diff images (reference vs current)        │
│    - Exit code 0 (all pass) or 1 (any fail)                │
└─────────────────────────────────────────────────────────────┘
```

---

## Tool Selection

### E2E Test Runner: **Maestro**

**Why Maestro over alternatives:**

| Criteria | Maestro | Detox | Appium |
|----------|---------|-------|--------|
| Expo SDK 54 support | Official (Expo recommends it) | Community/unofficial | Works but complex |
| Setup complexity | Minimal (curl install) | High (native build config) | Very high |
| Test authoring | YAML (readable) | JavaScript | Multi-language |
| Built-in AI assertions | `assertWithAI` | None | None |
| Screenshot capture | Native `takeScreenshot` | `device.takeScreenshot()` | WebDriver API |
| CI/CD integration | First-class | Good | Good |
| Cross-platform | iOS + Android | iOS + Android | iOS + Android |
| Flakiness | Low (built-in retry/tolerance) | Low (gray-box sync) | High |

**Key Maestro features we use:**
- `takeScreenshot` — captures PNGs at any point in a flow (supports `cropOn` to crop to a specific element)
- `assertScreenshot` — **built-in visual regression** (v2.2.0+) that compares against reference images with a configurable `thresholdPercentage` (default 95%). Supports `cropOn` for element-level comparison. This handles pixel-level regression natively inside Maestro — no external pixel-diff tool needed for basic cases.
- `assertWithAI` — built-in LLM assertion for semantic checks (requires Maestro Cloud API key or direct `MAESTRO_CLI_AI_KEY` for OpenAI/Anthropic)
- `assertNoDefectsWithAI` — automatic UI defect detection (truncation, overlap, misalignment)
- `extractTextWithAI` — extract text/values from screenshots into variables for subsequent assertions
- YAML flows — human-readable, easy to maintain
- `testID`-based element selection (via `accessibilityLabel` in React Native)
- **MCP Server** (`maestro mcp`) — exposes 14 device automation tools to LLM agents, enabling Claude to directly interact with the running app, take screenshots, and inspect the view hierarchy

### LLM Vision Judge: **Claude API (claude-sonnet-4-6)**

Using Claude's vision capabilities to compare test screenshots against reference images. Claude Sonnet provides the best balance of accuracy and cost for visual comparison tasks.

**Why a custom LLM judge instead of only Maestro's `assertWithAI`:**
- Maestro's `assertWithAI` requires Maestro Cloud (network dependency, cost)
- Custom judge allows reference image comparison (not just semantic assertions)
- Full control over judgment criteria, prompts, and structured output
- Can run entirely self-hosted with just an API key
- Supports comparing against historical baselines stored in the repo

### Three-Layer Validation Architecture

The pipeline uses a **layered approach** that minimizes cost and maximizes accuracy:

1. **Layer 1 — Maestro `assertScreenshot`** (built-in, fast, runs during flow execution):
   Pixel-level visual regression with configurable threshold. If the screenshot matches the reference at ≥95%, it passes instantly. Handles the majority of cases with zero external dependencies.

2. **Layer 2 — LLM Vision Judge** (Claude API, runs post-flow):
   For screenshots that fail `assertScreenshot` OR for semantic checks that pixel comparison can't handle (e.g., "does this screen look like a file browser?", "is the device card showing connected status?"). Uses Claude's tool_choice for guaranteed JSON schema compliance.

3. **Layer 3 — Human review** (flagged in PR comments):
   For ambiguous cases where the LLM flags low confidence (<0.7). The Markdown report includes side-by-side images and LLM reasoning for quick triage.

**When each layer fires:**
- Pixel-identical → Layer 1 passes, done (free, instant)
- Pixel diff <5% → Layer 1 passes at 95% threshold, done (free, instant)
- Pixel diff >5% → Layer 1 fails, Layer 2 (LLM) determines if changes are meaningful vs. rendering artifacts
- LLM confidence <0.7 → Layer 3, flagged for human review in PR comment

This means LLM API costs are only incurred for genuine visual changes — in steady state (no UI changes), the cost is $0.

---

## Detailed Implementation Plan

### Step 0: Prerequisites — Add testIDs to Components

The codebase currently has **zero** `testID` props. Maestro uses `testID` (mapped to `accessibilityLabel` in React Native) to locate elements.

**Files to modify:**

```
app/(tabs)/index.tsx          — Library screen elements
app/(tabs)/settings.tsx       — Settings screen elements
app/(tabs)/_layout.tsx         — Tab bar items
components/ConnectionPill.tsx  — Connection status indicator
components/ConnectionSheet.tsx — Device discovery/connection sheet
components/ActionFAB.tsx       — Floating action button
components/FileRow.tsx         — File list items
components/SwipeableFileRow.tsx — Swipeable file rows
components/DeviceCard.tsx      — Device info card
components/UploadJobCard.tsx   — Upload progress card
components/UploadStatusBar.tsx — Upload status bar
components/UploadQueueSheet.tsx — Upload queue sheet
components/EmptyState.tsx      — Empty state display
components/ScanningIndicator.tsx — Scanning animation
```

**Naming convention:** `<ScreenName>.<ElementName>` (e.g., `Library.FileList`, `Settings.UploadPathRow`, `Connection.ScanButton`)

---

### Step 1: Maestro Test Flows

Create `.maestro/` directory with YAML flows for each screen and user journey.

**Directory structure:**

```
.maestro/
  config.yaml                 # Global Maestro config
  flows/
    01-app-launch.yaml        # App cold start, splash screen dismissal
    02-library-disconnected.yaml  # Library tab with no device connected
    03-device-connection.yaml     # Open connection sheet, scan/manual IP
    04-library-connected.yaml     # Library with files loaded
    05-file-navigation.yaml       # Navigate folders, breadcrumb
    06-upload-flow.yaml           # Pick file, queue upload, progress
    07-upload-queue.yaml          # Upload queue sheet, retry/cancel
    08-settings-screen.yaml       # All settings options
    09-settings-edit.yaml         # Change upload path, toggle debug logs
    10-fab-menu.yaml              # FAB menu: document picker, new folder
    11-dark-mode.yaml             # Dark mode appearance
    12-about-modal.yaml           # About modal
    13-empty-states.yaml          # Various empty states
  helpers/
    navigate-to-library.yaml  # Reusable: ensure Library tab is active
    navigate-to-settings.yaml # Reusable: ensure Settings tab is active
  visual-tests/               # LLM judge specs (YAML, human + agent authored)
    library-disconnected.yaml
    library-connected.yaml
    settings-main.yaml
    upload-queue-active.yaml
    connection-sheet.yaml
    ...                       # One file per screen/scenario
test-runs/                    # Run history (last N=2 runs, committed by CI)
  latest -> run-<timestamp>   # Symlink to most recent
  run-<timestamp>/            # Each run's full artifacts
    meta.json                 # Git SHA, branch, platform, summary stats
    report.json               # Per-test LLM judge results
    report.md                 # Markdown summary (posted to PR)
    screenshots/              # All captured screenshots
    maestro-output/           # Raw Maestro output (JUnit XML, logs)
```

**Example flow — `02-library-disconnected.yaml`:**

```yaml
appId: com.crosspointsync.app
name: "Library - Disconnected State"
---
# Wait for app to fully load
- waitForAnimationToEnd

# Verify we're on the Library tab
- assertVisible: "Library"

# Verify empty state message is shown
- assertVisible: "Connect to a device"

# Verify the connection pill shows disconnected
- assertVisible:
    id: "Library.ConnectionPill"

# Layer 1: Pixel-level visual regression against reference
- takeScreenshot: library-disconnected
- assertScreenshot:
    path: test-references/ios/library-disconnected.png
    thresholdPercentage: 95

# Layer 1b: AI defect detection (optional, requires API key)
- assertNoDefectsWithAI
```

**Example flow — `04-library-connected.yaml`:**

```yaml
appId: com.crosspointsync.app
name: "Library - Connected with Files"
tags:
  - requires-device  # Skipped when no mock device available
---
- waitForAnimationToEnd

# Navigate to Library tab
- runFlow: helpers/navigate-to-library.yaml

# Verify file list is populated
- assertVisible:
    id: "Library.FileList"

# Verify connection pill shows connected
- assertVisible:
    id: "Library.ConnectionPill"

# Layer 1: Pixel-level visual regression
- takeScreenshot: library-connected-files
- assertScreenshot:
    path: test-references/ios/library-connected-files.png
    thresholdPercentage: 95

# Layer 1b: Element-level cropped comparison (e.g., just the device card)
- assertScreenshot:
    path: test-references/ios/connection-pill-connected.png
    thresholdPercentage: 99
    cropOn:
      id: "Library.ConnectionPill"

# Layer 2: Semantic AI check (LLM judge)
- assertWithAI: "The screen shows a file browser with a list of files and folders. There is a connected status indicator in the header and a floating action button in the bottom right."
```

**Example flow — `08-settings-screen.yaml`:**

```yaml
appId: com.crosspointsync.app
name: "Settings Screen"
---
- waitForAnimationToEnd

# Navigate to Settings tab
- tapOn:
    id: "TabBar.Settings"

- waitForAnimationToEnd

# Take screenshot of settings screen
- takeScreenshot: settings-main

# Verify key settings rows exist
- assertVisible: "Upload Path"
- assertVisible: "Clip Path"
- assertVisible: "Debug Logs"

# Verify About section
- assertVisible: "About"
- assertVisible: "CrossPoint Sync"

# AI assertion
- assertWithAI: "The settings screen shows configuration options including upload path, clip path, debug logs toggle, and an about section with the app name."

- takeScreenshot: settings-full
```

---

### Step 2: Reference Screenshot Management

**Strategy:** Store reference screenshots in the repo under `test-references/`, organized by platform, device, and flow name.

```
test-references/
  ios/
    iphone-16-pro/
      light/
        library-disconnected.png
        library-connected-files.png
        library-connected-full.png
        settings-main.png
        settings-full.png
        ...
      dark/
        library-disconnected.png
        ...
    ipad-pro-13/
      light/
        ...
  android/
    pixel-8/
      light/
        ...
```

**Baseline capture workflow:**
1. Run Maestro flows with `--output` flag to capture screenshots
2. Human reviews screenshots for correctness
3. Approved screenshots are committed to `test-references/`
4. A `scripts/update-baselines.sh` script automates the capture-and-copy process

**When to update baselines:**
- After intentional UI changes
- When adding new screens/features
- After upgrading Tamagui or other UI libraries

---

### Step 3: LLM Vision Judge Script

Create `scripts/visual-judge.ts` — a Node.js script that:

1. Reads all test screenshots from the Maestro output directory
2. Pairs each with its reference screenshot
3. Sends both images to Claude Vision API with a structured prompt
4. Parses the response and generates a test report

**Claude Vision prompt structure:**

```typescript
const JUDGE_SYSTEM_PROMPT = `You are a mobile app visual QA judge. You compare test screenshots
against reference screenshots to determine if the app's UI is rendering correctly.

For each comparison, evaluate these criteria:
1. LAYOUT: Are elements positioned correctly? Same spacing, alignment, and sizing?
2. CONTENT: Are text labels, values, and counts correct?
3. VISUAL STATE: Are colors, icons, and enabled/disabled states correct?
4. ELEMENTS: Are all expected elements present? Are there unexpected elements?
5. DEFECTS: Any text truncation, overlap, misalignment, or rendering artifacts?

Respond with this exact JSON structure:
{
  "verdict": "pass" | "fail" | "warning",
  "confidence": 0.0-1.0,
  "criteria": {
    "layout": { "pass": boolean, "notes": "..." },
    "content": { "pass": boolean, "notes": "..." },
    "visual_state": { "pass": boolean, "notes": "..." },
    "elements": { "pass": boolean, "notes": "..." },
    "defects": { "pass": boolean, "notes": "..." }
  },
  "summary": "One-sentence summary of the comparison",
  "differences": ["List of specific differences found, if any"]
}`;
```

**API call structure — Structured Outputs via Tool Use (guaranteed JSON schema):**

Using Claude's `tool_choice` with a forced tool call guarantees the response conforms to our exact JSON schema — no parsing failures or malformed output:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

// Tool definition that enforces our judgment schema
const VISUAL_TEST_TOOL = {
  name: 'report_visual_test_result',
  description: 'Report the results of a visual UI comparison test',
  input_schema: {
    type: 'object' as const,
    properties: {
      verdict: { type: 'string', enum: ['pass', 'fail', 'warning'] },
      confidence: { type: 'number', description: '0.0-1.0' },
      criteria: {
        type: 'object',
        properties: {
          layout:       { type: 'object', properties: { pass: { type: 'boolean' }, notes: { type: 'string' } }, required: ['pass', 'notes'] },
          content:      { type: 'object', properties: { pass: { type: 'boolean' }, notes: { type: 'string' } }, required: ['pass', 'notes'] },
          visual_state: { type: 'object', properties: { pass: { type: 'boolean' }, notes: { type: 'string' } }, required: ['pass', 'notes'] },
          elements:     { type: 'object', properties: { pass: { type: 'boolean' }, notes: { type: 'string' } }, required: ['pass', 'notes'] },
          defects:      { type: 'object', properties: { pass: { type: 'boolean' }, notes: { type: 'string' } }, required: ['pass', 'notes'] },
        },
        required: ['layout', 'content', 'visual_state', 'elements', 'defects'],
      },
      summary: { type: 'string' },
      differences: { type: 'array', items: { type: 'string' } },
    },
    required: ['verdict', 'confidence', 'criteria', 'summary', 'differences'],
  },
};

// Step 1: Fast pixel-diff pre-filter
function pixelDiffCheck(refPath: string, testPath: string): { diffPixels: number; diffPercent: number } {
  const ref = PNG.sync.read(readFileSync(refPath));
  const test = PNG.sync.read(readFileSync(testPath));
  const { width, height } = ref;
  const diff = new PNG({ width, height });
  const diffPixels = pixelmatch(ref.data, test.data, diff.data, width, height, { threshold: 0.1 });
  return { diffPixels, diffPercent: (diffPixels / (width * height)) * 100 };
}

// Step 2: LLM judge (only called when pixel diff detects changes)
async function judgeScreenshot(
  testScreenshotPath: string,
  referenceScreenshotPath: string,
  testName: string,
  context: string
): Promise<JudgmentResult> {
  // Pre-filter: skip LLM call if screenshots are identical
  const { diffPercent } = pixelDiffCheck(referenceScreenshotPath, testScreenshotPath);
  if (diffPercent === 0) {
    return { verdict: 'pass', confidence: 1.0, criteria: { /* all pass */ }, summary: 'Pixel-identical to reference', differences: [] };
  }

  const client = new Anthropic();
  const refImage = readFileSync(referenceScreenshotPath).toString('base64');
  const testImage = readFileSync(testScreenshotPath).toString('base64');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: JUDGE_SYSTEM_PROMPT,
    tools: [VISUAL_TEST_TOOL],
    tool_choice: { type: 'tool', name: 'report_visual_test_result' },
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'REFERENCE screenshot (expected state):' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: refImage } },
        { type: 'text', text: 'TEST screenshot (current state):' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: testImage } },
        { type: 'text', text: `Test: "${testName}"\nContext: ${context}\n\nPixel diff: ${diffPercent.toFixed(2)}% of pixels differ.\nCompare the screenshots and determine if the visual differences are meaningful regressions or acceptable variations (anti-aliasing, sub-pixel rendering).` },
      ],
    }],
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (toolUse?.type === 'tool_use') return toolUse.input as JudgmentResult;
  throw new Error('No structured result from Claude');
}
```

**Key advantages of tool_choice approach:**
- **Guaranteed schema compliance** — no JSON.parse failures
- **Hybrid pre-filter** — pixelmatch skips the LLM call when screenshots are identical
- **Pixel diff context** — tells Claude the % of changed pixels so it can calibrate its judgment

**Visual test specs (`.maestro/visual-tests/*.yaml`):**

Instead of a flat JSON manifest, each screen/scenario gets its own **YAML visual test spec** that declaratively defines what the LLM judge should evaluate. These specs are the single source of truth for Layer 2 assertions — writable by both humans and agents.

See [Step 3b: Visual Test Spec Format](#step-3b-visual-test-spec-format) for the full schema, examples, and agent authoring workflow.

---

### Step 3b: Visual Test Spec Format

Each visual test is defined as a YAML file in `.maestro/visual-tests/`. The spec declares **what** the LLM judge should look for — separate from the Maestro flow that navigates to the screen and captures the screenshot. This separation means:

- Maestro flows handle **navigation + screenshot capture** (Layer 1)
- Visual test specs handle **semantic LLM evaluation** (Layer 2)
- Agents can create new specs without touching Maestro flows

**Directory structure:**

```
.maestro/
  visual-tests/
    library-disconnected.yaml
    library-connected.yaml
    settings-main.yaml
    upload-queue-active.yaml
    connection-sheet.yaml
    ...
```

**Full YAML schema:**

```yaml
# .maestro/visual-tests/<test-id>.yaml
# ─────────────────────────────────────

# Required: unique test identifier (matches screenshot filename)
id: library-disconnected

# Required: human-readable name
name: "Library - Disconnected Empty State"

# Required: which Maestro flow produces the screenshot for this test
flow: flows/02-library-disconnected.yaml

# Required: screenshot filenames (without extension) produced by the flow
# that this spec evaluates. Each gets its own LLM judge call.
screenshots:
  - library-disconnected

# Optional: platforms and themes this test applies to.
# The judge runner uses these to locate the correct reference image.
# Defaults to [ios] and [light] if omitted.
platforms: [ios, android]
themes: [light, dark]

# ─── LLM Judge Configuration ───

# Required: what the screen should look like — fed to the LLM as context.
# This is the primary prompt text the judge uses to understand the expected state.
description: |
  Library tab with no device connected.
  Shows an empty state illustration with "Connect to a device" message.
  Header contains the "Library" title and a disconnected connection pill (gray).
  Tab bar at bottom with Library (selected), Sync, and Settings tabs.

# Optional: explicit pass/fail assertions the LLM evaluates.
# Each assertion is a natural-language statement that should be true.
# The LLM returns pass/fail + reasoning for each one individually.
assertions:
  - text: "The connection pill in the header shows 'Disconnected' in gray"
    severity: fail        # fail | warning (default: fail)
  - text: "An empty state illustration is centered in the main content area"
    severity: fail
  - text: "The text 'Connect to a device' is visible below the illustration"
    severity: fail
  - text: "The tab bar shows three tabs: Library, Sync, Settings"
    severity: fail
  - text: "The Library tab is visually selected/highlighted"
    severity: fail
  - text: "No loading spinners or error messages are visible"
    severity: warning

# Optional: elements to focus on via cropOn (for element-level comparison).
# The judge can crop screenshots to these regions for closer inspection.
focus_elements:
  - id: "Library.ConnectionPill"
    label: "Connection status pill"
  - id: "Library.EmptyState"
    label: "Empty state container"

# Optional: things the LLM should IGNORE (not flag as failures).
# Useful for dynamic content that changes between runs.
ignore:
  - "Exact timestamp or time display in the status bar"
  - "Battery percentage or signal strength indicators"
  - "Any system UI elements outside the app frame"

# Optional: custom criteria to evaluate IN ADDITION to the 5 defaults.
# These are screen-specific checks beyond layout/content/visual_state/elements/defects.
custom_criteria:
  - name: "empty_state_messaging"
    description: "The empty state message clearly communicates what action the user should take"
  - name: "accessibility"
    description: "Text has sufficient contrast and interactive elements have adequate touch targets"

# Optional: tags for filtering which tests to run
tags: [smoke, library, disconnected]

# Optional: metadata about who/what created this spec
created_by: human            # human | agent
created_at: "2026-02-21"
notes: "Initial spec for library empty state"
```

**More examples:**

```yaml
# .maestro/visual-tests/library-connected.yaml
id: library-connected
name: "Library - Connected with Files"
flow: flows/04-library-connected.yaml
screenshots:
  - library-connected-files
platforms: [ios]
themes: [light]
tags: [smoke, library, connected, requires-device]

description: |
  Library tab connected to a device, showing a file browser with files and folders.
  Header shows "Library" title with a green "Connected" pill.
  File list displays entries with file type icons, names, and sizes.
  A floating action button (FAB) is visible in the bottom-right corner.
  Upload status bar may appear at the top if uploads are active.

assertions:
  - text: "The connection pill shows 'Connected' with a green/success color"
    severity: fail
  - text: "At least one file or folder is visible in the list"
    severity: fail
  - text: "Each file row shows an icon, filename, and file size"
    severity: fail
  - text: "The FAB button is visible in the bottom-right corner"
    severity: fail
  - text: "Folder entries are visually distinct from file entries (folder icon)"
    severity: warning
  - text: "File sizes are displayed in human-readable format (KB, MB)"
    severity: warning

focus_elements:
  - id: "Library.ConnectionPill"
    label: "Connected pill"
  - id: "Library.FileList"
    label: "File list"
  - id: "Library.FAB"
    label: "Floating action button"

ignore:
  - "Specific file names and sizes (these vary by test data)"
  - "Number of files in the list"
  - "Exact upload progress percentage"

created_by: human
created_at: "2026-02-21"
```

```yaml
# .maestro/visual-tests/settings-main.yaml
id: settings-main
name: "Settings Screen"
flow: flows/08-settings-screen.yaml
screenshots:
  - settings-main
platforms: [ios, android]
themes: [light, dark]
tags: [smoke, settings]

description: |
  Settings tab showing app configuration options in grouped sections.
  "Transfer" section: Upload Path and Clip Path rows with current values.
  "Debug" section: Debug Logs toggle switch.
  "Device" section: shows device info when connected, hidden when disconnected.
  "About" section: CrossPoint Sync name, version number, and About row.

assertions:
  - text: "The Settings title is visible in the header"
    severity: fail
  - text: "'Upload Path' row is visible with a path value"
    severity: fail
  - text: "'Clip Path' row is visible with a path value"
    severity: fail
  - text: "'Debug Logs' row has a toggle switch"
    severity: fail
  - text: "'About' section shows 'CrossPoint Sync' app name"
    severity: fail
  - text: "A version number is displayed in the About section"
    severity: warning
  - text: "Sections are visually grouped with headers"
    severity: warning

custom_criteria:
  - name: "settings_values"
    description: "All settings rows show their current value, not placeholder text"

created_by: human
created_at: "2026-02-21"
```

**How `scripts/visual-judge.ts` consumes these specs:**

```typescript
import { readFileSync, readdirSync } from 'fs';
import { parse as parseYaml } from 'yaml';

interface VisualTestSpec {
  id: string;
  name: string;
  flow: string;
  screenshots: string[];
  platforms?: string[];
  themes?: string[];
  description: string;
  assertions?: Array<{ text: string; severity?: 'fail' | 'warning' }>;
  focus_elements?: Array<{ id: string; label: string }>;
  ignore?: string[];
  custom_criteria?: Array<{ name: string; description: string }>;
  tags?: string[];
  created_by?: 'human' | 'agent';
  created_at?: string;
  notes?: string;
}

function loadVisualTestSpecs(dir: string): VisualTestSpec[] {
  return readdirSync(dir)
    .filter(f => f.endsWith('.yaml'))
    .map(f => parseYaml(readFileSync(`${dir}/${f}`, 'utf-8')) as VisualTestSpec);
}

// Build the LLM prompt from the spec
function buildJudgePrompt(spec: VisualTestSpec): string {
  let prompt = `Screen: "${spec.name}"\n\n`;
  prompt += `Expected state:\n${spec.description}\n\n`;

  if (spec.assertions?.length) {
    prompt += `Evaluate each assertion individually:\n`;
    spec.assertions.forEach((a, i) => {
      prompt += `  ${i + 1}. [${a.severity || 'fail'}] ${a.text}\n`;
    });
    prompt += '\n';
  }

  if (spec.ignore?.length) {
    prompt += `IGNORE these (do not flag as failures):\n`;
    spec.ignore.forEach(ig => { prompt += `  - ${ig}\n`; });
    prompt += '\n';
  }

  if (spec.custom_criteria?.length) {
    prompt += `Additional criteria to evaluate:\n`;
    spec.custom_criteria.forEach(c => {
      prompt += `  - ${c.name}: ${c.description}\n`;
    });
  }

  return prompt;
}
```

The tool schema is also extended to return per-assertion results:

```typescript
const VISUAL_TEST_TOOL = {
  name: 'report_visual_test_result',
  description: 'Report the results of a visual UI comparison test',
  input_schema: {
    type: 'object' as const,
    properties: {
      verdict: { type: 'string', enum: ['pass', 'fail', 'warning'] },
      confidence: { type: 'number', description: '0.0-1.0' },
      criteria: { /* ... same 5 default criteria ... */ },
      // NEW: per-assertion results from the spec
      assertion_results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            index: { type: 'number' },
            text: { type: 'string' },
            pass: { type: 'boolean' },
            reasoning: { type: 'string' },
          },
          required: ['index', 'text', 'pass', 'reasoning'],
        },
      },
      custom_criteria_results: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            pass: { type: 'boolean' },
            notes: { type: 'string' },
          },
          required: ['name', 'pass', 'notes'],
        },
      },
      summary: { type: 'string' },
      differences: { type: 'array', items: { type: 'string' } },
    },
    required: ['verdict', 'confidence', 'criteria', 'assertion_results', 'summary', 'differences'],
  },
};
```

---

### Step 3c: Agent-Authored Visual Test Specs

Agents (e.g., Claude via Maestro MCP) can **create new visual test specs** after exploring a screen. The workflow:

1. Agent navigates to a screen using MCP tools (`tap_on`, `launch_app`, etc.)
2. Agent takes a screenshot via `take_screenshot`
3. Agent inspects the view hierarchy via `inspect_view_hierarchy` to discover element IDs
4. Agent analyzes the screenshot with its vision capabilities
5. Agent writes a new `.maestro/visual-tests/<test-id>.yaml` spec based on what it observed

**Example agent interaction:**

```
User: "Create a visual test spec for the upload queue sheet"

Agent:
1. Launches app, navigates to upload queue
2. Takes screenshot, sees the upload queue UI
3. Inspects hierarchy, finds testIDs: UploadQueue.Sheet, UploadQueue.JobList, etc.
4. Writes .maestro/visual-tests/upload-queue-active.yaml:
```

```yaml
# Auto-generated by agent on 2026-02-21
# Review assertions before committing to CI
id: upload-queue-active
name: "Upload Queue - Active Uploads"
flow: flows/07-upload-queue.yaml
screenshots:
  - upload-queue-active
platforms: [ios]
themes: [light]
tags: [upload, queue]

description: |
  Upload queue sheet showing active and pending upload jobs.
  Each job card displays the filename, progress bar, and status text.
  An active upload shows a blue progress bar with percentage.
  Pending uploads show "Waiting..." status.
  Cancel button (X) is available on each job card.

assertions:
  - text: "The sheet title shows 'Upload Queue' or similar header"
    severity: fail
  - text: "At least one upload job card is visible"
    severity: fail
  - text: "The active upload shows a progress bar with percentage text"
    severity: fail
  - text: "Each job card shows the filename"
    severity: fail
  - text: "Each job card has a cancel/close button"
    severity: warning
  - text: "Pending jobs are visually distinct from active jobs"
    severity: warning

focus_elements:
  - id: "UploadQueue.Sheet"
    label: "Queue sheet container"
  - id: "UploadQueue.JobList"
    label: "Job list"

ignore:
  - "Exact filenames (vary by test data)"
  - "Exact progress percentages"
  - "Upload speed numbers"

created_by: agent
created_at: "2026-02-21"
notes: "Auto-generated from screen inspection. Human review recommended."
```

**Agent guidelines for spec creation:**
- Always set `created_by: agent` so humans can easily find auto-generated specs for review
- Include `notes` explaining what the agent observed
- Use `severity: warning` (not `fail`) for assertions the agent is less confident about
- Prefer testID-based `focus_elements` over position-based selectors
- Keep `description` factual based on what's actually visible, not aspirational

---

### Step 3d: Test Run History Storage

Each test run's artifacts are stored in the repo under `test-runs/`, keeping the **last N runs** (configurable, default N=2) for comparison and debugging.

**Directory structure:**

```
test-runs/
  latest -> run-2026-02-21T14-30-00Z   # symlink to most recent
  run-2026-02-21T14-30-00Z/            # current run
    meta.json                           # run metadata
    report.json                         # full LLM judge report
    report.md                           # markdown summary
    screenshots/                        # all captured screenshots
      library-disconnected.png
      library-connected-files.png
      settings-main.png
      ...
    maestro-output/                     # raw Maestro test output
      junit.xml
      debug-log.txt
  run-2026-02-20T09-15-00Z/            # previous run (kept for comparison)
    meta.json
    report.json
    report.md
    screenshots/
      ...
    maestro-output/
      ...
```

**`meta.json` — run metadata:**

```json
{
  "run_id": "run-2026-02-21T14-30-00Z",
  "timestamp": "2026-02-21T14:30:00Z",
  "platform": "ios",
  "device": "iPhone 16 Pro",
  "theme": "light",
  "git_sha": "abc123f",
  "git_branch": "feature/new-settings-ui",
  "git_author": "developer@example.com",
  "trigger": "pull_request",
  "pr_number": 42,
  "maestro_version": "2.2.0",
  "total_tests": 13,
  "passed": 11,
  "failed": 1,
  "warnings": 1,
  "llm_api_calls": 3,
  "llm_cost_usd": 0.009,
  "duration_seconds": 127
}
```

**Run history management in `scripts/visual-judge.ts`:**

```typescript
const MAX_RUNS_TO_KEEP = Number(process.env.VISUAL_TEST_MAX_RUNS || 2);

function createRunDirectory(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('Z', 'Z');
  const runId = `run-${timestamp}`;
  const runDir = `test-runs/${runId}`;
  mkdirSync(`${runDir}/screenshots`, { recursive: true });
  mkdirSync(`${runDir}/maestro-output`, { recursive: true });
  return runDir;
}

function pruneOldRuns(): void {
  const runs = readdirSync('test-runs')
    .filter(d => d.startsWith('run-'))
    .sort()
    .reverse();

  // Keep only the N most recent
  for (const oldRun of runs.slice(MAX_RUNS_TO_KEEP)) {
    rmSync(`test-runs/${oldRun}`, { recursive: true });
  }

  // Update 'latest' symlink
  if (runs.length > 0) {
    const latestLink = 'test-runs/latest';
    if (existsSync(latestLink)) unlinkSync(latestLink);
    symlinkSync(runs[0], latestLink);
  }
}
```

**Accessing run history:**

```bash
# View the latest run's report
cat test-runs/latest/report.md

# Compare screenshots between last two runs
# (useful for spotting regressions introduced between runs)
diff <(ls test-runs/latest/screenshots/) \
     <(ls test-runs/run-2026-02-20T09-15-00Z/screenshots/)

# See what changed
cat test-runs/latest/meta.json | jq '.git_sha, .passed, .failed'
```

**CI integration — commit run artifacts:**

```yaml
# In .github/workflows/visual-tests.yml
- name: Store Run Artifacts
  run: |
    # visual-judge.ts already creates the run directory and prunes old ones
    git add test-runs/
    git diff --cached --quiet || \
      git commit -m "Visual test run $(date -u +%Y-%m-%dT%H:%M:%SZ) [skip ci]"
    git push

- name: Upload as CI Artifact (backup)
  uses: actions/upload-artifact@v4
  with:
    name: visual-test-run-${{ github.sha }}
    path: test-runs/latest/
    retention-days: 30
```

**`.gitignore` considerations:**

```gitignore
# Keep run history in the repo (committed by CI)
# But ignore local scratch runs
test-runs/local-*/
```

**Run-to-run comparison in PR comments:**

When a previous run exists, the PR comment includes a comparison:

```markdown
## Visual Test Results — Run 2026-02-21T14:30:00Z

| # | Test | Current | Previous | Delta |
|---|------|---------|----------|-------|
| 1 | Library - Disconnected | ✅ Pass (95%) | ✅ Pass (97%) | -2% confidence |
| 2 | Settings Screen | ❌ Fail (88%) | ✅ Pass (93%) | **Regression** |
| 3 | Upload Queue | ✅ Pass (91%) | ⚠️ Warning (72%) | **Improved** |

**Summary: 11/13 passed, 1 failed, 1 warning**
**vs. Previous: 12/13 passed, 0 failed, 1 warning — 1 new failure**

<details>
<summary>❌ Settings Screen — Regression Details</summary>

This test PASSED in the previous run (run-2026-02-20T09-15-00Z) but FAILS now.

| Previous | Current |
|----------|---------|
| ![prev](test-runs/run-2026-02-20.../settings-main.png) | ![curr](test-runs/latest/settings-main.png) |

**Assertion results:**
1. ✅ "The Settings title is visible in the header"
2. ❌ "'Upload Path' row is visible with a path value" — *Path value is truncated, showing "..." instead of full path*
3. ✅ "'Debug Logs' row has a toggle switch"
...
</details>
```

---

### Step 4: Test Report Generation

The pipeline generates three output formats:

**1. JSON Report (`test-results/report.json`):**

```json
{
  "timestamp": "2026-02-21T12:00:00Z",
  "platform": "ios",
  "device": "iPhone 16 Pro",
  "theme": "light",
  "summary": {
    "total": 13,
    "passed": 11,
    "failed": 1,
    "warnings": 1
  },
  "tests": [
    {
      "id": "library-disconnected",
      "name": "Library - Disconnected Empty State",
      "verdict": "pass",
      "confidence": 0.95,
      "screenshots": {
        "test": "test-screenshots/library-disconnected.png",
        "reference": "test-references/ios/iphone-16-pro/light/library-disconnected.png"
      },
      "criteria": { "layout": { "pass": true }, "content": { "pass": true }, ... },
      "llm_reasoning": "The test screenshot matches the reference. Empty state message is present..."
    },
    {
      "id": "settings-main",
      "name": "Settings Screen",
      "verdict": "fail",
      "confidence": 0.88,
      "screenshots": { ... },
      "criteria": { "layout": { "pass": true }, "content": { "pass": false, "notes": "Upload path shows '/' but reference shows '/Books'" }, ... },
      "llm_reasoning": "The upload path value differs from the reference..."
    }
  ]
}
```

**2. Markdown PR Comment:**

```markdown
## Visual Test Results — iOS / iPhone 16 Pro / Light

| # | Test | Verdict | Confidence | Notes |
|---|------|---------|------------|-------|
| 1 | Library - Disconnected | ✅ Pass | 95% | — |
| 2 | Library - Connected | ✅ Pass | 92% | — |
| 3 | Settings Screen | ❌ Fail | 88% | Upload path value mismatch |
| ... | ... | ... | ... | ... |

**Summary: 11/13 passed, 1 failed, 1 warning**

<details>
<summary>❌ Settings Screen — Details</summary>

**Criteria:**
- Layout: ✅
- Content: ❌ Upload path shows '/' but reference shows '/Books'
- Visual State: ✅
- Elements: ✅
- Defects: ✅

**LLM Reasoning:** The upload path value differs from the reference...

| Reference | Test |
|-----------|------|
| ![ref](test-references/...) | ![test](test-screenshots/...) |

</details>
```

**3. JUnit XML** for CI status checks integration.

---

### Step 5: GitHub Actions CI Pipeline

**`.github/workflows/visual-tests.yml`:**

```yaml
name: Visual UI Tests

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      update_baselines:
        description: 'Update reference baselines'
        type: boolean
        default: false

jobs:
  visual-tests-ios:
    runs-on: macos-15  # macOS with Xcode and iOS Simulators
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install Maestro
        run: |
          curl -Ls "https://get.maestro.mobile.dev" | bash
          echo "$HOME/.maestro/bin" >> $GITHUB_PATH

      - name: Prebuild iOS
        run: npx expo prebuild --platform ios --clean

      - name: Build for Simulator
        run: |
          xcodebuild -workspace ios/CrossPointSync.xcworkspace \
            -scheme CrossPointSync \
            -sdk iphonesimulator \
            -configuration Debug \
            -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
            -derivedDataPath build \
            build

      - name: Boot Simulator
        run: |
          xcrun simctl boot "iPhone 16 Pro" || true
          xcrun simctl status_bar "iPhone 16 Pro" override \
            --time "9:41" --batteryState charged --batteryLevel 100

      - name: Install & Launch App
        run: |
          APP_PATH=$(find build -name "*.app" -type d | head -1)
          xcrun simctl install booted "$APP_PATH"
          xcrun simctl launch booted com.crosspointsync.app
          sleep 5  # Wait for app to fully launch

      - name: Run Maestro Tests
        run: |
          maestro test .maestro/flows/ \
            --format junit \
            --output test-results/ \
            --debug-output test-debug/
        continue-on-error: true  # Don't fail yet, judge will determine

      - name: Run LLM Visual Judge
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          VISUAL_TEST_MAX_RUNS: "2"
        run: |
          npx tsx scripts/visual-judge.ts \
            --screenshots test-screenshots/ \
            --references test-references/ios/iphone-16-pro/light/ \
            --specs .maestro/visual-tests/ \
            --run-dir test-runs/ \
            --git-sha ${{ github.sha }} \
            --git-branch ${{ github.head_ref || github.ref_name }} \
            --platform ios \
            --device "iPhone 16 Pro"

      - name: Post PR Comment
        if: github.event_name == 'pull_request'
        run: |
          gh pr comment ${{ github.event.pull_request.number }} \
            --body-file test-runs/latest/report.md
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Commit Run History
        run: |
          git add test-runs/
          git diff --cached --quiet || \
            git commit -m "Visual test run $(date -u +%Y-%m-%dT%H:%M:%SZ) [skip ci]"
          git push
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload Test Artifacts (backup)
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: visual-test-run-${{ github.sha }}
          path: test-runs/latest/
          retention-days: 30

      - name: Update Baselines (if requested)
        if: github.event.inputs.update_baselines == 'true'
        run: |
          cp test-screenshots/*.png test-references/ios/iphone-16-pro/light/
          git add test-references/
          git commit -m "Update visual test baselines"
          git push

      - name: Check Results
        run: |
          node -e "
            const report = require('./test-runs/latest/report.json');
            if (report.summary.failed > 0) {
              console.error(report.summary.failed + ' visual tests failed');
              process.exit(1);
            }
            console.log('All ' + report.summary.total + ' visual tests passed');
          "

  visual-tests-android:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'

      - uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Install dependencies
        run: npm ci

      - name: Install Maestro
        run: |
          curl -Ls "https://get.maestro.mobile.dev" | bash
          echo "$HOME/.maestro/bin" >> $GITHUB_PATH

      - name: Prebuild Android
        run: npx expo prebuild --platform android --clean

      - name: Build APK
        run: |
          cd android && ./gradlew assembleDebug

      - name: AVD Cache
        uses: actions/cache@v4
        with:
          path: |
            ~/.android/avd/*
            ~/.android/adb*
          key: avd-api-34-${{ runner.os }}

      - name: Run Android Emulator & Tests
        uses: reactivecircus/android-emulator-runner@v2
        with:
          api-level: 34
          arch: x86_64
          profile: pixel_8
          script: |
            adb install android/app/build/outputs/apk/debug/app-debug.apk
            sleep 10
            maestro test .maestro/flows/ \
              --format junit \
              --output test-results/
            npx tsx scripts/visual-judge.ts \
              --screenshots test-screenshots/ \
              --references test-references/android/pixel-8/light/ \
              --specs .maestro/visual-tests/ \
              --run-dir test-runs/ \
              --platform android \
              --device "Pixel 8"
```

---

### Step 6: Device Mocking Strategy

Since CrossPoint Sync communicates with a physical XTEink device via UDP/HTTP/WebSocket, tests need a mock device server for connected-state tests.

**Option A: Test-only mock server (recommended)**

Create `scripts/mock-device-server.ts` — a lightweight Node.js server that:
- Responds to UDP discovery broadcasts on port 8134
- Serves mock HTTP API responses (GET /api/status, GET /api/files)
- Accepts WebSocket upload connections and acknowledges chunks
- Runs on localhost, reachable from the simulator

**Option B: Disconnected-state only testing**

Skip connected-state tests in CI and only test:
- Disconnected empty states
- Settings screen (no device needed)
- UI navigation and layout
- Dark/light mode toggle
- FAB menu interaction

For initial implementation, **Option B is recommended** — it covers all UI visual validation without the complexity of device mocking. Connected-state tests can be added later with Option A.

---

### Step 7: Test Scenarios Checklist

These are the specific visual tests, each producing one or more screenshots judged by Claude:

**Library Tab:**
| # | Test ID | Scenario | Theme |
|---|---------|----------|-------|
| 1 | `library-disconnected-light` | Empty state, no device connected | Light |
| 2 | `library-disconnected-dark` | Empty state, no device connected | Dark |
| 3 | `library-connected-files` | File list with folders and EPUBs | Light |
| 4 | `library-connected-empty-folder` | Connected but empty directory | Light |
| 5 | `library-fab-menu-open` | FAB expanded showing options | Light |
| 6 | `library-upload-status-bar` | Active upload with progress bar | Light |

**Settings Tab:**
| # | Test ID | Scenario | Theme |
|---|---------|----------|-------|
| 7 | `settings-main-light` | Full settings screen | Light |
| 8 | `settings-main-dark` | Full settings screen | Dark |
| 9 | `settings-connected` | Settings with device info populated | Light |
| 10 | `settings-disconnected` | Settings with no device | Light |

**Upload Queue:**
| # | Test ID | Scenario | Theme |
|---|---------|----------|-------|
| 11 | `upload-queue-active` | Queue sheet with uploading/pending jobs | Light |
| 12 | `upload-queue-completed` | Queue with completed uploads | Light |
| 13 | `upload-queue-failed` | Queue with failed upload, retry button | Light |

**Connection:**
| # | Test ID | Scenario | Theme |
|---|---------|----------|-------|
| 14 | `connection-sheet-idle` | Connection sheet, not scanning | Light |
| 15 | `connection-sheet-scanning` | Connection sheet during scan | Light |

**Navigation:**
| # | Test ID | Scenario | Theme |
|---|---------|----------|-------|
| 16 | `tab-bar-library-selected` | Tab bar with Library active | Light |
| 17 | `tab-bar-settings-selected` | Tab bar with Settings active | Light |

**Misc:**
| # | Test ID | Scenario | Theme |
|---|---------|----------|-------|
| 18 | `about-modal` | About modal open | Light |
| 19 | `debug-logs` | Debug logs screen | Light |

---

### Step 8: Local Development Workflow

Developers can run visual tests locally:

```bash
# Install Maestro (one-time)
curl -Ls "https://get.maestro.mobile.dev" | bash

# Run all flows against a running simulator
maestro test .maestro/flows/

# Run a single flow
maestro test .maestro/flows/02-library-disconnected.yaml

# Interactive flow authoring (opens browser UI)
maestro studio

# Capture new baselines
npm run test:visual:update-baselines

# Run LLM judge locally (creates run in test-runs/, prunes old runs)
ANTHROPIC_API_KEY=sk-... npx tsx scripts/visual-judge.ts \
  --screenshots test-screenshots/ \
  --references test-references/ios/iphone-16-pro/light/ \
  --specs .maestro/visual-tests/ \
  --run-dir test-runs/

# View latest run results
cat test-runs/latest/report.md

# Compare with previous run
diff test-runs/latest/meta.json test-runs/run-*/meta.json
```

**package.json scripts:**

```json
{
  "scripts": {
    "test:visual": "maestro test .maestro/flows/ && npx tsx scripts/visual-judge.ts --specs .maestro/visual-tests/ --run-dir test-runs/",
    "test:visual:flows": "maestro test .maestro/flows/",
    "test:visual:judge": "npx tsx scripts/visual-judge.ts --specs .maestro/visual-tests/ --run-dir test-runs/",
    "test:visual:update-baselines": "scripts/update-baselines.sh",
    "test:visual:studio": "maestro studio",
    "test:visual:report": "cat test-runs/latest/report.md"
  }
}
```

---

## Implementation Order

| Phase | Work | Effort |
|-------|------|--------|
| **1** | Add `testID` props to all components | Small |
| **2** | Create `.maestro/` config and first 3 flows (app launch, library disconnected, settings) | Small |
| **3** | Write visual test specs (`.maestro/visual-tests/*.yaml`) for initial flows | Small |
| **4** | Capture initial reference screenshots, commit to `test-references/` | Small |
| **5** | Build `scripts/visual-judge.ts` — spec loader, LLM judge, run history management | Medium |
| **6** | Add report generation (JSON + Markdown + JUnit) with run-to-run comparison | Medium |
| **7** | Write remaining Maestro flows + corresponding visual test specs (all 19 scenarios) | Medium |
| **8** | Set up GitHub Actions workflow (with run history commit step) | Medium |
| **9** | Add Android emulator job to CI | Small (once iOS works) |
| **10** | (Optional) Build mock device server for connected-state tests | Medium |
| **11** | (Optional) Configure Maestro MCP for agent-driven exploratory testing + spec creation | Small |

---

## Dependencies to Add

```bash
# Dev dependencies for the LLM vision judge script (Layer 2)
npm install -D @anthropic-ai/sdk yaml tsx

# Maestro is installed via curl, not npm (handles Layer 1 pixel regression natively)
curl -Ls "https://get.maestro.mobile.dev" | bash
```

Note: `pixelmatch` and `pngjs` are no longer required as external deps — Maestro's built-in `assertScreenshot` handles pixel-level visual regression natively with configurable thresholds. The LLM judge script only needs the Anthropic SDK.

---

## Maestro MCP for Exploratory Testing

Beyond the automated CI pipeline, Maestro's MCP server enables **LLM-driven exploratory testing** during development:

```json
// Add to .claude/mcp-server-config.json
{
  "mcpServers": {
    "maestro": {
      "command": "maestro",
      "args": ["mcp", "--working-dir", "/path/to/crosspoint-sync"]
    }
  }
}
```

This gives Claude direct access to:
- `take_screenshot` — see the current device screen
- `tap_on` / `input_text` — interact with the app
- `inspect_view_hierarchy` — read the UI tree to find elements
- `run_flow` — execute inline YAML commands
- `run_flow_files` — run saved flow files

Use case: Ask Claude to "explore the app and find any visual issues" — it will navigate screens, take screenshots, and report anomalies using its vision capabilities. This complements the deterministic CI pipeline with open-ended exploratory coverage.

---

## Cost Considerations

- **Claude API (Sonnet):** ~$0.003 per image pair comparison. 19 tests × 2 themes = ~$0.12 per full run.
- **GitHub Actions:** macOS runners cost 10x Linux. Budget ~5 min macOS per run.
- **Maestro Cloud:** Optional. Self-hosted Maestro is free. Cloud adds AI assertions and device farms.

---

## LLM Vision Judge — Prompt Engineering Notes

**Image placement:** Always place images *before* text/instructions. Claude works best with image-then-text structure. Label each image clearly with a text block ("REFERENCE:" / "TEST:").

**Tolerance calibration in the system prompt:**
```
You should PASS differences that are:
- Sub-pixel rendering variations between platforms
- Minor anti-aliasing differences
- Dynamic content expected to change (timestamps, counters)
- Slight color variations due to color space/gamma differences

You should FAIL differences that are:
- Text truncation, missing text, or changed text content
- Layout shifts where elements moved significantly
- Missing or additional UI elements
- Color changes that alter the visual design intent
- Overlapping elements or broken images/icons
```

**Structured criteria:** Define explicit, enumerable criteria rather than open-ended "find all differences." Our 5-criteria system (layout, content, visual_state, elements, defects) keeps judgments focused and consistent.

**Resolution:** Capture at 2x Retina. Resize to stay under 1568px on the long edge to avoid Claude's internal downscaling. iPhone screenshots at 2x (~1170x2532) work well at ~1600 tokens per image.

**Temperature:** Use `temperature: 0` for maximum determinism in CI pipelines.

**Confidence thresholds:** Treat `confidence < 0.7` as "needs human review" rather than auto-fail.

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| LLM judge is non-deterministic | Use temperature=0, structured output, confidence threshold. Flag warnings (not failures) for borderline cases. |
| Simulator screenshots vary across macOS/Xcode versions | Pin Xcode version in CI. Use tolerance in pixel comparison. LLM judge naturally handles minor rendering differences. |
| Tests are flaky due to async app state | Use Maestro's `waitForAnimationToEnd` and retry mechanisms. Add `extendedWaitUntil` for slow-loading states. |
| Reference screenshots go stale | `workflow_dispatch` trigger for baseline updates. PR comments highlight which tests need new baselines. |
| react-native-udp not available in simulator | Focus on UI-only tests. Mock device server for connected states. |
| Cost of Claude API calls in CI | Use Sonnet (cheap). Cache results. Only run visual judge on PR (not every push). |
