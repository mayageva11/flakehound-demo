import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';

/**
 * A tiny, deterministic JUnit reporter.
 *
 * Playwright's built-in JUnit reporter encodes project names and title paths
 * into `classname`, which would make the derived test id depend on the runner
 * configuration. flakehound keys a test's history on that id, so the id must be
 * byte-identical between the seeded history and every live run. This reporter
 * pins the shape: one <testsuite name="shop.spec.ts"> with
 * <testcase name="{title}" classname="shop.spec.ts">, matching the fixtures the
 * flakehound project already ships. That yields clean ids like
 * `shop.spec.ts > payment`.
 *
 * Output path: $JUNIT_OUTPUT (default test-results/junit.xml).
 *
 * Retries: Playwright calls onTestEnd once PER ATTEMPT (each retry included), so
 * pushing one <testcase> per call naturally emits every attempt. A flaky test
 * that fails then passes within a run produces two <testcase> entries with the
 * same name in one file — exactly the shape flakehound reads as an intra-run
 * retry flip (→ high-confidence flaky).
 */
export default class SimpleJUnitReporter implements Reporter {
  private readonly cases: { name: string; timeSec: number; failure?: { message: string; stack: string } }[] = [];
  private readonly suiteName = 'shop.spec.ts';

  onTestEnd(test: TestCase, result: TestResult): void {
    const entry: (typeof this.cases)[number] = {
      name: test.title,
      timeSec: result.duration / 1000,
    };
    if (result.status === 'failed' || result.status === 'timedOut') {
      const error = result.error ?? {};
      const message = firstLine(error.message ?? `Test ${result.status}`);
      const stack = stripAnsi(error.stack ?? error.message ?? message);
      entry.failure = { message, stack };
    }
    this.cases.push(entry);
  }

  async onEnd(): Promise<void> {
    const failures = this.cases.filter((c) => c.failure).length;
    const totalTime = this.cases.reduce((sum, c) => sum + c.timeSec, 0);
    const body = this.cases
      .map((c) => {
        const open = `    <testcase name="${attr(c.name)}" classname="${this.suiteName}" time="${c.timeSec.toFixed(3)}"`;
        if (!c.failure) return `${open}/>`;
        return (
          `${open}>\n` +
          `      <failure message="${attr(c.failure.message)}">${text(c.failure.stack)}</failure>\n` +
          `    </testcase>`
        );
      })
      .join('\n');

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<testsuites>\n` +
      `  <testsuite name="${this.suiteName}" tests="${this.cases.length}" failures="${failures}" time="${totalTime.toFixed(3)}">\n` +
      `${body}\n` +
      `  </testsuite>\n` +
      `</testsuites>\n`;

    const outPath = path.resolve(process.env['JUNIT_OUTPUT'] ?? 'test-results/junit.xml');
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, xml, 'utf8');
    process.stdout.write(`\nJUnit written to ${outPath}\n`);
  }
}

const firstLine = (s: string): string => stripAnsi(s).split('\n')[0]!.trim();
const stripAnsi = (s: string): string => s.replace(/\[[0-9;]*m/g, '');
const attr = (s: string): string =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const text = (s: string): string =>
  s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
