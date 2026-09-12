"use client";

import { useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDebug } from "@/components/debug/debug-provider";
import { PasskeyOptions } from "./passkey-options";
import { describeWebAuthnError, postJSON } from "@/lib/client/api";
import type { CeremonyOutcome } from "@/lib/webauthn/api-types";
import type { CeremonyPreferences } from "@/lib/webauthn/preferences";

interface Props {
  preferences: CeremonyPreferences;
  onPreferencesChange: (patch: Partial<CeremonyPreferences>) => void;
  onSuccess: (username: string, outcome: CeremonyOutcome) => void;
  onError: (message: string) => void;
}

export function RegisterForm({ preferences, onPreferencesChange, onSuccess, onError }: Props) {
  const { log } = useDebug();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);

  async function register(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);

    try {
      const { options } = await postJSON<{ options: PublicKeyCredentialCreationOptionsJSON }>(
        "/api/webauthn/register/options",
        { username, displayName, preferences },
      );
      log({
        ceremony: "registration",
        phase: "options",
        label: "generateRegistrationOptions",
        payload: options,
      });

      // Hands the options to the browser, which drives the authenticator. Everything
      // interesting — the prompt, the touch, the PIN — happens inside this call.
      const response = await startRegistration({ optionsJSON: options });
      log({
        ceremony: "registration",
        phase: "authenticator",
        label: "navigator.credentials.create()",
        payload: response,
      });

      const result = await postJSON<{ outcome: CeremonyOutcome; username: string }>(
        "/api/webauthn/register/verify",
        response,
      );
      log({
        ceremony: "registration",
        phase: "verified",
        label: result.outcome.authenticatorName ?? "Passkey registered",
        payload: result.outcome,
      });

      onSuccess(result.username, result.outcome);
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
      onError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={register} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="register-username">Username</Label>
        <Input
          id="register-username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          placeholder="alice"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          minLength={3}
          maxLength={32}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="register-display-name">
          Display name <span className="text-muted-foreground text-xs">(optional)</span>
        </Label>
        <Input
          id="register-display-name"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          placeholder="Alice Example"
          autoComplete="name"
          maxLength={64}
        />
      </div>

      <PasskeyOptions
        preferences={preferences}
        onChange={onPreferencesChange}
        variant="registration"
      />

      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Waiting for your key…" : "Create a passkey"}
      </Button>

      <p className="text-muted-foreground text-xs">
        Insert your YubiKey and touch it when it blinks. On Android, hold it against the back of
        the phone.
      </p>
    </form>
  );
}
