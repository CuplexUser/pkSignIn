import { headers } from "next/headers";

export interface RelyingParty {
  /** The WebAuthn RP ID: a bare domain, never a port or a scheme. */
  rpID: string;
  rpName: string;
  /** Scheme + host + port, matched exactly against the authenticator's clientDataJSON. */
  origin: string;
}

export const RP_NAME = process.env.WEBAUTHN_RP_NAME ?? "Passkey Demo";

/**
 * WebAuthn is origin-bound: a credential created for one RP ID cannot be used on another, and
 * the origin the browser reports is checked byte for byte during verification. Deriving both
 * from the incoming request rather than hardcoding them is what lets one build serve
 * localhost during development and a *.vercel.app preview URL after deploying, with no
 * rebuild — and a preview URL changes per deployment, so hardcoding it would mean every
 * registered passkey stopped working on the next deploy.
 *
 * WEBAUTHN_RP_ID / WEBAUTHN_ORIGIN override the derivation when the app sits behind a proxy
 * that rewrites the host, or when credentials should be pinned to an apex domain so they keep
 * working across subdomains.
 */
export async function relyingParty(): Promise<RelyingParty> {
  const headerList = await headers();

  // x-forwarded-host wins: on Vercel (and behind any reverse proxy) `host` is the internal
  // hostname, which is not what the browser used and so not what the authenticator signed.
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const hostname = host.split(":")[0];
  const proto =
    headerList.get("x-forwarded-proto") ??
    (hostname === "localhost" || hostname === "127.0.0.1" ? "http" : "https");

  return {
    rpID: process.env.WEBAUTHN_RP_ID ?? hostname,
    origin: process.env.WEBAUTHN_ORIGIN ?? `${proto}://${host}`,
    rpName: RP_NAME,
  };
}
