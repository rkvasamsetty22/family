import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "crypto";

const scryptAsync = (pw: string, salt: Buffer, len: number, opts: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => scrypt(pw, salt, len, opts, (err, key) => (err ? reject(err) : resolve(key))));

export const MIN_PASSWORD = 10;
// Long enough for passphrases; caps the work an attacker can make each hash do.
export const MAX_PASSWORD = 256;

// OWASP minimum for scrypt: N=2^17, r=8, p=1 (128 MiB per hash).
const PARAMS = { N: 2 ** 17, r: 8, p: 1 };
// Hashes written before parameters were stored used Node's defaults.
const LEGACY = { N: 2 ** 14, r: 8, p: 1 };
const maxmem = (o: { N: number; r: number }) => 128 * o.N * o.r + 32 * 1024 * 1024;

// Stored as scrypt$N$r$p$salt$hash (legacy: scrypt$salt$hash).
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64, { ...PARAMS, maxmem: maxmem(PARAMS) });
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

function parse(stored: string) {
  const parts = stored.split("$");
  if (parts[0] !== "scrypt") return null;
  if (parts.length === 3) return { ...LEGACY, salt: parts[1], hash: parts[2] };
  if (parts.length !== 6) return null;
  const [N, r, p] = parts.slice(1, 4).map(Number);
  if (![N, r, p].every(Number.isInteger) || N > 2 ** 20 || r > 32 || p > 4) return null;
  return { N, r, p, salt: parts[4], hash: parts[5] };
}

// Used when the email has no password, so a wrong email takes as long as a wrong password.
let dummy: Promise<string> | undefined;

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const s = stored ? parse(stored) : null;
  if (!s || password.length > MAX_PASSWORD) {
    await verifyPassword("x", await (dummy ??= hashPassword(randomBytes(16).toString("hex"))));
    return false;
  }
  const expected = Buffer.from(s.hash, "base64");
  if (expected.length < 16) return false;
  const actual = await scryptAsync(password, Buffer.from(s.salt, "base64"), expected.length, { N: s.N, r: s.r, p: s.p, maxmem: maxmem(s) });
  return timingSafeEqual(actual, expected);
}

export function needsRehash(stored: string | null | undefined): boolean {
  const s = stored ? parse(stored) : null;
  return !s || s.N < PARAMS.N || s.r < PARAMS.r || s.p < PARAMS.p;
}

// Returns a message key when the password is not acceptable.
export function passwordProblem(password: string, email?: string | null): "short" | "long" | "weak" | null {
  if (password.length < MIN_PASSWORD) return "short";
  if (password.length > MAX_PASSWORD) return "long";
  const lower = password.toLowerCase();
  const local = email?.split("@")[0]?.toLowerCase();
  if (new Set(lower).size < 4 || COMMON.some((c) => lower.includes(c)) || (local && local.length >= 4 && lower.includes(local))) return "weak";
  return null;
}

const COMMON = ["password", "passw0rd", "12345678", "qwerty", "iloveyou", "letmein", "welcome", "admin123", "abc12345", "11111111"];

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
