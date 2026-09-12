import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { relyingParty } from "@/lib/webauthn/rp";

/**
 * Shows the RP ID and origin this request resolved to. Worth surfacing rather than hiding in a
 * log: a credential is bound to its RP ID, so when a passkey registered on one host refuses to
 * work on another, these two values are the explanation.
 */
export async function RelyingPartyCard() {
  const { rpID, origin, rpName } = await relyingParty();
  const local = rpID === "localhost" || rpID === "127.0.0.1";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Relying party</CardTitle>
        <CardDescription>Derived from this request, not hardcoded.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1">
          <span className="text-muted-foreground">name</span>
          <span className="truncate">{rpName}</span>
          <span className="text-muted-foreground">rpID</span>
          <span className="truncate font-mono text-xs">{rpID}</span>
          <span className="text-muted-foreground">origin</span>
          <span className="truncate font-mono text-xs">{origin}</span>
        </div>

        <p className="text-muted-foreground border-t pt-2 text-xs">
          {local
            ? "localhost is exempt from the HTTPS requirement, so a USB key works here directly. A phone cannot use this origin — it needs a real HTTPS host, which is what the Vercel deployment is for."
            : "Passkeys registered here are bound to this exact rpID. A different host means starting over."}
        </p>
      </CardContent>
    </Card>
  );
}
