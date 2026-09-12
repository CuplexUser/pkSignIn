"use client";

import { useState } from "react";
import { Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import type { TotpEnrollResponse, TotpStatus } from "@/lib/webauthn/api-types";

interface Props {
  status: TotpStatus;
  onChanged: () => void;
}

export function TotpCard({ status, onChanged }: Props) {
  const [enrollment, setEnrollment] = useState<TotpEnrollResponse | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function startEnrollment() {
    setBusy(true);
    try {
      const data = await postJSON<TotpEnrollResponse>("/api/totp/enroll");
      setEnrollment(data);
      setCode("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start enrollment.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      await postJSON("/api/totp/confirm", { code });
      toast.success("Authenticator app enrolled", {
        description: "You can now sign in with a code when your key is not to hand.",
      });
      setEnrollment(null);
      setCode("");
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not confirm.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const response = await fetch("/api/totp/enroll", { method: "DELETE" });
      if (!response.ok) throw new Error("Could not remove the authenticator app.");
      toast.success("Authenticator app removed");
      setRemoving(false);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Smartphone className="size-4" />
            Authenticator app
            {status.enrolled && (
              <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-[10px] text-emerald-700 dark:text-emerald-300">
                enrolled
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            A time-based code (TOTP) to sign in with when your security key is not to hand.
          </CardDescription>
          <CardAction>
            {status.enrolled ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRemoving(true)}
                disabled={busy}
              >
                Remove
              </Button>
            ) : (
              <Button size="sm" onClick={() => void startEnrollment()} disabled={busy}>
                {status.pending ? "Restart setup" : "Set up"}
              </Button>
            )}
          </CardAction>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-xs">
            {status.enrolled
              ? `${status.digits} digits, every ${status.period}s, ${status.algorithm}. Works with Google Authenticator, Aegis, 1Password, or a YubiKey via Yubico Authenticator.`
              : "Scan a QR code with any authenticator app. A YubiKey can hold TOTP secrets too, via Yubico Authenticator."}
          </p>
        </CardContent>
      </Card>

      <Dialog
        open={enrollment !== null}
        onOpenChange={(open) => {
          if (!open) setEnrollment(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Set up your authenticator app</DialogTitle>
            <DialogDescription>
              Scan this with your authenticator app, then enter the code it shows to confirm the
              two are in sync.
            </DialogDescription>
          </DialogHeader>

          {enrollment && (
            <div className="space-y-4">
              {/* Always on white: QR readers need the contrast regardless of page theme. */}
              <div
                className="mx-auto w-full max-w-[13rem] rounded-lg bg-white p-3 [&_svg]:h-auto [&_svg]:w-full"
                dangerouslySetInnerHTML={{ __html: enrollment.qrSvg }}
              />

              <div className="space-y-1">
                <Label className="text-xs">Or enter this secret by hand</Label>
                <code className="bg-muted block overflow-x-auto rounded p-2 font-mono text-xs break-all">
                  {enrollment.secret}
                </code>
              </div>

              <div className="space-y-2">
                <Label htmlFor="totp-confirm">Code from the app</Label>
                <Input
                  id="totp-confirm"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  placeholder="123456"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  className="font-mono tracking-widest"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEnrollment(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void confirm()} disabled={busy || code.length < 6}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removing} onOpenChange={setRemoving}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove the authenticator app?</DialogTitle>
            <DialogDescription>
              You will no longer be able to sign in with a code. Your passkeys and recovery codes
              are unaffected.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoving(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void remove()} disabled={busy}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
