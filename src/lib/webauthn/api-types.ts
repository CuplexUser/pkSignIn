import type { CeremonyPreferences } from "./preferences";

/** What the verify endpoints report back, so the debug panel can show the real flags. */
export interface CeremonyOutcome {
  verified: boolean;
  credentialId: string;
  /** Did the authenticator perform user verification (PIN or biometric)? */
  userVerified: boolean;
  /** "singleDevice" for a hardware key, "multiDevice" for a synced passkey. */
  credentialDeviceType: string | null;
  credentialBackedUp: boolean | null;
  /** Attestation format: "none", "packed", … Only meaningful when attestation was requested. */
  fmt: string | null;
  aaguid: string | null;
  authenticatorName: string | null;
  /** Whether the credential ended up discoverable, per the credProps extension. */
  discoverable: boolean | null;
  transports: string[];
  counter: number;
  rpID: string;
  origin: string;
}

export interface CredentialView {
  id: string;
  nickname: string | null;
  authenticatorName: string | null;
  aaguid: string | null;
  fmt: string | null;
  transports: string[];
  deviceType: string | null;
  backedUp: boolean;
  userVerified: boolean;
  discoverable: boolean;
  counter: number;
  createdAt: string;
  lastUsedAt: string | null;
  /** True for the passkey that authenticated the current session. */
  current: boolean;
}

export interface MeResponse {
  username: string;
  displayName: string;
  credentials: CredentialView[];
  totp: TotpStatus;
  recovery: RecoveryStatus;
  /**
   * True when the session was opened with a recovery code rather than a passkey. The dashboard
   * uses it to push the user to enroll a new key, which is the whole point of recovering.
   */
  viaRecovery: boolean;
}

export interface OptionsRequest {
  username?: string;
  displayName?: string;
  preferences?: Partial<CeremonyPreferences>;
}

export interface ApiError {
  error: string;
}

/** TOTP enrollment state, as the dashboard needs to render it. */
export interface TotpStatus {
  enrolled: boolean;
  /** True when enrollment was started but never confirmed with a code. */
  pending: boolean;
  confirmedAt: string | null;
  digits: number;
  period: number;
  algorithm: string;
}

export interface TotpEnrollResponse {
  /** Base32, shown so the secret can be typed in when a QR cannot be scanned. */
  secret: string;
  otpauthUri: string;
  /** Pre-rendered SVG; the QR never leaves the server as an image request. */
  qrSvg: string;
}

export interface RecoveryStatus {
  /** Zero means none have ever been generated. */
  total: number;
  remaining: number;
  generatedAt: string | null;
}

export interface RecoveryGenerateResponse {
  /** Plaintext, returned exactly once — only hashes are stored. */
  codes: string[];
  generatedAt: string;
}
