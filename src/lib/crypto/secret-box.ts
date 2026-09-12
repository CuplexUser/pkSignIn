import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Authenticated encryption for secrets that must be recoverable in plaintext.
 *
 * A TOTP secret cannot be hashed the way a password is — the server needs the original bytes on
 * every verification — so it is encrypted at rest instead. AES-256-GCM is authenticated, so a
 * tampered ciphertext fails to decrypt rather than yielding altered plaintext.
 *
 * Recovery codes are *not* encrypted with this; they are hashed, because verifying one only
 * requires recognizing it, never reading it back.
 */

const VERSION = "v1";
const IV_BYTES = 12; // 96 bits, the size GCM is specified for
const TAG_BYTES = 16;

let cachedKey: Buffer | null = null;
let warned = false;

function key(): Buffer {
  if (cachedKey) return cachedKey;

  const configured = process.env.APP_ENCRYPTION_KEY;
  if (configured) {
    const bytes = Buffer.from(configured, "base64");
    if (bytes.length !== 32) {
      throw new Error(
        `APP_ENCRYPTION_KEY must be 32 bytes of base64 (got ${bytes.length}). Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
      );
    }
    cachedKey = bytes;
    return cachedKey;
  }

  // Refusing to boot would make the demo unrunnable out of the box; booting silently with a
  // known key would be worse. So: derive a fixed development key and say so, loudly, once.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "APP_ENCRYPTION_KEY is required in production. TOTP secrets are encrypted with it, and without it they would be readable by anyone holding a copy of the database.",
    );
  }
  if (!warned) {
    console.warn(
      "[crypto] APP_ENCRYPTION_KEY is not set — using a fixed development key. TOTP secrets in .data are NOT meaningfully encrypted. See .env.local.example.",
    );
    warned = true;
  }
  cachedKey = createHash("sha256").update("pksignin-insecure-development-key").digest();
  return cachedKey;
}

/** Returns `v1.<base64 of iv || tag || ciphertext>`. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${VERSION}.${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64")}`;
}

export function decryptSecret(envelope: string): string {
  const [version, payload] = envelope.split(".", 2);
  if (version !== VERSION || !payload) {
    throw new Error("Unrecognized secret envelope; it was written by a different scheme.");
  }

  const bytes = Buffer.from(payload, "base64");
  const iv = bytes.subarray(0, IV_BYTES);
  const tag = bytes.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
  const ciphertext = bytes.subarray(IV_BYTES + TAG_BYTES);

  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  // Throws if the ciphertext or tag was altered, which is the point of GCM.
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
