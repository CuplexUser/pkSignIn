import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import type { Challenge } from "@/lib/db/schema";

const COOKIE = "pk_challenge";
const TTL_MS = 5 * 60 * 1000;

export type ChallengeKind = "registration" | "authentication";

/** A ceremony failed for a reason the user can act on, rather than a bug. */
export class CeremonyError extends Error {}

function cookieOptions(maxAgeSeconds: number) {
  return {
    httpOnly: true,
    sameSite: "strict" as const,
    // Must be false over plain http, or localhost development cannot set the cookie at all.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

/**
 * Stores the challenge server-side and hands the browser nothing but an opaque row id.
 *
 * The challenge is the only thing stopping a replayed or attacker-chosen assertion, so it can
 * never make a round trip through the client: a caller that supplies its own challenge at
 * verification time can satisfy it with a signature it already has.
 */
export interface SaveChallenge {
  kind: ChallengeKind;
  challenge: string;
  /** The account this ceremony is for; null for a discoverable sign-in. */
  userId?: string | null;
  requireUserVerification?: boolean;
  /** Set only when this registration will create the account on success. */
  pendingUsername?: string | null;
  pendingDisplayName?: string | null;
}

export async function saveChallenge({
  kind,
  challenge,
  userId = null,
  requireUserVerification = false,
  pendingUsername = null,
  pendingDisplayName = null,
}: SaveChallenge): Promise<void> {
  const db = await getDb();

  // Opportunistic sweep. Abandoned ceremonies are normal — the user closes the dialog, or
  // never touches the key — and nothing else would ever remove those rows.
  await db.challenges.deleteMany({
    where: [{ field: "expiresAt", op: "lt", value: new Date() }],
  });

  const id = randomUUID();
  await db.challenges.create({
    id,
    challenge,
    kind,
    userId,
    requireUserVerification,
    pendingUsername,
    pendingDisplayName,
    expiresAt: new Date(Date.now() + TTL_MS),
  });

  (await cookies()).set(COOKIE, id, cookieOptions(TTL_MS / 1000));
}

/**
 * Reads the pending challenge and consumes it. Single use is the point: the row is deleted
 * whether or not verification then succeeds, so a captured response cannot be replayed.
 */
export async function takeChallenge(kind: ChallengeKind): Promise<Challenge> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  jar.delete(COOKIE);

  if (!id) {
    throw new CeremonyError(
      "No ceremony in progress. Request options before verifying — and check that cookies are not blocked.",
    );
  }

  const db = await getDb();
  const row = await db.challenges.findById(id);
  if (row) await db.challenges.delete(id);

  if (!row) throw new CeremonyError("This challenge has already been used. Start again.");
  if (row.kind !== kind) {
    throw new CeremonyError(`Challenge was issued for ${row.kind}, not ${kind}.`);
  }
  if (row.expiresAt.getTime() < Date.now()) {
    throw new CeremonyError("The challenge expired. Start again.");
  }

  return row;
}
