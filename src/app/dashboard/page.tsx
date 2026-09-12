import { redirect } from "next/navigation";
import { CapabilityCard } from "@/components/capability-card";
import { CredentialManager } from "@/components/credentials/credential-manager";
import { RelyingPartyCard } from "@/components/relying-party-card";
import { getDb } from "@/lib/db";
import { currentSession } from "@/lib/session";
import { toCredentialView } from "@/lib/webauthn/http";
import type { MeResponse } from "@/lib/webauthn/api-types";

export default async function Dashboard() {
  const session = await currentSession();
  if (!session) redirect("/");

  const db = await getDb();
  const credentials = await db.credentials.findMany({
    where: { userId: session.user.id },
    orderBy: [{ field: "createdAt", direction: "asc" }],
  });

  // Rendered on the server so the table is populated on first paint rather than after a fetch.
  const initial: MeResponse = {
    username: session.user.username,
    displayName: session.user.displayName,
    credentials: credentials.map((credential) =>
      toCredentialView(credential, session.session.credentialId),
    ),
  };

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <CredentialManager initial={initial} />
      <div className="min-w-0 space-y-4">
        <CapabilityCard />
        <RelyingPartyCard />
      </div>
    </div>
  );
}
