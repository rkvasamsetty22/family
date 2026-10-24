import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

// AES-256-GCM for sensitive identifiers (policy and loan account numbers).
function key() {
  const k = process.env.ENCRYPTION_KEY;
  if (!k) throw new Error("ENCRYPTION_KEY is not set");
  // A 32-byte base64 key is used as is; any other value is treated as a passphrase.
  const buf = Buffer.from(k, "base64");
  return buf.length === 32 ? buf : createHash("sha256").update(k).digest();
}

export function encrypt(plain: string | null | undefined): string | null {
  if (!plain) return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString("base64")).join(".");
}

export function decrypt(enc: string | null | undefined): string | null {
  if (!enc) return null;
  try {
    const [iv, tag, data] = enc.split(".").map((s) => Buffer.from(s, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function mask(value: string | null | undefined): string {
  if (!value) return "";
  return value.length <= 4 ? value : "••••" + value.slice(-4);
}
