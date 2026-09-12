"use client";

import { useState } from "react";
import { LifeBuoy, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { postJSON } from "@/lib/client/api";
import type { RecoveryGenerateResponse, RecoveryStatus } from "@/lib/webauthn/api-types";

interface Props {
  status: RecoveryStatus;
  onChanged: () => void;
}

export function RecoveryCard({ status, onChanged }: Props) {
  const [codes, setCodes] = useState<string[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const data = await postJSON<RecoveryGenerateResponse>("/api/recovery/generate");
      setCodes(data.codes);
      setConfirming(false);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not generate codes.");
    } finally {
      setBusy(false);
    }
  }

  function copyAll() {
    if (!codes) return;
    navigator.clipboard
      .writeText(codes.join("\n"))
      .then(() => toast.success("Copied to the clipboard"))
      .catch(() => toast.error("Could not copy. Select the codes and copy them manually."));
  }

  function download() {
    if (!codes) return;
    const blob = new Blob(
      [
        `Passkey Demo recovery codes\nGenerated ${new Date().toISOString()}\n\n`,
        codes.join("\n"),
        "\n\nEach code works once. Keep them somewhere safe and offline.\n",
      ],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "passkey-demo-recovery-codes.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const low = status.total > 0 && status.remaining <= 2;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LifeBuoy className="size-4" />
            Recovery codes
            {status.total > 0 && (
              <Badge
                variant="outline"
                className={
                  low
                    ? "border-amber-500/30 bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-300"
                    : "text-[10px]"
                }
              >
                {status.remaining} of {status.total} left
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Single-use codes to get back in if you lose your security key.
          </CardDescription>
          <CardAction>
            <Button
              size="sm"
              variant={status.total > 0 ? "outline" : "default"}
              onClick={() => (status.total > 0 ? setConfirming(true) : void generate())}
              disabled={busy}
            >
              {status.total > 0 ? "Regenerate" : "Generate"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-xs">
            {status.total === 0
              ? "None yet. Without a recovery code or an authenticator app, losing your only passkey means losing the account."
              : "Stored as hashes, so they cannot be shown again. Regenerating replaces every remaining code."}
          </p>
        </CardContent>
      </Card>

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace your recovery codes?</DialogTitle>
            <DialogDescription>
              The {status.remaining} unused code{status.remaining === 1 ? "" : "s"} you have now
              will stop working immediately.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void generate()} disabled={busy}>
              Replace them
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={codes !== null}
        onOpenChange={(open) => {
          if (!open) setCodes(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Your recovery codes</DialogTitle>
            <DialogDescription>
              Each one works once. Save them somewhere safe and offline.
            </DialogDescription>
          </DialogHeader>

          <Alert>
            <TriangleAlert className="size-4" />
            <AlertTitle>This is the only time they are shown</AlertTitle>
            <AlertDescription>
              Only hashes are stored, so they cannot be displayed again. If you lose them,
              generate a new set.
            </AlertDescription>
          </Alert>

          <div className="bg-muted grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg p-3 font-mono text-sm">
            {codes?.map((code) => (
              <div key={code} className="tabular-nums">
                {code}
              </div>
            ))}
          </div>

          <DialogFooter className="sm:justify-start">
            <Button variant="outline" size="sm" onClick={copyAll}>
              Copy
            </Button>
            <Button variant="outline" size="sm" onClick={download}>
              Download
            </Button>
            <Button size="sm" className="sm:ml-auto" onClick={() => setCodes(null)}>
              I have saved them
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
