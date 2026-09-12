/**
 * The ceremony knobs the UI exposes. These are exactly the settings that make a YubiKey behave
 * differently between a desktop browser and Chrome on Android, so the demo lets you change
 * them and watch what happens rather than burying them in a constant.
 */
export interface CeremonyPreferences {
  /** Whether the credential must be discoverable (a "resident key") on the authenticator. */
  residentKey: "discouraged" | "preferred" | "required";
  /** Whether a PIN or biometric is demanded in addition to the touch. */
  userVerification: "discouraged" | "preferred" | "required";
  /** "direct" asks for an attestation statement, which is what reveals the AAGUID. */
  attestation: "none" | "direct";
  /** Steer the browser toward a roaming security key instead of the platform authenticator. */
  preferSecurityKey: boolean;
}

export const defaultPreferences: CeremonyPreferences = {
  residentKey: "preferred",
  userVerification: "preferred",
  attestation: "none",
  // On by default because Windows Hello otherwise intercepts the prompt on most PCs, which
  // makes a YubiKey demo look broken before the key is ever touched.
  preferSecurityKey: true,
};

const residentKeys = new Set(["discouraged", "preferred", "required"]);
const userVerifications = new Set(["discouraged", "preferred", "required"]);
const attestations = new Set(["none", "direct"]);

function pick<T extends string>(value: unknown, allowed: Set<string>, fallback: T): T {
  return typeof value === "string" && allowed.has(value) ? (value as T) : fallback;
}

/**
 * Preferences arrive from the browser, so every field is checked against an allowlist. An
 * unrecognized value falls back to the default instead of reaching the WebAuthn layer, where
 * it would become an opaque DOMException in the user's browser.
 */
export function parsePreferences(input: unknown): CeremonyPreferences {
  const raw = (input ?? {}) as Record<string, unknown>;
  return {
    residentKey: pick(raw.residentKey, residentKeys, defaultPreferences.residentKey),
    userVerification: pick(
      raw.userVerification,
      userVerifications,
      defaultPreferences.userVerification,
    ),
    attestation: pick(raw.attestation, attestations, defaultPreferences.attestation),
    preferSecurityKey:
      typeof raw.preferSecurityKey === "boolean"
        ? raw.preferSecurityKey
        : defaultPreferences.preferSecurityKey,
  };
}
