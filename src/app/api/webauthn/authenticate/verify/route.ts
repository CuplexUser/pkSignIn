import { NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON, AuthenticatorTransport } from "@simplewebauthn/server";
import { authenticatorName } from "@/lib/aaguid/lookup";
import { getDb } from "@/lib/db";
import { credentialTransports } from "@/lib/db/schema";
import { createSession } from "@/lib/session";
import { CeremonyError, takeChallenge } from "@/lib/webauthn/challenge";
import { fail, handleError } from "@/lib/webauthn/http";
import { relyingParty } from "@/lib/webauthn/rp";
import type { CeremonyOutcome } from "@/lib/webauthn/api-types";

export async function POST(request: Request) {
  try {
    const response = (await request.json()) as AuthenticationResponseJSON;
    const { rpID, origin } = await relyingParty();

    const pending = await takeChallenge("authentication");
    const db = await getDb();

    const credential = await db.credentials.findById(response.id);
    if (!credential) {
      throw new CeremonyError(
        "That passkey is not registered here. It may have been deleted, or created against a different host.",
      );
    }

    /**
     * A username-led ceremony must only be satisfiable by that account's credentials. Without
     * this check a valid assertion from any registered key would pass, letting a caller sign in
     * as someone else by asking for their challenge and answering with their own passkey.
     */
    if (pending.userId && pending.userId !== credential.userId) {
      throw new CeremonyError("That passkey does not belong to the account being signed in to.");
    }

    // For the usernameless flow the authenticator tells us who it is: userHandle is the user ID
    // we stored at registration.
    if (!pending.userId && response.response.userHandle) {
      const handle = isoBase64URL.toUTF8String(response.response.userHandle);
      if (handle !== credential.userId) {
        throw new CeremonyError("The passkey's user handle does not match its stored account.");
      }
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: pending.requireUserVerification,
      credential: {
        id: credential.id,
        publicKey: isoBase64URL.toBuffer(credential.publicKey),
        counter: credential.counter,
        transports: credentialTransports(credential) as AuthenticatorTransport[],
      },
    });

    if (!verification.verified) {
      return fail(400, "Sign-in could not be verified.");
    }

    // SimpleWebAuthn already rejects a counter that failed to advance (its clone check), so this
    // only has to persist the new value. Many passkeys, including most synced ones, always
    // report 0 and so never move.
    const { newCounter, userVerified } = verification.authenticationInfo;
    await db.credentials.update(credential.id, {
      counter: newCounter,
      lastUsedAt: new Date(),
    });

    const user = await db.users.findById(credential.userId);
    if (!user) throw new CeremonyError("The account for this passkey no longer exists.");

    await createSession(user.id, credential.id);

    const outcome: CeremonyOutcome = {
      verified: true,
      credentialId: credential.id,
      userVerified,
      credentialDeviceType: credential.deviceType,
      credentialBackedUp: credential.backedUp,
      fmt: credential.fmt,
      aaguid: credential.aaguid,
      authenticatorName: authenticatorName(credential.aaguid),
      discoverable: credential.discoverable,
      transports: credentialTransports(credential),
      counter: newCounter,
      rpID,
      origin,
    };

    return NextResponse.json({ outcome, username: user.username });
  } catch (error) {
    return handleError(error);
  }
}
