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
  /** Which passkey was used to sign in, for display on the dashboard. */
  credentialId: { type: "string", nullable: true, column: "credential_id" },
  expiresAt: { type: "date", column: "expires_at" },
  createdAt: { type: "date", column: "created_at" },
});
export type Session = Infer<typeof sessionSchema>;

/** `json` infers as `unknown`, so narrowing happens here instead of at every call site. */
export function credentialTransports(credential: Credential): string[] {
  return Array.isArray(credential.transports)
    ? credential.transports.filter((t): t is string => typeof t === "string")
    : [];
}
