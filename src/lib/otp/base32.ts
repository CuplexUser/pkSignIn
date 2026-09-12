/** RFC 4648 base32, which is the encoding `otpauth://` URIs use for the shared secret. */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const DECODE = new Map<string, number>();
for (let i = 0; i < ALPHABET.length; i += 1) DECODE.set(ALPHABET[i], i);

/** Encodes without padding: authenticator apps and QR readers expect it that way. */
export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) output += ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

/**
 * Tolerates the shapes a person actually types when entering a secret by hand: lowercase, the
 * spaces authenticator apps insert every four characters, and trailing `=` padding.
 */
export function base32Decode(input: string): Uint8Array {
  const clean = input.replace(/[\s-]/g, "").replace(/=+$/, "").toUpperCase();

  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of clean) {
    const index = DECODE.get(char);
    if (index === undefined) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }

  return Uint8Array.from(output);
}
