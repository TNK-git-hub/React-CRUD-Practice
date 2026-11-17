// Creates .env from .env.example on first run, with a fresh MYINFO_ENCRYPTION_KEY.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

if (!existsSync(".env")) {
  const key = randomBytes(32).toString("hex");
  const text = readFileSync(".env.example", "utf8").replace(/^MYINFO_ENCRYPTION_KEY=.*$/m, `MYINFO_ENCRYPTION_KEY=${key}`);
  writeFileSync(".env", text);
  console.log("Created .env with a new MYINFO_ENCRYPTION_KEY");
}
