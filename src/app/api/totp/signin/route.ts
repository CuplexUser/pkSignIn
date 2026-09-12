import { NextResponse } from "next/server";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { getDb } from "@/lib/db";
import { optionsFor } from "@/lib/otp/service";
import { verifyTotp } from "@/lib/otp/totp";
import { createSession } from "@/lib/session";
import { assertNotThrottled, clearFailures, recordFailure, ThrottledError } from "@/lib/throttle";
import { fail, handleError, normalizeUsername } from "@/lib/webauthn/http";

/**
 * Signs in with a TOTP code instead of a passkey — the route for when the security key is not to
 * hand. It is deliberately a peer of the passkey flow rather than a step in it: a passkey already
 * proves possession and (with a PIN) knowledge, so stacking a code on top adds friction without
 * adding much.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      username?: unknown;
      code?: unknown;
    };
    const username = normalizeUsername(body.username);
    const code = typeof body.code === "string" ? body.code : "";

    const db = await getDb();
    const user = await db.users.findOne({ where: { username } });

    /**
     * One message for "no such account", "no authenticator enrolled" and "wrong code". Telling
     * them apart would turn this endpoint into an oracle for which usernames exist and which have
     * TOTP set up.
     */
    const rejection = "That username and code do not match.";

    if (!user) return fail(400, rejection);

    await assertNotThrottled("totp", user.id);

    const enrollment = await db.totp.findById(user.id);
    if (!enrollment?.confirmedAt) {
      await recordFailure("totp", user.id);
      return fail(400, rejection);
    }

    const result = verifyTotp(decryptSecret(enrollment.secret), code, {
      options: optionsFor(enrollment),
      // Refuses a code from a step already spent, so one observed over a shoulder cannot be
      // replayed inside the ~90 second window it stays otherwise valid.
      notBeforeStep: enrollment.lastUsedStep ? BigInt(enrollment.lastUsedStep) : null,
    });

    if (!result.valid) {
      await recordFailure("totp", user.id);
      return fail(400, rejection);
    }

    await clearFailures("totp", user.id);
    await db.totp.update(user.id, { lastUsedStep: result.step?.toString() ?? null });
    await createSession(user.id, null, "totp");

    return NextResponse.json({ ok: true, username: user.username });
  } catch (error) {
    if (error instanceof ThrottledError) return fail(429, error.message);
    return handleError(error);
  }
}
