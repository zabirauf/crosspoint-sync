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
- `takeScreenshot` — captures PNGs at any point in a flow
- `assertWithAI` — built-in LLM assertion for quick semantic checks
- `assertNoDefectsWithAI` — automatic UI defect detection
- YAML flows — human-readable, easy to maintain
- `testID`-based element selection (via `accessibilityLabel` in React Native)

### LLM Vision Judge: **Claude API (claude-sonnet-4-6)**

Using Claude's vision capabilities to compare test screenshots against reference images. Claude Sonnet provides the best balance of accuracy and cost for visual comparison tasks.

**Why a custom LLM judge instead of only Maestro's `assertWithAI`:**
- Maestro's `assertWithAI` requires Maestro Cloud (network dependency, cost)
- Custom judge allows reference image comparison (not just semantic assertions)
- Full control over judgment criteria, prompts, and structured output
- Can run entirely self-hosted with just an API key
- Supports comparing against historical baselines stored in the repo

### Pixel-Level Backup: **pixelmatch** (npm package)

For cases where LLM judgment is overkill (e.g., exact icon rendering, color accuracy), use `pixelmatch` for fast, deterministic pixel-level comparison with a configurable threshold.

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

# Take screenshot of disconnected empty state
- takeScreenshot: library-disconnected

# Verify empty state message is shown
- assertVisible: "Connect to a device"

# Verify the connection pill shows disconnected
- assertVisible:
    id: "Library.ConnectionPill"

# AI assertion for overall layout correctness
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

# Take screenshot of file list
- takeScreenshot: library-connected-files

# Verify file list is populated
- assertVisible:
    id: "Library.FileList"

# Verify connection pill shows connected
- assertVisible:
    id: "Library.ConnectionPill"

# AI check: verify the screen looks like a file browser
- assertWithAI: "The screen shows a file browser with a list of files and folders. There is a connected status indicator in the header and a floating action button in the bottom right."

# Take screenshot for visual comparison
- takeScreenshot: library-connected-full
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

**API call structure (using Anthropic SDK):**

```typescript
import Anthropic from '@anthropic-ai/sdk';

async function judgeScreenshot(
  testScreenshotPath: string,
  referenceScreenshotPath: string,
  testName: string,
  context: string  // What the test is checking
): Promise<JudgmentResult> {
  const client = new Anthropic();

  const testImage = fs.readFileSync(testScreenshotPath);
  const refImage = fs.readFileSync(referenceScreenshotPath);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: JUDGE_SYSTEM_PROMPT,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: refImage.toString('base64') }
        },
        {
          type: 'text',
          text: `REFERENCE screenshot (expected state) ↑`
        },
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: testImage.toString('base64') }
        },
        {
          type: 'text',
          text: `TEST screenshot (current state) ↑\n\nTest: "${testName}"\nContext: ${context}\n\nCompare the test screenshot against the reference. Return your judgment as JSON.`
        }
      ]
    }]
  });

  return JSON.parse(response.content[0].text);
}
```

**Test manifest file (`test-manifest.json`):**

Each test case is defined with metadata for the judge:

```json
{
  "tests": [
    {
      "id": "library-disconnected",
      "name": "Library - Disconnected Empty State",
      "flow": "02-library-disconnected.yaml",
      "screenshots": ["library-disconnected"],
      "context": "Library tab with no device connected. Should show empty state with 'Connect to a device' message, disconnected connection pill in header, and tab bar at bottom.",
      "platform": ["ios", "android"],
      "theme": ["light", "dark"]
    },
    {
      "id": "library-connected",
      "name": "Library - Connected with Files",
      "flow": "04-library-connected.yaml",
      "screenshots": ["library-connected-files", "library-connected-full"],
      "context": "Library tab connected to device showing file list. Should display files/folders with icons, sizes, connected pill, FAB button, and upload status bar if uploads are active.",
      "platform": ["ios"],
      "theme": ["light"]
    },
    {
      "id": "settings-main",
      "name": "Settings Screen",
      "flow": "08-settings-screen.yaml",
      "screenshots": ["settings-main", "settings-full"],
      "context": "Settings tab showing upload path, clip path, debug logs toggle, device info section, and about section. All values should be visible and correctly formatted.",
      "platform": ["ios", "android"],
      "theme": ["light", "dark"]
    }
  ]
}
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
        run: |
          npx tsx scripts/visual-judge.ts \
            --screenshots test-screenshots/ \
            --references test-references/ios/iphone-16-pro/light/ \
            --manifest test-manifest.json \
            --output test-results/

      - name: Post PR Comment
        if: github.event_name == 'pull_request'
        run: |
          gh pr comment ${{ github.event.pull_request.number }} \
            --body-file test-results/report.md
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Upload Test Artifacts
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: visual-test-results-ios
          path: |
            test-results/
            test-screenshots/
            test-debug/

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
            const report = require('./test-results/report.json');
            if (report.summary.failed > 0) {
              console.error('${report.summary.failed} visual tests failed');
              process.exit(1);
            }
            console.log('All ${report.summary.total} visual tests passed');
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
              --manifest test-manifest.json \
              --output test-results/
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

# Run LLM judge locally
ANTHROPIC_API_KEY=sk-... npx tsx scripts/visual-judge.ts \
  --screenshots test-screenshots/ \
  --references test-references/ios/iphone-16-pro/light/
```

**package.json scripts:**

```json
{
  "scripts": {
    "test:visual": "maestro test .maestro/flows/ && npx tsx scripts/visual-judge.ts",
    "test:visual:flows": "maestro test .maestro/flows/",
    "test:visual:judge": "npx tsx scripts/visual-judge.ts",
    "test:visual:update-baselines": "scripts/update-baselines.sh",
    "test:visual:studio": "maestro studio"
  }
}
```

---

## Implementation Order

| Phase | Work | Effort |
|-------|------|--------|
| **1** | Add `testID` props to all components | Small |
| **2** | Create `.maestro/` config and first 3 flows (app launch, library disconnected, settings) | Small |
| **3** | Capture initial reference screenshots, commit to `test-references/` | Small |
| **4** | Build `scripts/visual-judge.ts` with Claude Vision API integration | Medium |
| **5** | Create `test-manifest.json` with all test definitions | Small |
| **6** | Add report generation (JSON + Markdown + JUnit) | Medium |
| **7** | Write remaining Maestro flows (all 13 scenarios) | Medium |
| **8** | Set up GitHub Actions workflow | Medium |
| **9** | Add Android emulator job to CI | Small (once iOS works) |
| **10** | (Optional) Build mock device server for connected-state tests | Medium |

---

## Dependencies to Add

```bash
# Dev dependencies for the visual judge pipeline
npm install -D @anthropic-ai/sdk pixelmatch pngjs tsx

# Maestro is installed via curl, not npm
curl -Ls "https://get.maestro.mobile.dev" | bash
```

---

## Cost Considerations

- **Claude API (Sonnet):** ~$0.003 per image pair comparison. 19 tests × 2 themes = ~$0.12 per full run.
- **GitHub Actions:** macOS runners cost 10x Linux. Budget ~5 min macOS per run.
- **Maestro Cloud:** Optional. Self-hosted Maestro is free. Cloud adds AI assertions and device farms.

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
