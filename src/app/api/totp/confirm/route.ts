import { NextResponse } from "next/server";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { getDb } from "@/lib/db";
import { optionsFor, totpStatus } from "@/lib/otp/service";
import { verifyTotp } from "@/lib/otp/totp";
import { currentSession } from "@/lib/session";
import { assertNotThrottled, clearFailures, recordFailure, ThrottledError } from "@/lib/throttle";
import { fail, handleError } from "@/lib/webauthn/http";

/**
 * Finishes enrollment by proving the authenticator app is actually synced.
 *
 * Without this step an account could end up holding a secret the user never successfully
 * scanned, leaving them with a second factor that cannot produce a working code.
 */
export async function POST(request: Request) {
  try {
    const session = await currentSession();
    if (!session) return fail(401, "Sign in first.");

    const body = (await request.json().catch(() => ({}))) as { code?: unknown };
    const code = typeof body.code === "string" ? body.code : "";

    const db = await getDb();
    const enrollment = await db.totp.findById(session.user.id);
    if (!enrollment) return fail(404, "Start enrollment first.");
    if (enrollment.confirmedAt) return fail(409, "This authenticator app is already confirmed.");

    await assertNotThrottled("totp", session.user.id);

    const result = verifyTotp(decryptSecret(enrollment.secret), code, {
      options: optionsFor(enrollment),
    });

    if (!result.valid) {
      await recordFailure("totp", session.user.id);
      return fail(400, "That code is not right. Check the clock on your phone and try again.");
    }

    await clearFailures("totp", session.user.id);
    await db.totp.update(session.user.id, {
      confirmedAt: new Date(),
      // The confirming code is spent, so it cannot immediately be reused to sign in.
      lastUsedStep: result.step?.toString() ?? null,
    });

    return NextResponse.json({ ok: true, totp: await totpStatus(session.user.id) });
  } catch (error) {
    if (error instanceof ThrottledError) return fail(429, error.message);
    return handleError(error);
  }
}
