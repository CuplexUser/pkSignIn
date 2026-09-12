import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { currentSession } from "@/lib/session";
import { handleError, toCredentialView } from "@/lib/webauthn/http";
import type { MeResponse } from "@/lib/webauthn/api-types";

export async function GET() {
  try {
    const session = await currentSession();
    if (!session) return NextResponse.json(null);

    const db = await getDb();
    const credentials = await db.credentials.findMany({
      where: { userId: session.user.id },
      orderBy: [{ field: "createdAt", direction: "asc" }],
    });

    const body: MeResponse = {
      username: session.user.username,
      displayName: session.user.displayName,
      credentials: credentials.map((credential) =>
        toCredentialView(credential, session.session.credentialId),
      ),
    };

    return NextResponse.json(body);
  } catch (error) {
    return handleError(error);
  }
}
