"use client";

import { useState } from "react";
import { Cloud, HardDrive, KeyRound, Nfc, Pencil, Smartphone, Trash2, Usb } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CredentialView } from "@/lib/webauthn/api-types";

const transportIcon: Record<string, React.ComponentType<{ className?: string }>> = {
  usb: Usb,
  nfc: Nfc,
  internal: Smartphone,
  hybrid: Smartphone,
};

function relative(iso: string | null): string {
  if (!iso) return "never";
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString();
}

function Properties({ credential }: { credential: CredentialView }) {
  return (
    <div className="flex flex-wrap gap-1">
      {credential.transports.length === 0 ? (
        <Badge variant="outline" className="text-[10px]">
          no transport reported
        </Badge>
      ) : (
        credential.transports.map((transport) => {
          const Icon = transportIcon[transport] ?? KeyRound;
          return (
            <Badge key={transport} variant="secondary" className="gap-1 text-[10px]">
              <Icon className="size-3" />
              {transport}
            </Badge>
          );
        })
      )}

      {credential.deviceType === "multiDevice" ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1 text-[10px]">
              <Cloud className="size-3" />
              synced
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            A multi-device credential, which can be backed up and appear on other devices.
          </TooltipContent>
        </Tooltip>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="gap-1 text-[10px]">
              <HardDrive className="size-3" />
              single device
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            Bound to this authenticator and unable to leave it, which is what you expect from a
            YubiKey.
          </TooltipContent>
        </Tooltip>
      )}

      {credential.discoverable && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-[10px]">
              discoverable
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            A resident key: it can sign in with no username typed.
          </TooltipContent>
        </Tooltip>
      )}

      {credential.userVerified && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="text-[10px]">
              UV
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            User verification happened at registration: a PIN or biometric, not just a touch.
          </TooltipContent>
        </Tooltip>
      )}

      {credential.backedUp && (
        <Badge variant="outline" className="text-[10px]">
          backed up
        </Badge>
      )}
    </div>
  );
}

interface Props {
  credentials: CredentialView[];
  onChanged: () => void;
}

export function CredentialTable({ credentials, onChanged }: Props) {
  const [renaming, setRenaming] = useState<CredentialView | null>(null);
  const [nickname, setNickname] = useState("");
  const [deleting, setDeleting] = useState<CredentialView | null>(null);
  const [busy, setBusy] = useState(false);

  async function saveNickname() {
    if (!renaming) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/credentials/${encodeURIComponent(renaming.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(data?.error ?? "Rename failed.");
      }
      toast.success("Passkey renamed");
      setRenaming(null);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rename failed.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/credentials/${encodeURIComponent(deleting.id)}`, {
        method: "DELETE",
      });
      const data = (await response.json().catch(() => null)) as
        | { remaining?: number; error?: string }
        | null;
      if (!response.ok) throw new Error(data?.error ?? "Delete failed.");

      toast.success("Passkey deleted", {
        description:
          data?.remaining === 0
            ? "That was the last one, so this account can no longer sign in."
            : undefined,
      });
      setDeleting(null);
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  if (credentials.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        No passkeys registered. Add one to be able to sign in.
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Passkey</TableHead>
            <TableHead>Properties</TableHead>
            <TableHead className="text-right">Counter</TableHead>
            <TableHead>Last used</TableHead>
            <TableHead className="w-20" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {credentials.map((credential) => (
            <TableRow key={credential.id}>
              <TableCell className="max-w-[20rem] align-top whitespace-normal">
                <div className="flex items-center gap-2 font-medium">
                  <KeyRound className="text-muted-foreground size-4 shrink-0" />
                  <span className="truncate">
                    {credential.nickname ?? credential.authenticatorName ?? "Unidentified key"}
                  </span>
                  {credential.current && <Badge className="text-[10px]">this session</Badge>}
                </div>
                <div className="text-muted-foreground mt-1 space-y-0.5 text-xs">
                  {credential.nickname && credential.authenticatorName && (
                    <div>{credential.authenticatorName}</div>
                  )}
                  {credential.aaguid ? (
                    <div className="font-mono text-[10px]">{credential.aaguid}</div>
                  ) : (
                    <div>No AAGUID &mdash; use attestation &ldquo;direct&rdquo; to identify the model.</div>
                  )}
                  <div>added {relative(credential.createdAt)}</div>
                </div>
              </TableCell>

              <TableCell className="align-top">
                <Properties credential={credential} />
              </TableCell>

              <TableCell className="align-top text-right font-mono text-xs tabular-nums">
                {credential.counter}
              </TableCell>

              <TableCell className="text-muted-foreground align-top text-xs">
                {relative(credential.lastUsedAt)}
              </TableCell>

              <TableCell className="align-top">
                <div className="flex justify-end gap-1 whitespace-nowrap">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label="Rename passkey"
                    onClick={() => {
                      setRenaming(credential);
                      setNickname(credential.nickname ?? "");
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive size-8"
                    aria-label="Delete passkey"
                    onClick={() => setDeleting(credential)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename passkey</DialogTitle>
            <DialogDescription>
              A label for your own benefit, stored alongside the credential.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="nickname">Name</Label>
            <Input
              id="nickname"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder={renaming?.authenticatorName ?? "Blue YubiKey"}
              maxLength={60}
            />
            <p className="text-muted-foreground text-xs">Leave empty to clear the name.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenaming(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void saveNickname()} disabled={busy}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this passkey?</DialogTitle>
            <DialogDescription>
              {credentials.length === 1
                ? "This is the only passkey on the account. Deleting it means you will not be able to sign in again."
                : "The credential is removed from this site. The key itself keeps its own copy until you reset it."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => void confirmDelete()} disabled={busy}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
