// End-to-end tests (spec: docs/specs/e2e-product-crud.spec.md). Run with: pnpm e2e (from the repo root).
// ci/e2e.sh prepares the database and builds backend + frontend; Playwright then starts both servers.
import { defineConfig, devices } from '@playwright/test';

export const API_URL = 'http://localhost:3100';
const WEB_URL = 'http://localhost:4173';
const CI = !!process.env.CI;

export default defineConfig({
    testDir: './e2e',
    workers: 1,               // one shared database -> run the tests one after the other
    fullyParallel: false,
    forbidOnly: CI,           // a forgotten test.only fails CI
    retries: 0,               // a flaky test should be fixed, not hidden
    timeout: 30_000,
    reporter: CI
        ? [['list'], ['github'], ['html', { open: 'never' }], ['json', { outputFile: 'test-results/results.json' }]]
        : [['list'], ['html', { open: 'never' }]],
    use: {
        baseURL: WEB_URL,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    ],
    webServer: [
        {
            command: 'node dist/main',
            cwd: '../backend',
            url: `${API_URL}/products?limit=1`,
            timeout: 60_000,
            reuseExistingServer: false,
            stdout: 'pipe',
        },
        {
            command: 'pnpm exec vite preview --port 4173 --strictPort',
            url: WEB_URL,
            timeout: 60_000,
            reuseExistingServer: false,
        },
    ],
});
