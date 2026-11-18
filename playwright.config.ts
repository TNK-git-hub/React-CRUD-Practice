// End-to-end test of the main demo script (D-36). Starts its own server on port 3100 with its own data file,
// a throw-away encryption key and a fast auto-verify job; never touches data/db.json or .env.
import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: BASE, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "node server/index.ts",
    url: `${BASE}/api/config`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      PORT: String(PORT),
      PUBLIC_BASE_URL: BASE,
      MYINFO_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
      POLL_INTERVAL_MS: "500",
      DATA_FILE: "test-results/e2e-db.json",
      SMTP_HOST: "",
    },
  },
});
