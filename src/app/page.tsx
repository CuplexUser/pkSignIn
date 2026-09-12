import { redirect } from "next/navigation";
import { AuthPanel } from "@/components/auth/auth-panel";
import { CapabilityCard } from "@/components/capability-card";
import { RelyingPartyCard } from "@/components/relying-party-card";
import { currentSession } from "@/lib/session";

export default async function Home() {
  // Reading the session cookie makes this route dynamic, which is what we want: a cached
  // signed-out page would be served to a signed-in visitor.
  if (await currentSession()) redirect("/dashboard");

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Sign in with a security key</h1>
        <p className="text-muted-foreground text-sm">
          A WebAuthn demo built around a hardware authenticator. Register a YubiKey, sign in with
          it, and watch each step of the ceremony in the debug panel.
        </p>
      </div>

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <AuthPanel />
        <div className="min-w-0 space-y-4">
          <CapabilityCard />
          <RelyingPartyCard />
        </div>
      </div>
    </div>
  );
}
