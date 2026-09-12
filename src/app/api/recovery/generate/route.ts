import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateCodes, hashCode } from "@/lib/otp/recovery-codes";
import { currentSession } from "@/lib/session";
import { fail, handleError } from "@/lib/webauthn/http";
import type { RecoveryGenerateResponse } from "@/lib/webauthn/api-types";

/**
 * Issues a fresh set of recovery codes, replacing any that exist.
 *
 * Replacing rather than appending is the safe behavior: if a user regenerates because they think
 * an old list leaked, leaving the old codes valid would defeat the point. The plaintext is
 * returned exactly once — only hashes are stored, so it cannot be shown again afterwards.
 */
export async function POST() {
  try {
    const session = await currentSession();
    if (!session) return fail(401, "Sign in first.");

    const db = await getDb();
    const codes = generateCodes();
    const generatedAt = new Date();

    // One transaction: a partial write here would leave the account with some old codes revoked
    // and some new ones missing, which is worse than either outcome alone.
    await db.recoveryCodes.withTransaction(async (tx) => {
      await tx.deleteMany({ where: { userId: session.user.id } });
      await tx.createMany(
        codes.map((code) => ({
          userId: session.user.id,
          codeHash: hashCode(code),
          usedAt: null,
        })),
      );
    });

    const body: RecoveryGenerateResponse = {
      codes,
      generatedAt: generatedAt.toISOString(),
    };
    return NextResponse.json(body);
  } catch (error) {
    return handleError(error);
  }
}
