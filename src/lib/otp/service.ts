import { getDb } from "@/lib/db";
import type { TotpEnrollment } from "@/lib/db/schema";
import type { RecoveryStatus, TotpStatus } from "@/lib/webauthn/api-types";
import { totpDefaults, type TotpAlgorithm, type TotpOptions } from "./totp";

/** Reads the stored per-enrollment parameters back into the shape the verifier wants. */
export function optionsFor(enrollment: TotpEnrollment): TotpOptions {
  return {
    digits: enrollment.digits,
    period: enrollment.period,
    algorithm: enrollment.algorithm as TotpAlgorithm,
  };
}

export async function totpStatus(userId: string): Promise<TotpStatus> {
  const db = await getDb();
  const row = await db.totp.findById(userId);

  if (!row) {
    return {
      enrolled: false,
      pending: false,
      confirmedAt: null,
      ...totpDefaults,
    };
  }

  return {
    enrolled: row.confirmedAt !== null,
    pending: row.confirmedAt === null,
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
    digits: row.digits,
    period: row.period,
    algorithm: row.algorithm,
  };
}

export async function recoveryStatus(userId: string): Promise<RecoveryStatus> {
  const db = await getDb();
  const codes = await db.recoveryCodes.findMany({
    where: { userId },
    orderBy: [{ field: "createdAt", direction: "asc" }],
  });

  return {
    total: codes.length,
    remaining: codes.filter((code) => code.usedAt === null).length,
    generatedAt: codes[0]?.createdAt.toISOString() ?? null,
  };
}
