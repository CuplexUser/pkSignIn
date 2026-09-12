import { NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { UniqueConstraintError } from "repolayer";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { authenticatorName } from "@/lib/aaguid/lookup";
import { getDb } from "@/lib/db";
import { createSession } from "@/lib/session";
import { CeremonyError, takeChallenge } from "@/lib/webauthn/challenge";
import { fail, handleError } from "@/lib/webauthn/http";
import { relyingParty } from "@/lib/webauthn/rp";
import type { CeremonyOutcome } from "@/lib/webauthn/api-types";

export async function POST(request: Request) {
  try {
    const response = (await request.json()) as RegistrationResponseJSON;
    const { rpID, origin } = await relyingParty();

    const pending = await takeChallenge("registration");
    if (!pending.userId) throw new CeremonyError("Registration challenge has no user attached.");

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: pending.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      // Enforces the policy the options asked for, read back from the challenge rather than
      // from the request body, which the client controls.
      requireUserVerification: pending.requireUserVerification,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return fail(400, "Registration could not be verified.");
    }

    const { credential, aaguid, fmt, userVerified, credentialDeviceType, credentialBackedUp } =
      verification.registrationInfo;

    const db = await getDb();

    /**
     * The account is created here, not when the options were issued, so an abandoned ceremony
     * leaves no half-made account behind and does not reserve the username.
     */
    let user;
    if (pending.pendingUsername) {
      try {
        user = await db.users.create({
          id: pending.userId,
          username: pending.pendingUsername,
          displayName: pending.pendingDisplayName ?? pending.pendingUsername,
        });
      } catch (error) {
        // Someone else completed registration for this username while this ceremony was open.
        if (error instanceof UniqueConstraintError) {
          throw new CeremonyError(
            `"${pending.pendingUsername}" was registered by someone else while you were enrolling. Pick another username.`,
          );
        }
        throw error;
      }
    } else {
      user = await db.users.findById(pending.userId);
      if (!user) throw new CeremonyError("The account this registration belongs to is gone.");
    }

    // credProps tells us whether the authenticator actually made the credential discoverable.
    // With residentKey "preferred" the answer genuinely varies by device, and it decides
    // whether usernameless sign-in will find this key later.
    const discoverable = response.clientExtensionResults?.credProps?.rk ?? false;
    const transports = credential.transports ?? [];

    await db.credentials.create({
      id: credential.id,
      userId: user.id,
      // repolayer has no binary field type, so the COSE key is stored base64url.
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      transports,
      aaguid,
      fmt,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      userVerified,
      discoverable,
      nickname: null,
      lastUsedAt: null,
    });

    // Registering proves possession of the key, so it signs you in.
    await createSession(user.id, credential.id);

    const outcome: CeremonyOutcome = {
      verified: true,
      credentialId: credential.id,
      userVerified,
      credentialDeviceType,
      credentialBackedUp,
      fmt,
      aaguid,
      authenticatorName: authenticatorName(aaguid),
      discoverable,
      transports,
      counter: credential.counter,
      rpID,
      origin,
    };

    return NextResponse.json({ outcome, username: user.username });
  } catch (error) {
    return handleError(error);
  }
}
