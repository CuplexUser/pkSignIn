import { NextResponse } from "next/server";
import { encryptSecret } from "@/lib/crypto/secret-box";
import { getDb } from "@/lib/db";
import { qrSvg } from "@/lib/otp/qr";
import { generateSecret, otpauthUri, totpDefaults } from "@/lib/otp/totp";
import { currentSession } from "@/lib/session";
import { fail, handleError } from "@/lib/webauthn/http";
import { RP_NAME } from "@/lib/webauthn/rp";
import type { TotpEnrollResponse } from "@/lib/webauthn/api-types";

/**
 * Starts TOTP enrollment: mints a secret, stores it unconfirmed, and returns the QR code.
 *
 * Enrollment requires an existing session, so the passkey is what authorizes adding a second way
 * in. Letting this be called unauthenticated would turn TOTP into a way to attach yourself to
 * someone else's account.
 */
export async function POST() {
  try {
    const session = await currentSession();
    if (!session) return fail(401, "Sign in first.");

    const db = await getDb();
    const existing = await db.totp.findById(session.user.id);
    if (existing?.confirmedAt) {
      return fail(
        409,
        "An authenticator app is already set up. Remove it first if you want to enroll a new one.",
      );
    }

    const secret = generateSecret();
    const uri = otpauthUri({
      secret,
      accountName: session.user.username,
      issuer: RP_NAME,
      options: totpDefaults,
    });

    const record = {
      secret: encryptSecret(secret),
      digits: totpDefaults.digits,
      period: totpDefaults.period,
      algorithm: totpDefaults.algorithm,
      confirmedAt: null,
      lastUsedStep: null,
    };

    // Re-enrolling before confirming replaces the pending secret rather than stacking up rows.
    if (existing) {
      await db.totp.update(session.user.id, record);
    } else {
      await db.totp.create({ id: session.user.id, ...record });
    }

    const body: TotpEnrollResponse = { secret, otpauthUri: uri, qrSvg: qrSvg(uri) };
    return NextResponse.json(body);
  } catch (error) {
    return handleError(error);
  }
}

/** Removes the enrollment, pending or confirmed. */
export async function DELETE() {
  try {
    const session = await currentSession();
    if (!session) return fail(401, "Sign in first.");

    const db = await getDb();
    if (await db.totp.findById(session.user.id)) {
      await db.totp.delete(session.user.id);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error);
  }
}
