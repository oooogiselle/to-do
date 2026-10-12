import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { env } from "@/lib/env";

function key(): Buffer {
  const k = Buffer.from(env.tokenEncryptionKey, "base64");
  if (k.length !== 32) throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return k;
}

/** AES-256-GCM. Output: base64(iv | tag | ciphertext). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decrypt(payload: string): string {
  const buf = Buffer.from(payload, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key(), buf.subarray(0, 12));
  decipher.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
}

function hmac(data: string): string {
  return createHmac("sha256", env.stateSecret).update(data).digest("base64url");
}

/** Signed, expiring OAuth state that binds the Google callback to a user id. */
export function signState(userId: string, ttlSec = 600): string {
  const body = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + ttlSec * 1000 })).toString(
    "base64url",
  );
  return `${body}.${hmac(body)}`;
}

export function verifyState(state: string): string | null {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;
  const expected = Buffer.from(hmac(body));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const { u, e } = JSON.parse(Buffer.from(body, "base64url").toString()) as {
    u: string;
    e: number;
  };
  return Date.now() < e ? u : null;
}

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
