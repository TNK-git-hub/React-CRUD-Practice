// AES-256-GCM for stored Myinfo data (D-03). Key: MYINFO_ENCRYPTION_KEY (64 hex chars).
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function loadKey(hex: string | undefined): Buffer {
  if (!hex || !/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("MYINFO_ENCRYPTION_KEY must be 64 hex characters (run `npm run setup`).");
  }
  return Buffer.from(hex, "hex");
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
