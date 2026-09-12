import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { hashCode } from "@/lib/otp/recovery-codes";
import { createSession } from "@/lib/session";
import { assertNotThrottled, clearFailures, recordFailure, ThrottledError } from "@/lib/throttle";
import { fail, handleError, normalizeUsername } from "@/lib/webauthn/http";

/**
 * Signs in with a single-use recovery code — the way back into an account whose security key is
 * lost, and the reason passkey-only enrollment is not a one-way door.
 *
 * The resulting session is marked `recovery`, and the dashboard uses that to push the user to
 * enroll a replacement passkey immediately.
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

    const rejection = "That username and recovery code do not match.";
    if (!user) return fail(400, rejection);

    await assertNotThrottled("recovery", user.id);

    // Looked up by hash, so the stored value is never compared as a string and the query is an
    // index hit rather than a scan over the account's codes.
    const match = await db.recoveryCodes.findOne({
      where: { userId: user.id, codeHash: hashCode(code) },
    });

    if (!match || match.usedAt !== null) {
      // An already-spent code is treated exactly like a wrong one: saying "that code was already
      // used" would confirm to an attacker that they had guessed a real code.
      await recordFailure("recovery", user.id);
      return fail(400, rejection);
    }

    await clearFailures("recovery", user.id);
    await db.recoveryCodes.update(match.id, { usedAt: new Date() });
    await createSession(user.id, null, "recovery");

    const remaining = await db.recoveryCodes.count({
      where: { userId: user.id, usedAt: null },
    });

    return NextResponse.json({ ok: true, username: user.username, remaining });
  } catch (error) {
    if (error instanceof ThrottledError) return fail(429, error.message);
    return handleError(error);
  }
}
