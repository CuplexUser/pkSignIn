import aaguids from "./aaguids.json";

const names = aaguids as Record<string, string>;

/** An all-zero AAGUID means the authenticator declined to identify its model. */
const ANONYMOUS = "00000000-0000-0000-0000-000000000000";

/**
 * Resolves an AAGUID to the authenticator's model name, e.g. "YubiKey 5 Series with NFC".
 *
 * The map is vendored (generated from passkeydeveloper/passkey-authenticator-aaguids, names
 * only — the upstream file is ~7MB because it embeds icons as data URIs) rather than fetched,
 * so a lookup is synchronous and the app makes no outbound requests.
 *
 * Most authenticators report a zero AAGUID unless attestation was requested: registering with
 * attestation "none" usually gets you nothing here, which is why the UI offers "direct".
 */
export function authenticatorName(aaguid: string | null): string | null {
  if (!aaguid || aaguid === ANONYMOUS) return null;
  return names[aaguid] ?? null;
}

export function isAnonymousAaguid(aaguid: string | null): boolean {
  return !aaguid || aaguid === ANONYMOUS;
}
