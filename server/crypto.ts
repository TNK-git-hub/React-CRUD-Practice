// AES-256-GCM for stored Myinfo data (D-03). Key: MYINFO_ENCRYPTION_KEY (64 hex chars).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** D-03: the key comes only from the environment; there is no default. */
export function loadKey(hex: string | undefined): Buffer {
  if (!hex?.trim()) {
    throw new Error("MYINFO_ENCRYPTION_KEY is not set. Run `npm run setup` (creates .env with a new key) or set it in the environment.");
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hex.trim())) {
    throw new Error("MYINFO_ENCRYPTION_KEY must be 64 hexadecimal characters (a 256-bit AES key). Run `npm run setup` to generate one.");
  }
  return Buffer.from(hex.trim(), "hex");
}

export function encrypt(key: Buffer, plain: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(plain), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decrypt<T>(key: Buffer, sealed: string): T {
  const [iv, tag, data] = sealed.split(".").map((s) => Buffer.from(s, "base64"));
  if (!iv || !tag || !data) throw new Error("Bad ciphertext");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8")) as T;
}
