// Configuration from environment variables (D-42). No test-environment detection here or anywhere else.
export interface AppConfig {
  port: number;
  /** Base URL put in emails and used for the gateway pages; must be reachable from the customer's phone. */
  publicBaseUrl: string;
  linkTtlMs: number;
  pollIntervalMs: number;
  resendLimit: number;
  resendWindowMs: number;
  /** D-31: the simulated gateway shows the review screen before "Submit Application". */
  showReview: boolean;
}

type Env = Record<string, string | undefined>;

const HOUR = 3_600_000;

function positive(env: Env, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number`);
  return n;
}

export function loadConfig(env: Env, defaults: { publicBaseUrl?: string } = {}): AppConfig {
  const port = positive(env, "PORT", 3000);
  const base = env.PUBLIC_BASE_URL?.trim() || defaults.publicBaseUrl || `http://localhost:${port}`;
  return {
    port,
    publicBaseUrl: base.replace(/\/+$/, ""),
    linkTtlMs: positive(env, "LINK_TTL_HOURS", 72) * HOUR,
    pollIntervalMs: positive(env, "POLL_INTERVAL_MS", 2000),
    resendLimit: positive(env, "RESEND_LIMIT", 3),
    resendWindowMs: positive(env, "RESEND_WINDOW_HOURS", 24) * HOUR,
    showReview: env.MYINFO_SHOW_REVIEW !== "false",
  };
}
