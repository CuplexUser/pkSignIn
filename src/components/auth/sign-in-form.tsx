"use client";

import { useEffect, useRef, useState } from "react";
import {
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  WebAuthnAbortService,
} from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useDebug } from "@/components/debug/debug-provider";
import { CodeSignIn } from "./code-sign-in";
import { PasskeyOptions } from "./passkey-options";
import { describeWebAuthnError, postJSON } from "@/lib/client/api";
import type { CeremonyOutcome } from "@/lib/webauthn/api-types";
import type { CeremonyPreferences } from "@/lib/webauthn/preferences";

interface Props {
  preferences: CeremonyPreferences;
  onPreferencesChange: (patch: Partial<CeremonyPreferences>) => void;
  onSuccess: (username: string, outcome: CeremonyOutcome) => void;
  onError: (message: string) => void;
  /** Sign-in that did not involve a passkey, so there is no ceremony outcome to report. */
  onCodeSuccess: (username: string, mode: "totp" | "recovery", remaining?: number) => void;
}

type Mode = "username" | "discoverable";

export function SignInForm({
  preferences,
  onPreferencesChange,
  onSuccess,
  onError,
  onCodeSuccess,
}: Props) {
  const { log } = useDebug();
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState<Mode | null>(null);
  const [autofillReady, setAutofillReady] = useState(false);

  // Guards the conditional-UI ceremony, which resolves long after its effect has been torn
  // down by a tab switch or an explicit button press.
  const liveRef = useRef(true);
  useEffect(() => {
    liveRef.current = true;
    return () => {
      liveRef.current = false;
    };
  }, []);

  async function authenticate(mode: Mode, useBrowserAutofill = false) {
    if (!useBrowserAutofill) setBusy(mode);

    try {
      const body =
        mode === "username" ? { username, preferences } : { preferences };

      const { options, discoverable } = await postJSON<{
        options: PublicKeyCredentialRequestOptionsJSON;
        discoverable: boolean;
      }>("/api/webauthn/authenticate/options", body);

      log({
        ceremony: "authentication",
        phase: "options",
        label: `generateAuthenticationOptions${discoverable ? " (discoverable)" : ""}${
          useBrowserAutofill ? " (conditional UI)" : ""
        }`,
        payload: options,
      });

      const response = await startAuthentication({ optionsJSON: options, useBrowserAutofill });

      // A conditional ceremony that was superseded still resolves here; ignore it rather than
      // signing the user in off a stale interaction.
      if (useBrowserAutofill && !liveRef.current) return;

      log({
        ceremony: "authentication",
        phase: "authenticator",
        label: "navigator.credentials.get()",
        payload: response,
      });

      const result = await postJSON<{ outcome: CeremonyOutcome; username: string }>(
        "/api/webauthn/authenticate/verify",
        response,
      );
      log({
        ceremony: "authentication",
        phase: "verified",
        label: `Signed in as ${result.username}`,
        payload: result.outcome,
      });

      onSuccess(result.username, result.outcome);
    } catch (error) {
      // An aborted conditional ceremony is the normal outcome when the user presses a button
      // instead of picking from autofill, so it is not worth reporting.
      const aborted = error instanceof Error && error.name === "AbortError";
      if (useBrowserAutofill && aborted) return;

      const message = describeWebAuthnError(error);
      log({
        ceremony: "authentication",
        phase: "error",
        label: message,
        payload: {
          name: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : String(error),
        },
      });
      onError(message);
    } finally {
      if (!useBrowserAutofill) setBusy(null);
    }
  }

  /**
   * Conditional UI: a ceremony started on mount that resolves only if the user picks a passkey
   * out of the username field's autofill dropdown. It has to be started before any interaction,
   * which is why it lives in an effect rather than behind a button.
   */
  useEffect(() => {
    let cancelled = false;

    async function startConditional() {
      if (!(await browserSupportsWebAuthnAutofill())) return;
      if (cancelled) return;
      setAutofillReady(true);
      await authenticate("discoverable", true);
    }

    void startConditional();

    return () => {
      cancelled = true;
      // Releases the pending ceremony; without this the browser keeps it open and the next
      // explicit call would be rejected.
      WebAuthnAbortService.cancelCeremony();
    };
    // Intentionally once per mount: restarting on every preference change would cancel the
    // ceremony the user is in the middle of.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void authenticate("username");
        }}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="signin-username">Username</Label>
          <Input
            id="signin-username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="alice"
            // "webauthn" is what lets the browser offer passkeys in this field's autofill.
            autoComplete="username webauthn"
            autoCapitalize="none"
            spellCheck={false}
            required
          />
          {autofillReady && (
            <p className="text-muted-foreground text-xs">
              Passkeys for this site may appear in this field&apos;s autofill.
            </p>
          )}
        </div>

        <PasskeyOptions
          preferences={preferences}
          onChange={onPreferencesChange}
          variant="authentication"
        />

        <Button type="submit" className="w-full" disabled={busy !== null}>
          {busy === "username" ? "Waiting for your key…" : "Sign in"}
        </Button>
      </form>

      <div className="flex items-center gap-3">
        <Separator className="flex-1" />
        <span className="text-muted-foreground text-xs">or</span>
        <Separator className="flex-1" />
      </div>

      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={busy !== null}
        onClick={() => void authenticate("discoverable")}
      >
        {busy === "discoverable" ? "Waiting for your key…" : "Sign in with a passkey"}
      </Button>

      <p className="text-muted-foreground text-xs">
        No username needed — the key supplies the identity itself. This only works for a passkey
        registered as discoverable.
      </p>

      <div className="space-y-2 border-t pt-4">
        <p className="text-muted-foreground text-xs">
          Key not to hand, or lost entirely?
        </p>
        <CodeSignIn onSuccess={onCodeSuccess} onError={onError} />
      </div>
    </div>
  );
}
