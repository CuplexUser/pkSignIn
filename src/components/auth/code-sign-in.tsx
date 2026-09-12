"use client";

import { useState } from "react";
import { LifeBuoy, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { postJSON } from "@/lib/client/api";

type Mode = "totp" | "recovery";

interface Props {
  onSuccess: (username: string, mode: Mode, remaining?: number) => void;
  onError: (message: string) => void;
}

const copy: Record<Mode, { title: string; description: string; label: string; placeholder: string }> = {
  totp: {
    title: "Sign in with a code",
    description:
      "Enter your username and the current code from your authenticator app. Use this when your security key is not to hand.",
    label: "Code from your app",
    placeholder: "123456",
  },
  recovery: {
    title: "Use a recovery code",
    description:
      "For when the key is lost rather than merely elsewhere. Each code works once, and you should enroll a new passkey straight afterwards.",
    label: "Recovery code",
    placeholder: "ABCDE-FGHJK",
  },
};

export function CodeSignIn({ onSuccess, onError }: Props) {
  const [mode, setMode] = useState<Mode | null>(null);
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  function open(next: Mode) {
    setMode(next);
    setCode("");
  }

  async function submit() {
    if (!mode) return;
    setBusy(true);
    try {
      const endpoint = mode === "totp" ? "/api/totp/signin" : "/api/recovery/signin";
      const result = await postJSON<{ username: string; remaining?: number }>(endpoint, {
        username,
        code,
      });
      setMode(null);
      onSuccess(result.username, mode, result.remaining);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  }

  const text = mode ? copy[mode] : null;

  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button type="button" variant="outline" size="sm" onClick={() => open("totp")}>
          <Smartphone className="size-3.5" />
          Use a code
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => open("recovery")}>
          <LifeBuoy className="size-3.5" />
          Recovery code
        </Button>
      </div>

      <Dialog
        open={mode !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setMode(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{text?.title}</DialogTitle>
            <DialogDescription>{text?.description}</DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="code-username">Username</Label>
              <Input
                id="code-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="alice"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="code-value">{text?.label}</Label>
              <Input
                id="code-value"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder={text?.placeholder}
                // one-time-code lets the OS offer a code it has seen, on both platforms.
                autoComplete="one-time-code"
                inputMode={mode === "totp" ? "numeric" : "text"}
                autoCapitalize="characters"
                spellCheck={false}
                required
                className="font-mono tracking-widest"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setMode(null)} disabled={busy}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !username || !code}>
                {busy ? "Checking…" : "Sign in"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
