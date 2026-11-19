// Entry point: configuration from the environment, then the runtime (HTTP + SSE + auto-verify job).
import { networkInterfaces } from "node:os";
import { join, resolve } from "node:path";
import { AdjustableClock } from "./clock.ts";
import { loadConfig } from "./config.ts";
import { loadKey } from "./crypto.ts";
import { createEmailSender } from "./mail.ts";
import { createRuntime } from "./runtime.ts";

function lanAddress(): string | null {
  for (const list of Object.values(networkInterfaces()))
    for (const i of list ?? []) if (i.family === "IPv4" && !i.internal) return i.address;
  return null;
}

let key: Buffer;
try {
  key = loadKey(process.env.MYINFO_ENCRYPTION_KEY); // D-03: refuse to start without it
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}

const port = Number(process.env.PORT || 3000);
const config = loadConfig(process.env, {
  publicBaseUrl: process.env.RENDER_EXTERNAL_URL || `http://${lanAddress() ?? "localhost"}:${port}`,
});
const rt = createRuntime({
  config,
  clock: new AdjustableClock(),
  dbFile: process.env.DATA_FILE || join(resolve(import.meta.dirname, ".."), "data", "db.json"),
  key,
  email: createEmailSender(process.env),
  smtpConfigured: Boolean(process.env.SMTP_HOST),
});

for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => void rt.close().then(() => process.exit(0)));

rt.server.listen(config.port, "0.0.0.0", () => {
  rt.startJob();
  console.log(`\nValueMax Singpass demo running`);
  console.log(`  Laptop:       http://localhost:${config.port}`);
  console.log(`  Phone links:  ${config.publicBaseUrl}  (PUBLIC_BASE_URL)`);
  console.log(`  Demo Control: http://localhost:${config.port}/demo`);
  console.log(`  Gateway:      simulated ValueMax Myinfo gateway (/gateway/<LinkId>)`);
  console.log(`  Auto-verify:  every ${config.pollIntervalMs} ms`);
  console.log(`  Email:        ${process.env.SMTP_HOST ? `SMTP ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}` : "SMTP not configured — links printed below"}\n`);
});
