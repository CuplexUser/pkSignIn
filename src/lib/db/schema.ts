import { defineSchema, type Infer } from "repolayer";

/**
 * One repolayer schema per table. These descriptors are the only place the storage shape is
 * written down: `ensureTable()` generates the DDL from them and `verifyTable()` checks a live
 * table against them, so there is no separate .sql file to drift out of sync.
 *
 * repolayer's field types are string | number | integer | boolean | date | json — there is no
 * binary type, which is why the credential public key is stored as a base64url *string*
 * rather than a BLOB. SimpleWebAuthn hands us a Uint8Array and `isoBase64URL` converts both
 * ways; text also survives the move to Postgres without a bytea special case.
 */

export const userSchema = defineSchema({
  id: { type: "string", primaryKey: true },
  username: { type: "string", unique: true },
  displayName: { type: "string", column: "display_name" },
  createdAt: { type: "date", column: "created_at" },
  updatedAt: { type: "date", column: "updated_at" },
});
export type User = Infer<typeof userSchema>;

export const credentialSchema = defineSchema({
  /** The authenticator's own credential ID, base64url. Supplied, never generated. */
  id: { type: "string", primaryKey: true },
  userId: { type: "string", column: "user_id" },
  /** COSE public key, base64url encoded. */
  publicKey: { type: "string", column: "public_key" },
  /** Signature counter. Many authenticators, including most passkeys, always report 0. */
  counter: { type: "integer" },
  /** string[] as reported by the authenticator, e.g. ["usb"] or ["nfc","usb"]. */
  transports: { type: "json", nullable: true },
  /** Authenticator model identifier; resolved to a human name via the AAGUID map. */
  aaguid: { type: "string", nullable: true },
  /** Attestation statement format: "none", "packed", "apple", … */
  fmt: { type: "string", nullable: true },
  /** "singleDevice" (a hardware key) or "multiDevice" (a syncable passkey). */
  deviceType: { type: "string", nullable: true, column: "device_type" },
  backedUp: { type: "boolean", column: "backed_up" },
  /** Whether user verification (PIN/biometric) happened at registration. */
  userVerified: { type: "boolean", column: "user_verified" },
  discoverable: { type: "boolean" },
  nickname: { type: "string", nullable: true },
  lastUsedAt: { type: "date", nullable: true, column: "last_used_at" },
  createdAt: { type: "date", column: "created_at" },
  updatedAt: { type: "date", column: "updated_at" },
});
export type Credential = Infer<typeof credentialSchema>;

/**
 * Challenges live server-side for exactly one ceremony. The browser only ever sees an opaque
 * row id in a short-lived cookie; round-tripping the challenge itself through the client
 * would let a caller choose it, which defeats the whole point of a challenge.
 */
export const challengeSchema = defineSchema({
  id: { type: "string", primaryKey: true },
  challenge: { type: "string" },
  /** "registration" | "authentication" — a challenge is not valid for the other ceremony. */
  kind: { type: "string" },
  /** Set for registration and for username-led sign-in; null for discoverable sign-in. */
  userId: { type: "string", nullable: true, column: "user_id" },
  /**
   * For a registration that will create a new account, the username and display name are held
   * here and the `users` row is only written once the ceremony verifies. Creating the account up
   * front would let an abandoned registration squat a username permanently: it would be refused
   * as taken, with no passkey on it to sign in with.
   */
  pendingUsername: { type: "string", nullable: true, column: "pending_username" },
  pendingDisplayName: { type: "string", nullable: true, column: "pending_display_name" },
  /**
   * Whether the options we issued demanded user verification. Carried on the challenge so the
   * verify step enforces the policy the options actually asked for, rather than trusting the
   * client to resend it.
   */
  requireUserVerification: { type: "boolean", column: "require_user_verification" },
  expiresAt: { type: "date", column: "expires_at" },
});
export type Challenge = Infer<typeof challengeSchema>;

export const sessionSchema = defineSchema({
  /** A 256-bit random token, supplied by us rather than a UUID. */
  id: { type: "string", primaryKey: true },
  userId: { type: "string", column: "user_id" },
  /** Which passkey was used to sign in; null for a code-based sign-in. */
  credentialId: { type: "string", nullable: true, column: "credential_id" },
  /**
   * "passkey" | "totp" | "recovery". Recorded because a session opened with a recovery code is
   * weaker than one backed by a security key, and the dashboard should say so and push the user
   * to enroll a new passkey.
   */
  method: { type: "string" },
  expiresAt: { type: "date", column: "expires_at" },
  createdAt: { type: "date", column: "created_at" },
});
export type Session = Infer<typeof sessionSchema>;

/**
 * One TOTP enrollment per account. The row exists from the moment enrollment starts; until
 * `confirmedAt` is set it is a half-finished setup that cannot be used to sign in, which is what
 * stops an account being locked to a secret the user never successfully scanned.
 */
export const totpSchema = defineSchema({
  /** The user id, used directly as the primary key: an account has at most one enrollment. */
  id: { type: "string", primaryKey: true },
  /** AES-256-GCM envelope, never the raw base32 secret. */
  secret: { type: "string" },
  digits: { type: "integer" },
  period: { type: "integer" },
  algorithm: { type: "string" },
  /** Null while enrollment is pending; set once a first valid code proves the app is synced. */
  confirmedAt: { type: "date", nullable: true, column: "confirmed_at" },
  /**
   * The last time step spent by a successful sign-in, stored as text because a step is a bigint
   * and outlives the 32-bit integer range this column would otherwise get on some engines.
   * A code from this step or earlier is a replay and is refused.
   */
  lastUsedStep: { type: "string", nullable: true, column: "last_used_step" },
  createdAt: { type: "date", column: "created_at" },
  updatedAt: { type: "date", column: "updated_at" },
});
export type TotpEnrollment = Infer<typeof totpSchema>;

/**
 * Single-use recovery codes, stored as SHA-256 hashes. Used codes are kept rather than deleted so
 * the dashboard can show how many are left and when each was spent.
 */
export const recoveryCodeSchema = defineSchema({
  id: { type: "string", primaryKey: true },
  userId: { type: "string", column: "user_id" },
  /** Unique so a lookup by hash is an index hit, and so one code cannot exist twice. */
  codeHash: { type: "string", unique: true, column: "code_hash" },
  usedAt: { type: "date", nullable: true, column: "used_at" },
  createdAt: { type: "date", column: "created_at" },
});
export type RecoveryCode = Infer<typeof recoveryCodeSchema>;

/**
 * Failure counters for the code-based sign-in paths.
 *
 * A six-digit TOTP is only 10^6 possibilities and stays valid for about 90 seconds, so without a
 * limit on attempts it is guessable by a script. The passkey routes need nothing like this: a
 * signature cannot be guessed.
 */
export const throttleSchema = defineSchema({
  /** `<purpose>:<userId>`, supplied by the caller rather than generated. */
  id: { type: "string", primaryKey: true },
  failures: { type: "integer" },
  lockedUntil: { type: "date", nullable: true, column: "locked_until" },
  updatedAt: { type: "date", column: "updated_at" },
});
export type Throttle = Infer<typeof throttleSchema>;

/** `json` infers as `unknown`, so narrowing happens here instead of at every call site. */
export function credentialTransports(credential: Credential): string[] {
  return Array.isArray(credential.transports)
    ? credential.transports.filter((t): t is string => typeof t === "string")
    : [];
}
