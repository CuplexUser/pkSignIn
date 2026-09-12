"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { CeremonyPreferences } from "@/lib/webauthn/preferences";

interface Props {
  preferences: CeremonyPreferences;
  onChange: (patch: Partial<CeremonyPreferences>) => void;
  /** Registration exposes every knob; sign-in only has user verification to offer. */
  variant: "registration" | "authentication";
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5 sm:grid-cols-[1fr_11rem] sm:items-center sm:gap-3">
      <div className="min-w-0">
        <Label className="text-sm">{label}</Label>
        <p className="text-muted-foreground text-xs">{hint}</p>
      </div>
      {children}
    </div>
  );
}

export function PasskeyOptions({ preferences, onChange, variant }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-lg border">
      <Button
        type="button"
        variant="ghost"
        className="h-auto w-full justify-between px-3 py-2 text-xs font-medium"
        onClick={() => setOpen((value) => !value)}
      >
        Ceremony options
        <span className="text-muted-foreground">{open ? "Hide" : "Show"}</span>
      </Button>

      {open && (
        <div className="space-y-3 border-t px-3 py-3">
          {variant === "registration" && (
            <Row
              label="Discoverable credential"
              hint="Required is what makes usernameless sign-in possible. A YubiKey 5 holds about 25 and errors when full."
            >
              <Select
                value={preferences.residentKey}
                onValueChange={(value) =>
                  onChange({ residentKey: value as CeremonyPreferences["residentKey"] })
                }
              >
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="discouraged">discouraged</SelectItem>
                  <SelectItem value="preferred">preferred</SelectItem>
                  <SelectItem value="required">required</SelectItem>
                </SelectContent>
              </Select>
            </Row>
          )}

          <Row
            label="User verification"
            hint="Required demands a PIN or biometric. A YubiKey with no PIN set will refuse it."
          >
            <Select
              value={preferences.userVerification}
              onValueChange={(value) =>
                onChange({ userVerification: value as CeremonyPreferences["userVerification"] })
              }
            >
              <SelectTrigger className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="discouraged">discouraged</SelectItem>
                <SelectItem value="preferred">preferred</SelectItem>
                <SelectItem value="required">required</SelectItem>
              </SelectContent>
            </Select>
          </Row>

          {variant === "registration" && (
            <>
              <Row
                label="Attestation"
                hint="Direct asks the key to identify its model, which is what fills in the AAGUID."
              >
                <Select
                  value={preferences.attestation}
                  onValueChange={(value) =>
                    onChange({ attestation: value as CeremonyPreferences["attestation"] })
                  }
                >
                  <SelectTrigger className="w-full sm:w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">none</SelectItem>
                    <SelectItem value="direct">direct</SelectItem>
                  </SelectContent>
                </Select>
              </Row>

              <Row
                label="Prefer a security key"
                hint="Off on Windows means Windows Hello usually takes the prompt instead of the YubiKey."
              >
                <div className="sm:w-44">
                  <Switch
                    checked={preferences.preferSecurityKey}
                    onCheckedChange={(checked) => onChange({ preferSecurityKey: checked })}
                  />
                </div>
              </Row>
            </>
          )}
        </div>
      )}
    </div>
  );
}
