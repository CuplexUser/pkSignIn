import { NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import type { AuthenticatorTransport } from "@simplewebauthn/server";
import { getDb } from "@/lib/db";
import { credentialTransports } from "@/lib/db/schema";
import { saveChallenge } from "@/lib/webauthn/challenge";
import { fail, handleError, normalizeUsername } from "@/lib/webauthn/http";
import { parsePreferences } from "@/lib/webauthn/preferences";
import { relyingParty } from "@/lib/webauthn/rp";
import type { OptionsRequest } from "@/lib/webauthn/api-types";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as OptionsRequest;
    const preferences = parsePreferences(body.preferences);
    const { rpID, origin } = await relyingParty();
    const db = await getDb();

    /**
     * Omitting the username is the usernameless (discoverable credential) flow: we send an
     * empty allowCredentials and the authenticator decides which identity to offer from the
     * resident keys it holds for this RP ID. Sending a username instead narrows the ceremony to
     * that account's credentials, which is what lets a non-discoverable key work at all.
     */
    let userId: string | null = null;
    let allowCredentials: { id: string; transports?: AuthenticatorTransport[] }[] = [];

    if (body.username !== undefined && body.username !== "") {
      const username = normalizeUsername(body.username);
      const user = await db.users.findOne({ where: { username } });
      if (!user) {
        return fail(404, `No account named "${username}".`);
      }

      const credentials = await db.credentials.findMany({ where: { userId: user.id } });
      if (credentials.length === 0) {
        return fail(400, `"${username}" has no passkeys registered.`);
      }

      userId = user.id;
      allowCredentials = credentials.map((credential) => ({
        id: credential.id,
        transports: credentialTransports(credential) as AuthenticatorTransport[],
      }));
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: preferences.userVerification,
    });

    await saveChallenge({
      kind: "authentication",
      challenge: options.challenge,
      userId,
      requireUserVerification: preferences.userVerification === "required",
    });

    return NextResponse.json({
      options,
      rp: { rpID, origin },
      discoverable: userId === null,
    });
  } catch (error) {
    return handleError(error);
  }
}
