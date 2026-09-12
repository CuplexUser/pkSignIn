"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePreferences } from "@/lib/client/use-preferences";
import type { CeremonyOutcome } from "@/lib/webauthn/api-types";
import { RegisterForm } from "./register-form";
import { SignInForm } from "./sign-in-form";

export function AuthPanel() {
  const router = useRouter();
  const [preferences, updatePreferences] = usePreferences();
  const [tab, setTab] = useState("signin");

  function onSuccess(username: string, outcome: CeremonyOutcome) {
    toast.success(`Signed in as ${username}`, {
      description: outcome.authenticatorName ?? "Passkey verified",
    });
    // refresh() re-runs the server component that reads the session cookie, so the dashboard
    // renders with the new session rather than the stale signed-out tree.
    router.refresh();
    router.push("/dashboard");
  }

  function onCodeSuccess(username: string, mode: "totp" | "recovery", remaining?: number) {
    toast.success(`Signed in as ${username}`, {
      description:
        mode === "recovery"
          ? `Recovery code accepted${typeof remaining === "number" ? ` — ${remaining} left` : ""}. Enroll a new passkey now.`
          : "Authenticator app code accepted",
    });
    router.refresh();
    router.push("/dashboard");
  }

  function onError(message: string) {
    toast.error(message);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Passkey sign-in</CardTitle>
        <CardDescription>
          Authenticate with a hardware security key — no password anywhere in the flow.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-4 grid w-full grid-cols-2">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="register">Register</TabsTrigger>
          </TabsList>

          <TabsContent value="signin">
            <SignInForm
              preferences={preferences}
              onPreferencesChange={updatePreferences}
              onSuccess={onSuccess}
              onError={onError}
              onCodeSuccess={onCodeSuccess}
            />
          </TabsContent>

          <TabsContent value="register">
            <RegisterForm
              preferences={preferences}
              onPreferencesChange={updatePreferences}
              onSuccess={onSuccess}
              onError={onError}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
