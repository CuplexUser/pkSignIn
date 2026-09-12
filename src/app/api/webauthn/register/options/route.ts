import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { isoUint8Array } from "@simplewebauthn/server/helpers";
import type { AuthenticatorTransport } from "@simplewebauthn/server";
import { getDb } from "@/lib/db";
import { credentialTransports } from "@/lib/db/schema";
import { currentSession } from "@/lib/session";
import { saveChallenge } from "@/lib/webauthn/challenge";
import { fail, handleError, normalizeUsername } from "@/lib/webauthn/http";
import { parsePreferences } from "@/lib/webauthn/preferences";
import { relyingParty } from "@/lib/webauthn/rp";
import type { OptionsRequest } from "@/lib/webauthn/api-types";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as OptionsRequest;
    const preferences = parsePreferences(body.preferences);
    const { rpID, rpName, origin } = await relyingParty();
    const db = await getDb();

    /**
     * Two different flows reach this endpoint, and conflating them would be an account
     * takeover: anyone could "register" an existing username and attach their own key to it.
     * Signed in means adding another passkey to your own account; signed out means claiming a
     * new username, and an existing one is refused.
     */
    const session = await currentSession();

    // The account identity this ceremony will end up on. For a new account the row is not
    // written yet — it is created only if the ceremony verifies — so these are carried on the
    // challenge rather than read back from the database.
    let userId: string;
    let userName: string;
    let userDisplayName: string;
    let pendingUsername: string | null = null;
    let pendingDisplayName: string | null = null;

    if (session) {
      userId = session.user.id;
      userName = session.user.username;
      userDisplayName = session.user.displayName;
    } else {
      const username = normalizeUsername(body.username);
      const taken = await db.users.findOne({ where: { username } });
      if (taken) {
        return fail(
          409,
          `"${username}" is already registered. Sign in with that passkey, then add another from the dashboard.`,
        );
      }
      userId = randomUUID();
      userName = username;
      userDisplayName =
        typeof body.displayName === "string" && body.displayName.trim()
          ? body.displayName.trim()
          : username;
      pendingUsername = username;
      pendingDisplayName = userDisplayName;
    }

    const existing = await db.credentials.findMany({ where: { userId } });

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName,
      userDisplayName,
      // The user handle the authenticator stores alongside a discoverable credential. It comes
      // back as `userHandle` during usernameless sign-in, which is how we resolve the account
      // without being told who is signing in.
      userID: isoUint8Array.fromUTF8String(userId),
      attestationType: preferences.attestation,
      // Stops the same authenticator being enrolled twice for one account: the browser refuses
      // the ceremony instead of silently creating a second credential on the same key.
      excludeCredentials: existing.map((credential) => ({
        id: credential.id,
        transports: credentialTransports(credential) as AuthenticatorTransport[],
      })),
      authenticatorSelection: {
        residentKey: preferences.residentKey,
        userVerification: preferences.userVerification,
      },
      // Sets `hints: ["security-key"]` plus a cross-platform attachment, which is what makes
      // Chrome and Edge offer the YubiKey first instead of Windows Hello.
      ...(preferences.preferSecurityKey ? { preferredAuthenticatorType: "securityKey" as const } : {}),
    });

    await saveChallenge({
      kind: "registration",
      challenge: options.challenge,
      userId,
      requireUserVerification: preferences.userVerification === "required",
      pendingUsername,
      pendingDisplayName,
    });

    return NextResponse.json({ options, rp: { rpID, origin } });
  } catch (error) {
    return handleError(error);
  }
}
