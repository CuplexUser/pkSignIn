import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { base32Decode, base32Encode } from "./base32";

/**
 * TOTP (RFC 6238) on top of HOTP (RFC 4226). Implemented directly rather than pulled in as a
 * dependency: it is about forty lines, it is the part of this demo worth reading, and it is
 * verified against the test vectors in RFC 6238 Appendix B.
 */

export type TotpAlgorithm = "SHA1" | "SHA256" | "SHA512";

export interface TotpOptions {
  digits: number;
  /** Seconds per step. 30 is what every authenticator app assumes. */
  period: number;
  algorithm: TotpAlgorithm;
}

/**
 * SHA1 and 6 digits are not a security choice, they are an interoperability one: they are the
 * only combination every authenticator app reads correctly from a QR code. HMAC-SHA1 is not
 * affected by SHA-1's collision weaknesses.
 */
export const totpDefaults: TotpOptions = { digits: 6, period: 30, algorithm: "SHA1" };

const hashName: Record<TotpAlgorithm, string> = {
  SHA1: "sha1",
  SHA256: "sha256",
  SHA512: "sha512",
};

/** 20 bytes is the RFC 4226 recommendation and matches a SHA1 HMAC block. */
export function generateSecret(byteLength = 20): string {
  return base32Encode(randomBytes(byteLength));
}

/** HOTP: the truncated HMAC of a counter, per RFC 4226 section 5.3. */
export function hotp(secret: Uint8Array, counter: bigint, options: TotpOptions): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(counter);

  const digest = createHmac(hashName[options.algorithm], secret).update(message).digest();

  // Dynamic truncation: the low nibble of the last byte picks the 4-byte window to read.
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);

  return (binary % 10 ** options.digits).toString().padStart(options.digits, "0");
}

/** Which time step a moment falls in. Exported because replay protection is keyed on it. */
export function stepFor(atMs: number, period: number): bigint {
  return BigInt(Math.floor(atMs / 1000 / period));
}

export function totpCode(
  secretBase32: string,
  atMs: number = Date.now(),
  options: TotpOptions = totpDefaults,
): string {
  return hotp(base32Decode(secretBase32), stepFor(atMs, options.period), options);
}

export interface VerifyResult {
  valid: boolean;
  /** The step the code matched, so the caller can refuse to accept that step again. */
  step: bigint | null;
}

/**
 * Checks a code against the steps around now.
 *
 * `window: 1` accepts the previous and next step as well as the current one, tolerating clock
 * drift and a code typed just as it rolled over. It is the usual default, and the cost is that a
 * code stays valid for about 90 seconds rather than 30.
 *
 * The comparison is constant time so a response cannot be used to learn the code digit by digit,
 * and `notBeforeStep` is what stops a code being replayed inside its own validity window.
 */
export function verifyTotp(
  secretBase32: string,
  code: string,
  {
    atMs = Date.now(),
    window = 1,
    notBeforeStep = null,
    options = totpDefaults,
  }: {
    atMs?: number;
    window?: number;
    notBeforeStep?: bigint | null;
    options?: TotpOptions;
  } = {},
): VerifyResult {
  const candidate = code.replace(/[\s-]/g, "");
  if (!new RegExp(`^\\d{${options.digits}}$`).test(candidate)) return { valid: false, step: null };

  const secret = base32Decode(secretBase32);
  const current = stepFor(atMs, options.period);
  const expected = Buffer.from(candidate, "utf8");

  for (let offset = -window; offset <= window; offset += 1) {
    const step = current + BigInt(offset);
    if (step < 0n) continue;
    // A code from a step already spent is a replay, not a valid login.
    if (notBeforeStep !== null && step <= notBeforeStep) continue;

    const actual = Buffer.from(hotp(secret, step, options), "utf8");
    if (actual.length === expected.length && timingSafeEqual(actual, expected)) {
      return { valid: true, step };
    }
  }

  return { valid: false, step: null };
}

/** The `otpauth://` URI an authenticator app reads out of the QR code. */
export function otpauthUri({
  secret,
  accountName,
  issuer,
  options = totpDefaults,
}: {
  secret: string;
  accountName: string;
  issuer: string;
  options?: TotpOptions;
}): string {
  // The label repeats the issuer by convention, so apps that ignore the parameter still group
  // the entry correctly.
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`;
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: options.algorithm,
    digits: String(options.digits),
    period: String(options.period),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
