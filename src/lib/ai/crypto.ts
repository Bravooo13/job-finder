import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Secrets (the Claude API key) are stored encrypted with AES-256-GCM. The
// encryption key comes from JOB_FINDER_SECRET, or a random key kept in
// data/.secret next to the database (both stay on this computer).

let cached: Buffer | null = null;

function secretKey(): Buffer {
  if (cached) return cached;
  const fromEnv = process.env.JOB_FINDER_SECRET;
  if (fromEnv) {
    cached = createHash("sha256").update(fromEnv).digest();
    return cached;
  }
  const file = path.join(process.cwd(), "data", ".secret");
  try {
    cached = Buffer.from(readFileSync(file, "utf8").trim(), "hex");
  } catch {
    mkdirSync(path.dirname(file), { recursive: true });
    const fresh = randomBytes(32).toString("hex");
    try {
      writeFileSync(file, fresh, { mode: 0o600, flag: "wx" });
    } catch {
      // Another request created it first; use theirs.
    }
    cached = Buffer.from(readFileSync(file, "utf8").trim(), "hex");
  }
  if (cached.length !== 32) throw new Error("data/.secret is damaged. Delete it and enter your API key again.");
  return cached;
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

/** Returns null when the value can't be decrypted (for example the secret changed). */
export function decrypt(value: string): string | null {
  const [version, iv, tag, data] = value.split(":");
  if (version !== "v1" || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
