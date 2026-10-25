import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "crypto";
import { hashPassword, needsRehash, passwordProblem, safeEqual, verifyPassword } from "../src/lib/password";
import { encrypt, decrypt, mask } from "../src/lib/crypto";
import { contentSecurityPolicy } from "../src/lib/csp";
import { isLocked, LOGIN_EMAIL, nextState } from "../src/lib/throttle";
import { sessionTooOld, ABSOLUTE_MS } from "../src/auth.config";

test("password hashes use OWASP scrypt parameters and verify", async () => {
  const h = await hashPassword("correct horse battery");
  assert.match(h, /^scrypt\$131072\$8\$1\$/);
  assert.equal(await verifyPassword("correct horse battery", h), true);
  assert.equal(await verifyPassword("wrong horse battery", h), false);
  assert.equal(needsRehash(h), false);
  assert.notEqual(await hashPassword("correct horse battery"), h, "salted");
});

test("hashes from before stored parameters still verify and are flagged for rehash", async () => {
  const salt = randomBytes(16);
  const legacy = `scrypt$${salt.toString("base64")}$${scryptSync("old password 1", salt, 64).toString("base64")}`;
  assert.equal(await verifyPassword("old password 1", legacy), true);
  assert.equal(needsRehash(legacy), true);
});

test("missing or malformed hashes fail closed", async () => {
  assert.equal(await verifyPassword("anything at all", null), false);
  assert.equal(await verifyPassword("anything at all", "plain"), false);
  assert.equal(await verifyPassword("anything at all", "scrypt$99999999$8$1$a$b"), false);
});

test("password rules", () => {
  assert.equal(passwordProblem("short"), "short");
  assert.equal(passwordProblem("x".repeat(300)), "long");
  assert.equal(passwordProblem("aaaaaaaaaaaa"), "weak");
  assert.equal(passwordProblem("MyPassword2026"), "weak");
  assert.equal(passwordProblem("lakshmi-2026-home", "lakshmi@gmail.com"), "weak");
  assert.equal(passwordProblem("blue mango river 7"), null);
});

test("safeEqual", () => {
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
});

test("sensitive fields round-trip through AES-GCM and reject tampering", () => {
  process.env.ENCRYPTION_KEY = "test passphrase for encryption";
  const enc = encrypt("POL-1234567890")!;
  assert.ok(!enc.includes("1234567890"));
  assert.equal(decrypt(enc), "POL-1234567890");
  const [iv, tag, data] = enc.split(".");
  const flipped = Buffer.from(data, "base64");
  flipped[0] ^= 1;
  assert.equal(decrypt([iv, tag, flipped.toString("base64")].join(".")), null);
  assert.equal(mask("POL-1234567890"), "••••7890");
});

test("lockout after five failures inside the window, reset after it", () => {
  const t0 = new Date("2026-10-25T00:00:00Z");
  let row: ReturnType<typeof nextState> | undefined;
  for (let i = 0; i < 4; i++) row = nextState(row, LOGIN_EMAIL, t0);
  assert.equal(row!.failures, 4);
  assert.equal(isLocked(row, t0), false);
  row = nextState(row, LOGIN_EMAIL, t0);
  assert.equal(isLocked(row, t0), true);
  assert.equal(isLocked(row, new Date(t0.getTime() + LOGIN_EMAIL.lockMs + 1)), false);
  const later = new Date(t0.getTime() + LOGIN_EMAIL.windowMs + 1);
  assert.deepEqual(nextState({ failures: 3, windowStart: t0, lockedUntil: null }, LOGIN_EMAIL, later), {
    failures: 1,
    windowStart: later,
    lockedUntil: null,
  });
});

test("sessions without a sign-in time or older than 12 hours are rejected", () => {
  const now = Date.now();
  assert.equal(sessionTooOld(undefined, now), true);
  assert.equal(sessionTooOld(now - 1000, now), false);
  assert.equal(sessionTooOld(now - ABSOLUTE_MS - 1, now), true);
});

test("production CSP allows only nonce scripts and no framing", () => {
  const csp = contentSecurityPolicy("abc123", false);
  assert.match(csp, /script-src 'self' 'nonce-abc123' 'strict-dynamic'(;|$)/);
  assert.ok(!csp.includes("unsafe-eval"));
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /object-src 'none'/);
});
