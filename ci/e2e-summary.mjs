// Turns Playwright's JSON report into a Markdown table for the GitHub job summary.
// Usage: node ci/e2e-summary.mjs frontend/test-results/results.json >> "$GITHUB_STEP_SUMMARY"
import { existsSync, readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file || !existsSync(file)) {
    console.log('## E2E tests\n\n❌ No Playwright report found (the run failed before the tests started; see the log).');
    process.exit(0);
}

const report = JSON.parse(readFileSync(file, 'utf8'));
const rows = [];
const walk = (suite) => {
    for (const spec of suite.specs ?? []) {
        for (const t of spec.tests ?? []) {
            const r = t.results?.at(-1);
            const icon = { expected: '✅', unexpected: '❌', flaky: '⚠️', skipped: '⏭' }[t.status] ?? '❓';
            rows.push(`| ${icon} | ${spec.title} | ${r ? (r.duration / 1000).toFixed(1) + 's' : '-'} |`);
        }
    }
    (suite.suites ?? []).forEach(walk);
};
report.suites.forEach(walk);

const s = report.stats ?? {};
console.log('## E2E tests (Playwright, Chromium)\n');
console.log(`**${s.expected ?? 0} passed**, ${s.unexpected ?? 0} failed, ${s.flaky ?? 0} flaky, ${s.skipped ?? 0} skipped ` +
    `in ${((s.duration ?? 0) / 1000).toFixed(1)}s — spec: \`docs/specs/e2e-product-crud.spec.md\`\n`);
console.log('| | Test | Time |\n|---|---|---|');
console.log(rows.join('\n'));
console.log('\nFull HTML report (traces + screenshots on failure): artifact **playwright-report** below.');
