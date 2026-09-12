import { NextResponse } from "next/server";
import { CeremonyError } from "./challenge";
import { authenticatorName, isAnonymousAaguid } from "@/lib/aaguid/lookup";
import { credentialTransports, type Credential } from "@/lib/db/schema";
import type { CredentialView } from "./api-types";

export function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

/**
 * Turns a thrown value into a response. A `CeremonyError` is something the user can fix (no
 * challenge, expired, wrong ceremony) so its message is shown to them; SimpleWebAuthn's
 * verification failures are also safe and specific enough to surface, and are the single most
 * useful thing to see when a YubiKey misbehaves. Anything else is a bug and is logged rather
 * than leaked.
 */
export function handleError(error: unknown) {
  if (error instanceof CeremonyError) return fail(400, error.message);
  if (error instanceof Error) {
    console.error("[webauthn]", error);
    return fail(400, error.message);
  }
  console.error("[webauthn] unknown error", error);
  return fail(500, "Unexpected error.");
}

const USERNAME = /^[a-zA-Z0-9._-]{3,32}$/;

export function normalizeUsername(input: unknown): string {
  const username = typeof input === "string" ? input.trim().toLowerCase() : "";
  if (!USERNAME.test(username)) {
    throw new CeremonyError(
      "Username must be 3-32 characters, using letters, numbers, dot, underscore or hyphen.",
    );
  }
  return username;
}

export function toCredentialView(
  credential: Credential,
  currentCredentialId: string | null,
): CredentialView {
  return {
    id: credential.id,
    nickname: credential.nickname,
    authenticatorName: authenticatorName(credential.aaguid),
    aaguid: isAnonymousAaguid(credential.aaguid) ? null : credential.aaguid,
    fmt: credential.fmt,
    transports: credentialTransports(credential),
    deviceType: credential.deviceType,
    backedUp: credential.backedUp,
    userVerified: credential.userVerified,
    discoverable: credential.discoverable,
    counter: credential.counter,
    createdAt: credential.createdAt.toISOString(),
    lastUsedAt: credential.lastUsedAt?.toISOString() ?? null,
    current: credential.id === currentCredentialId,
  };
}
