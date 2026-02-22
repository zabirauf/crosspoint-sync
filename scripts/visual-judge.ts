#!/usr/bin/env npx tsx
/**
 * Visual Test Judge — LLM-powered visual regression testing for CrossPoint Sync.
 *
 * Loads visual test specs from .maestro/visual-tests/*.yaml, compares test
 * screenshots against reference images using Claude's vision API, and generates
 * JSON + Markdown + JUnit XML reports.
 *
 * Usage:
 *   npx tsx scripts/visual-judge.ts \
 *     --screenshots test-screenshots/ \
 *     --references test-references/ios/iphone-16-pro/light/ \
 *     --specs .maestro/visual-tests/ \
 *     --run-dir test-runs/ \
 *     [--git-sha abc123] \
 *     [--git-branch main] \
 *     [--platform ios] \
 *     [--device "iPhone 16 Pro"]
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync, rmSync, unlinkSync, symlinkSync, statSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { join, basename } from 'path';

// ─── Types ───

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

interface CriterionResult {
  pass: boolean;
  notes: string;
}

interface AssertionResult {
  index: number;
  text: string;
  pass: boolean;
  reasoning: string;
}

interface CustomCriterionResult {
  name: string;
  pass: boolean;
  notes: string;
}

interface JudgmentResult {
  verdict: 'pass' | 'fail' | 'warning';
  confidence: number;
  criteria: {
    layout: CriterionResult;
    content: CriterionResult;
    visual_state: CriterionResult;
    elements: CriterionResult;
    defects: CriterionResult;
  };
  assertion_results: AssertionResult[];
  custom_criteria_results: CustomCriterionResult[];
  summary: string;
  differences: string[];
}

interface TestResult {
  id: string;
  name: string;
  screenshot: string;
  verdict: 'pass' | 'fail' | 'warning';
  confidence: number;
  method: 'pixel-identical' | 'reference-missing' | 'llm-judge';
  screenshots: {
    test: string;
    reference: string;
  };
  criteria?: JudgmentResult['criteria'];
  assertion_results?: AssertionResult[];
  custom_criteria_results?: CustomCriterionResult[];
  summary: string;
  differences: string[];
}

interface RunReport {
  run_id: string;
  timestamp: string;
  platform: string;
  device: string;
  theme: string;
  git_sha: string;
  git_branch: string;
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
    skipped: number;
  };
  llm_api_calls: number;
  tests: TestResult[];
}

// ─── CLI Args ───

function parseArgs(): {
  screenshots: string;
  references: string;
  specs: string;
  runDir: string;
  gitSha: string;
  gitBranch: string;
  platform: string;
  device: string;
  tags?: string[];
} {
  const args = process.argv.slice(2);
  const get = (flag: string, defaultVal = ''): string => {
    const idx = args.indexOf(flag);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : defaultVal;
  };

  const tagsStr = get('--tags');

  return {
    screenshots: get('--screenshots', 'test-screenshots'),
    references: get('--references', 'test-references/ios/iphone-16-pro/light'),
    specs: get('--specs', '.maestro/visual-tests'),
    runDir: get('--run-dir', 'test-runs'),
    gitSha: get('--git-sha', 'unknown'),
    gitBranch: get('--git-branch', 'unknown'),
    platform: get('--platform', 'ios'),
    device: get('--device', 'iPhone 16 Pro'),
    tags: tagsStr ? tagsStr.split(',') : undefined,
  };
}

// ─── Spec Loader ───

function loadVisualTestSpecs(dir: string): VisualTestSpec[] {
  if (!existsSync(dir)) {
    console.error(`Specs directory not found: ${dir}`);
    process.exit(1);
  }
  return readdirSync(dir)
    .filter(f => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort()
    .map(f => {
      const content = readFileSync(join(dir, f), 'utf-8');
      return parseYaml(content) as VisualTestSpec;
    });
}

// ─── LLM Judge ───

const JUDGE_SYSTEM_PROMPT = `You are a mobile app visual QA judge. You compare test screenshots against reference screenshots to determine if the app's UI is rendering correctly.

For each comparison, evaluate these criteria:
1. LAYOUT: Are elements positioned correctly? Same spacing, alignment, and sizing?
2. CONTENT: Are text labels, values, and counts correct?
3. VISUAL STATE: Are colors, icons, and enabled/disabled states correct?
4. ELEMENTS: Are all expected elements present? Are there unexpected elements?
5. DEFECTS: Any text truncation, overlap, misalignment, or rendering artifacts?

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
- Overlapping elements or broken images/icons`;

function buildVisualTestTool(spec: VisualTestSpec): Anthropic.Messages.Tool {
  return {
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
            layout: { type: 'object', properties: { pass: { type: 'boolean' }, notes: { type: 'string' } }, required: ['pass', 'notes'] },
            content: { type: 'object', properties: { pass: { type: 'boolean' }, notes: { type: 'string' } }, required: ['pass', 'notes'] },
            visual_state: { type: 'object', properties: { pass: { type: 'boolean' }, notes: { type: 'string' } }, required: ['pass', 'notes'] },
            elements: { type: 'object', properties: { pass: { type: 'boolean' }, notes: { type: 'string' } }, required: ['pass', 'notes'] },
            defects: { type: 'object', properties: { pass: { type: 'boolean' }, notes: { type: 'string' } }, required: ['pass', 'notes'] },
          },
          required: ['layout', 'content', 'visual_state', 'elements', 'defects'],
        },
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
      required: ['verdict', 'confidence', 'criteria', 'assertion_results', 'custom_criteria_results', 'summary', 'differences'],
    },
  };
}

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

async function judgeScreenshot(
  testPath: string,
  referencePath: string,
  spec: VisualTestSpec,
): Promise<JudgmentResult> {
  const client = new Anthropic();
  const refImage = readFileSync(referencePath).toString('base64');
  const testImage = readFileSync(testPath).toString('base64');
  const judgePrompt = buildJudgePrompt(spec);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2048,
    temperature: 0,
    system: JUDGE_SYSTEM_PROMPT,
    tools: [buildVisualTestTool(spec)],
    tool_choice: { type: 'tool', name: 'report_visual_test_result' },
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: 'REFERENCE screenshot (expected state):' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: refImage } },
        { type: 'text', text: 'TEST screenshot (current state):' },
        { type: 'image', source: { type: 'base64', media_type: 'image/png', data: testImage } },
        { type: 'text', text: `${judgePrompt}\n\nCompare the screenshots and determine if the visual differences are meaningful regressions or acceptable variations.` },
      ],
    }],
  });

  const toolUse = response.content.find(b => b.type === 'tool_use');
  if (toolUse?.type === 'tool_use') return toolUse.input as unknown as JudgmentResult;
  throw new Error('No structured result from Claude');
}

// ─── Run History Management ───

const MAX_RUNS_TO_KEEP = Number(process.env.VISUAL_TEST_MAX_RUNS || 2);

function createRunDirectory(runDir: string): { runId: string; dir: string } {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runId = `run-${timestamp}`;
  const dir = join(runDir, runId);
  mkdirSync(join(dir, 'screenshots'), { recursive: true });
  mkdirSync(join(dir, 'maestro-output'), { recursive: true });
  return { runId, dir };
}

function pruneOldRuns(runDir: string): void {
  if (!existsSync(runDir)) return;
  const runs = readdirSync(runDir)
    .filter(d => d.startsWith('run-') && statSync(join(runDir, d)).isDirectory())
    .sort()
    .reverse();

  for (const oldRun of runs.slice(MAX_RUNS_TO_KEEP)) {
    rmSync(join(runDir, oldRun), { recursive: true });
  }

  // Update 'latest' symlink
  const latestLink = join(runDir, 'latest');
  try { unlinkSync(latestLink); } catch { /* ignore if not exists */ }
  if (runs.length > 0) {
    symlinkSync(runs[0], latestLink);
  }
}

// ─── Report Generation ───

function generateMarkdownReport(report: RunReport): string {
  const { summary, tests } = report;
  let md = `## Visual Test Results — ${report.platform} / ${report.device} / light\n\n`;

  md += `| # | Test | Verdict | Confidence | Notes |\n`;
  md += `|---|------|---------|------------|-------|\n`;

  tests.forEach((t, i) => {
    const icon = t.verdict === 'pass' ? '✅' : t.verdict === 'fail' ? '❌' : '⚠️';
    const conf = `${Math.round(t.confidence * 100)}%`;
    const notes = t.differences.length > 0 ? t.differences[0] : '—';
    md += `| ${i + 1} | ${t.name} | ${icon} ${t.verdict.charAt(0).toUpperCase() + t.verdict.slice(1)} | ${conf} | ${notes} |\n`;
  });

  md += `\n**Summary: ${summary.passed}/${summary.total} passed, ${summary.failed} failed, ${summary.warnings} warnings`;
  if (summary.skipped > 0) md += `, ${summary.skipped} skipped`;
  md += `**\n`;

  // Details for failed/warning tests
  const issues = tests.filter(t => t.verdict !== 'pass');
  for (const t of issues) {
    const icon = t.verdict === 'fail' ? '❌' : '⚠️';
    md += `\n<details>\n<summary>${icon} ${t.name} — Details</summary>\n\n`;

    if (t.criteria) {
      md += `**Criteria:**\n`;
      for (const [key, val] of Object.entries(t.criteria)) {
        const cIcon = val.pass ? '✅' : '❌';
        md += `- ${key}: ${cIcon} ${val.notes}\n`;
      }
      md += '\n';
    }

    if (t.assertion_results?.length) {
      md += `**Assertion results:**\n`;
      for (const a of t.assertion_results) {
        const aIcon = a.pass ? '✅' : '❌';
        md += `${a.index + 1}. ${aIcon} "${a.text}" — *${a.reasoning}*\n`;
      }
      md += '\n';
    }

    md += `**Summary:** ${t.summary}\n`;

    if (t.screenshots.reference && t.screenshots.test) {
      md += `\n| Reference | Test |\n|-----------|------|\n`;
      md += `| ![ref](${t.screenshots.reference}) | ![test](${t.screenshots.test}) |\n`;
    }

    md += `\n</details>\n`;
  }

  md += `\n---\n*Generated by visual-judge.ts | ${report.timestamp} | Git: ${report.git_sha.slice(0, 7)} on ${report.git_branch} | LLM calls: ${report.llm_api_calls}*\n`;
  return md;
}

function generateJUnitXml(report: RunReport): string {
  const { summary, tests } = report;
  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<testsuites name="visual-tests" tests="${summary.total}" failures="${summary.failed}" errors="0" skipped="${summary.skipped}">\n`;
  xml += `  <testsuite name="visual-judge" tests="${summary.total}" failures="${summary.failed}" errors="0" skipped="${summary.skipped}">\n`;

  for (const t of tests) {
    xml += `    <testcase name="${escapeXml(t.name)}" classname="visual-tests.${t.id}"`;
    if (t.verdict === 'pass') {
      xml += ` />\n`;
    } else if (t.verdict === 'fail') {
      xml += `>\n      <failure message="${escapeXml(t.summary)}">${escapeXml(t.differences.join('\n'))}</failure>\n    </testcase>\n`;
    } else {
      xml += `>\n      <system-out>${escapeXml(t.summary)}</system-out>\n    </testcase>\n`;
    }
  }

  xml += `  </testsuite>\n</testsuites>\n`;
  return xml;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ─── Main ───

async function main() {
  const args = parseArgs();
  console.log('Visual Judge — CrossPoint Sync');
  console.log(`  Screenshots: ${args.screenshots}`);
  console.log(`  References:  ${args.references}`);
  console.log(`  Specs:       ${args.specs}`);
  console.log(`  Run dir:     ${args.runDir}`);
  console.log(`  Platform:    ${args.platform}`);
  console.log(`  Device:      ${args.device}`);
  console.log('');

  // Load specs
  const specs = loadVisualTestSpecs(args.specs);
  console.log(`Loaded ${specs.length} visual test specs`);

  // Filter by tags if specified
  const filteredSpecs = args.tags
    ? specs.filter(s => s.tags?.some(t => args.tags!.includes(t)))
    : specs;
  if (args.tags) {
    console.log(`Filtered to ${filteredSpecs.length} specs matching tags: ${args.tags.join(', ')}`);
  }

  // Create run directory
  mkdirSync(args.runDir, { recursive: true });
  const { runId, dir: runDir } = createRunDirectory(args.runDir);
  console.log(`Run: ${runId}\n`);

  const results: TestResult[] = [];
  let llmApiCalls = 0;

  for (const spec of filteredSpecs) {
    for (const screenshotName of spec.screenshots) {
      const testPath = join(args.screenshots, `${screenshotName}.png`);
      const refPath = join(args.references, `${screenshotName}.png`);

      console.log(`Testing: ${spec.name} (${screenshotName})`);

      // Check if test screenshot exists
      if (!existsSync(testPath)) {
        console.log(`  ⏭ SKIP — test screenshot not found: ${testPath}`);
        results.push({
          id: spec.id,
          name: spec.name,
          screenshot: screenshotName,
          verdict: 'warning',
          confidence: 0,
          method: 'reference-missing',
          screenshots: { test: testPath, reference: refPath },
          summary: `Test screenshot not found: ${testPath}`,
          differences: ['Test screenshot missing'],
        });
        continue;
      }

      // Copy test screenshot to run directory
      const destPath = join(runDir, 'screenshots', `${screenshotName}.png`);
      writeFileSync(destPath, readFileSync(testPath));

      // Check if reference exists
      if (!existsSync(refPath)) {
        console.log(`  ⚠ WARNING — no reference screenshot: ${refPath}`);
        console.log('    This screenshot needs a baseline. Run with --update-baselines to create one.');
        results.push({
          id: spec.id,
          name: spec.name,
          screenshot: screenshotName,
          verdict: 'warning',
          confidence: 0,
          method: 'reference-missing',
          screenshots: { test: testPath, reference: refPath },
          summary: `No reference screenshot found at ${refPath}`,
          differences: ['Reference screenshot missing — needs baseline capture'],
        });
        continue;
      }

      // Run LLM judge
      try {
        console.log(`  🤖 Running LLM judge...`);
        llmApiCalls++;
        const judgment = await judgeScreenshot(testPath, refPath, spec);

        const icon = judgment.verdict === 'pass' ? '✅' : judgment.verdict === 'fail' ? '❌' : '⚠️';
        console.log(`  ${icon} ${judgment.verdict.toUpperCase()} (${Math.round(judgment.confidence * 100)}%) — ${judgment.summary}`);

        // Check assertion severity to determine overall verdict
        let finalVerdict = judgment.verdict;
        if (spec.assertions?.length && judgment.assertion_results?.length) {
          const hasFailSeverityFailure = judgment.assertion_results.some((ar, i) => {
            const specAssertion = spec.assertions![i];
            return !ar.pass && (specAssertion?.severity ?? 'fail') === 'fail';
          });
          if (hasFailSeverityFailure && finalVerdict !== 'fail') {
            finalVerdict = 'fail';
          }
        }

        results.push({
          id: spec.id,
          name: spec.name,
          screenshot: screenshotName,
          verdict: finalVerdict,
          confidence: judgment.confidence,
          method: 'llm-judge',
          screenshots: { test: testPath, reference: refPath },
          criteria: judgment.criteria,
          assertion_results: judgment.assertion_results,
          custom_criteria_results: judgment.custom_criteria_results,
          summary: judgment.summary,
          differences: judgment.differences,
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.log(`  ❌ ERROR — LLM judge failed: ${errorMsg}`);
        results.push({
          id: spec.id,
          name: spec.name,
          screenshot: screenshotName,
          verdict: 'fail',
          confidence: 0,
          method: 'llm-judge',
          screenshots: { test: testPath, reference: refPath },
          summary: `LLM judge error: ${errorMsg}`,
          differences: [`Judge error: ${errorMsg}`],
        });
      }
    }
  }

  // Build report
  const timestamp = new Date().toISOString();
  const report: RunReport = {
    run_id: runId,
    timestamp,
    platform: args.platform,
    device: args.device,
    theme: 'light',
    git_sha: args.gitSha,
    git_branch: args.gitBranch,
    summary: {
      total: results.length,
      passed: results.filter(r => r.verdict === 'pass').length,
      failed: results.filter(r => r.verdict === 'fail').length,
      warnings: results.filter(r => r.verdict === 'warning').length,
      skipped: filteredSpecs.reduce((sum, s) => {
        return sum + s.screenshots.filter(ss => !existsSync(join(args.screenshots, `${ss}.png`))).length;
      }, 0),
    },
    llm_api_calls: llmApiCalls,
    tests: results,
  };

  // Write reports
  const reportJson = JSON.stringify(report, null, 2);
  const reportMd = generateMarkdownReport(report);
  const reportXml = generateJUnitXml(report);

  writeFileSync(join(runDir, 'report.json'), reportJson);
  writeFileSync(join(runDir, 'report.md'), reportMd);
  writeFileSync(join(runDir, 'junit.xml'), reportXml);
  writeFileSync(join(runDir, 'meta.json'), JSON.stringify({
    run_id: runId,
    timestamp,
    platform: args.platform,
    device: args.device,
    theme: 'light',
    git_sha: args.gitSha,
    git_branch: args.gitBranch,
    ...report.summary,
    llm_api_calls: llmApiCalls,
  }, null, 2));

  // Prune old runs and update symlink
  pruneOldRuns(args.runDir);

  // Update latest symlink to this run
  const latestLink = join(args.runDir, 'latest');
  try { unlinkSync(latestLink); } catch { /* ignore */ }
  symlinkSync(basename(runDir), latestLink);

  // Print summary
  console.log('\n═══════════════════════════════════');
  console.log(`Results: ${report.summary.passed}/${report.summary.total} passed, ${report.summary.failed} failed, ${report.summary.warnings} warnings`);
  console.log(`Reports: ${runDir}/report.{json,md} and junit.xml`);
  console.log(`LLM API calls: ${llmApiCalls}`);
  console.log('═══════════════════════════════════\n');

  // Print markdown report to stdout
  console.log(reportMd);

  // Exit with failure if any tests failed
  if (report.summary.failed > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(2);
});
