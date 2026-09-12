import { NextResponse } from "next/server";
import { getDb, type Db } from "@/lib/db";
import type { Credential } from "@/lib/db/schema";
import { currentSession, type CurrentSession } from "@/lib/session";
import { fail, handleError, toCredentialView } from "@/lib/webauthn/http";

type Owned =
  | { error: NextResponse; db: null; session: null; credential: null }
  | { error: null; db: Db; session: CurrentSession; credential: Credential };

/**
 * Every credential route re-reads the session and checks ownership. The credential ID travels
 * in the URL, so without this check any signed-in user could rename or delete anyone's passkey
 * by guessing one.
 */
async function ownedCredential(id: string): Promise<Owned> {
  const session = await currentSession();
  if (!session) {
    return { error: fail(401, "Sign in first."), db: null, session: null, credential: null };
  }

  const db = await getDb();
  const credential = await db.credentials.findById(id);
  if (!credential || credential.userId !== session.user.id) {
    // Deliberately the same answer as a credential that does not exist: confirming that
    // someone else's ID is real would leak it.
    return { error: fail(404, "No such passkey."), db: null, session: null, credential: null };
  }

  return { error: null, db, session, credential };
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/credentials/[id]">) {
  try {
    const { id } = await ctx.params;
    const owned = await ownedCredential(id);
    if (owned.error) return owned.error;

    const body = (await request.json().catch(() => ({}))) as { nickname?: unknown };
    const raw = typeof body.nickname === "string" ? body.nickname.trim() : "";
    if (raw.length > 60) return fail(400, "Name must be 60 characters or fewer.");

    const updated = await owned.db.credentials.update(id, { nickname: raw === "" ? null : raw });

    return NextResponse.json(toCredentialView(updated, owned.session.session.credentialId));
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(_request: Request, ctx: RouteContext<"/api/credentials/[id]">) {
  try {
    const { id } = await ctx.params;
    const owned = await ownedCredential(id);
    if (owned.error) return owned.error;

    await owned.db.credentials.delete(id);

    const remaining = await owned.db.credentials.count({
      where: { userId: owned.session.user.id },
    });

    return NextResponse.json({ ok: true, remaining });
  } catch (error) {
    return handleError(error);
  }
}
