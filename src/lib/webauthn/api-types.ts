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
}

export interface OptionsRequest {
  username?: string;
  displayName?: string;
  preferences?: Partial<CeremonyPreferences>;
}

export interface ApiError {
  error: string;
}
