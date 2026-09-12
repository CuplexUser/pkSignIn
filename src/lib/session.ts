import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "@/lib/db";
import type { Session, User } from "@/lib/db/schema";

const COOKIE = "pk_session";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Sessions are rows, not signed cookies. The cookie carries a 256-bit random token and
 * nothing else, which keeps sign-out real (deleting the row ends the session everywhere)
 * and means a stolen cookie can be revoked.
 */
export async function createSession(userId: string, credentialId: string): Promise<void> {
  const db = await getDb();

  const id = randomBytes(32).toString("base64url");
  await db.sessions.create({
    id,
    userId,
    credentialId,
    expiresAt: new Date(Date.now() + TTL_MS),
  });

  (await cookies()).set(COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TTL_MS / 1000,
  });
}

export interface CurrentSession {
  session: Session;
  user: User;
}

export async function currentSession(): Promise<CurrentSession | null> {
  const id = (await cookies()).get(COOKIE)?.value;
  if (!id) return null;

  const db = await getDb();
  const session = await db.sessions.findById(id);
  if (!session) return null;

  if (session.expiresAt.getTime() < Date.now()) {
    await db.sessions.delete(session.id);
    return null;
  }

  const user = await db.users.findById(session.userId);
  if (!user) return null;

  return { session, user };
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  jar.delete(COOKIE);
  if (!id) return;

  const db = await getDb();
  const session = await db.sessions.findById(id);
  if (session) await db.sessions.delete(id);
}
