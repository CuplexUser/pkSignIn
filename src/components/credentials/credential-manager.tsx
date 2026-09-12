"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { LogOut, Plus, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useDebug } from "@/components/debug/debug-provider";
import { PasskeyOptions } from "@/components/auth/passkey-options";
import { CredentialTable } from "./credential-table";
import { describeWebAuthnError, getJSON, postJSON } from "@/lib/client/api";
import { usePreferences } from "@/lib/client/use-preferences";
import type { CeremonyOutcome, CredentialView, MeResponse } from "@/lib/webauthn/api-types";

interface Props {
  initial: MeResponse;
}

export function CredentialManager({ initial }: Props) {
  const router = useRouter();
  const { log } = useDebug();
  const [preferences, updatePreferences] = usePreferences();
  const [credentials, setCredentials] = useState<CredentialView[]>(initial.credentials);
  const [busy, setBusy] = useState<"add" | "reload" | "signout" | null>(null);

  const reload = useCallback(async () => {
    setBusy("reload");
    try {
      const me = await getJSON<MeResponse | null>("/api/me");
      if (me) setCredentials(me.credentials);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reload.");
    } finally {
      setBusy(null);
    }
  }, []);

  /**
   * Registration again, but already signed in: the server ignores any username and attaches the
   * new credential to the current session's account. This is also the only way to enroll a
   * second key, since registering a taken username is refused.
   */
  async function addPasskey() {
    setBusy("add");
    try {
      const { options } = await postJSON<{ options: PublicKeyCredentialCreationOptionsJSON }>(
        "/api/webauthn/register/options",
        { preferences },
      );
      log({
        ceremony: "registration",
        phase: "options",
        label: "generateRegistrationOptions (add)",
        payload: options,
      });

      const response = await startRegistration({ optionsJSON: options });
      log({
        ceremony: "registration",
        phase: "authenticator",
        label: "navigator.credentials.create()",
        payload: response,
      });

      const result = await postJSON<{ outcome: CeremonyOutcome }>(
        "/api/webauthn/register/verify",
        response,
      );
      log({
        ceremony: "registration",
        phase: "verified",
        label: result.outcome.authenticatorName ?? "Passkey added",
        payload: result.outcome,
      });

      toast.success("Passkey added", {
        description: result.outcome.authenticatorName ?? undefined,
      });
      await reload();
    } catch (error) {
      const message = describeWebAuthnError(error);
      log({
        ceremony: "registration",
        phase: "error",
        label: message,
        payload: {
          name: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
        },
      });
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  async function signOut() {
    setBusy("signout");
    try {
      await postJSON("/api/signout");
      router.refresh();
      router.push("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sign out failed.");
      setBusy(null);
    }
  }

  return (
    <div className="min-w-0 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="truncate">{initial.displayName}</CardTitle>
          <CardDescription className="truncate">
            signed in as <span className="font-mono">{initial.username}</span>
          </CardDescription>
          <CardAction>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void signOut()}
              disabled={busy !== null}
            >
              <LogOut className="size-3.5" />
              Sign out
            </Button>
          </CardAction>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Passkeys
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {credentials.length}
            </span>
          </CardTitle>
          <CardDescription>
            Every credential registered to this account, as the authenticator described it.
          </CardDescription>
          <CardAction className="flex flex-wrap justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void reload()}
              disabled={busy !== null}
              aria-label="Reload passkeys"
            >
              <RefreshCw className={busy === "reload" ? "size-3.5 animate-spin" : "size-3.5"} />
            </Button>
            <Button size="sm" onClick={() => void addPasskey()} disabled={busy !== null}>
              <Plus className="size-3.5" />
              {busy === "add" ? "Waiting…" : "Add a passkey"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="space-y-4">
          <PasskeyOptions
            preferences={preferences}
            onChange={updatePreferences}
            variant="registration"
          />
          <CredentialTable credentials={credentials} onChanged={() => void reload()} />
        </CardContent>
      </Card>
    </div>
  );
}
