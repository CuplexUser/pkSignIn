import { getDb } from "@/lib/db";

/**
 * Per-account attempt limiting for the code-based sign-in routes.
 *
 * A six-digit TOTP is one in a million and stays valid for roughly ninety seconds, so an
 * unthrottled endpoint is brute-forceable in minutes. This is what makes accepting a short code
 * defensible at all. The passkey routes deliberately do not use it: a signature cannot be
 * guessed, so rate limiting there would only be a denial-of-service lever.
 */

const MAX_FAILURES = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
/** Counters older than this are treated as stale rather than accumulating forever. */
const WINDOW_MS = 60 * 60 * 1000;

export type ThrottlePurpose = "totp" | "recovery";

export class ThrottledError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    const minutes = Math.ceil(retryAfterSeconds / 60);
    super(`Too many incorrect codes. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`);
  }
}

function keyFor(purpose: ThrottlePurpose, userId: string): string {
  return `${purpose}:${userId}`;
}

/** Throws `ThrottledError` when the account is locked out. Call before checking a code. */
export async function assertNotThrottled(
  purpose: ThrottlePurpose,
  userId: string,
): Promise<void> {
  const db = await getDb();
  const row = await db.throttles.findById(keyFor(purpose, userId));
  if (!row?.lockedUntil) return;

  const remaining = row.lockedUntil.getTime() - Date.now();
  if (remaining > 0) throw new ThrottledError(Math.ceil(remaining / 1000));

  // The lock has expired; clear it so the next failure starts a fresh count.
  await db.throttles.update(row.id, { failures: 0, lockedUntil: null });
}

export async function recordFailure(
  purpose: ThrottlePurpose,
  userId: string,
): Promise<void> {
  const db = await getDb();
  const id = keyFor(purpose, userId);
  const row = await db.throttles.findById(id);

  const stale = row ? Date.now() - row.updatedAt.getTime() > WINDOW_MS : false;
  const failures = (stale || !row ? 0 : row.failures) + 1;
  const lockedUntil = failures >= MAX_FAILURES ? new Date(Date.now() + LOCKOUT_MS) : null;

  if (row) {
    await db.throttles.update(id, { failures, lockedUntil });
  } else {
    await db.throttles.create({ id, failures, lockedUntil });
  }
}

/** Clears the counter after a code is accepted, so a typo earlier does not linger. */
export async function clearFailures(
  purpose: ThrottlePurpose,
  userId: string,
): Promise<void> {
  const db = await getDb();
  const id = keyFor(purpose, userId);
  if (await db.throttles.findById(id)) {
    await db.throttles.update(id, { failures: 0, lockedUntil: null });
  }
}
