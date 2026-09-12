import { createHash, randomInt } from "node:crypto";

/**
 * Single-use recovery codes: the way back in when the security key is lost, and the reason a
 * passkey-only account is not a one-way door.
 *
 * Codes are **hashed, never encrypted** — verifying one only requires recognizing it. A plain
 * SHA-256 is the right hash here rather than scrypt or argon2: these are 50-bit random strings,
 * not human-chosen passwords, so there is no dictionary to run and no need for a slow KDF. It
 * also means a code can be looked up by its hash in one indexed query instead of by trying the
 * KDF against every stored code in turn.
 */

export const CODE_COUNT = 10;

/**
 * Crockford-ish base32 without I, L, O, U: no character pairs that get misread when someone
 * copies a code off a screen onto paper, and no vowels to accidentally spell anything.
 */
const ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
const GROUPS = 2;
const GROUP_LENGTH = 5;

/** ~49 bits per code: far beyond guessing, even before the per-account rate limit. */
export function generateCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g += 1) {
    let group = "";
    for (let i = 0; i < GROUP_LENGTH; i += 1) {
      // randomInt is rejection-sampled, so the distribution stays uniform.
      group += ALPHABET[randomInt(ALPHABET.length)];
    }
    groups.push(group);
  }
  return groups.join("-");
}

export function generateCodes(count = CODE_COUNT): string[] {
  return Array.from({ length: count }, generateCode);
}

/**
 * Normalizes before hashing so the stored hash does not depend on how the user typed it:
 * lowercase, missing hyphen, or surrounding whitespace all hash the same.
 */
export function normalizeCode(code: string): string {
  return code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
}

export function hashCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("base64url");
}

/** Formats a normalized code back into the grouped form shown to the user. */
export function formatCode(code: string): string {
  const clean = normalizeCode(code);
  const groups: string[] = [];
  for (let i = 0; i < clean.length; i += GROUP_LENGTH) {
    groups.push(clean.slice(i, i + GROUP_LENGTH));
  }
  return groups.join("-");
}
