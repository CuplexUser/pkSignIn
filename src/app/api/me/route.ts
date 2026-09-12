import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { recoveryStatus, totpStatus } from "@/lib/otp/service";
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
      totp: await totpStatus(session.user.id),
      recovery: await recoveryStatus(session.user.id),
      viaRecovery: session.session.method === "recovery",
    };

    return NextResponse.json(body);
  } catch (error) {
    return handleError(error);
  }
}
