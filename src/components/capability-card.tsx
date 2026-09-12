"use client";

import { useEffect, useState } from "react";
import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  getBrowserCapabilities,
  platformAuthenticatorIsAvailable,
  type BrowserCapabilities,
} from "@simplewebauthn/browser";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type Support = "supported" | "unsupported" | "unknown";

interface Probe {
  label: string;
  hint: string;
  support: Support;
}

function tone(support: Support) {
  if (support === "supported") {
    return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  }
  if (support === "unsupported") {
    return "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30";
  }
  return "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30";
}

/**
 * What this browser can actually do, read from the WebAuthn client itself. The quickest answer
 * to "why did that work on my PC but not on my phone": the capability list differs, and so do
 * the ceremonies that will succeed.
 */
export function CapabilityCard() {
  const [probes, setProbes] = useState<Probe[] | null>(null);
  const [secure, setSecure] = useState<{ ok: boolean; origin: string } | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function probe() {
      const supportsWebAuthn = browserSupportsWebAuthn();

      let capabilities: BrowserCapabilities | null = null;
      if (supportsWebAuthn) {
        // getClientCapabilities() is recent; older browsers simply do not have it.
        capabilities = await getBrowserCapabilities().catch(() => null);
      }

      const [autofill, platform] = await Promise.all([
        browserSupportsWebAuthnAutofill().catch(() => false),
        platformAuthenticatorIsAvailable().catch(() => false),
      ]);

      const asSupport = (value: boolean): Support => (value ? "supported" : "unsupported");

      const result: Probe[] = [
        {
          label: "WebAuthn",
          hint: "navigator.credentials with public-key support",
          support: asSupport(supportsWebAuthn),
        },
        {
          label: "Platform authenticator",
          hint: "Windows Hello, Touch ID, or the Android screen lock",
          support: asSupport(platform),
        },
        {
          label: "Conditional UI",
          hint: "Passkeys offered in the username field's autofill",
          support: capabilities?.conditionalGet ?? asSupport(autofill),
        },
        {
          label: "Cross-device (hybrid)",
          hint: "Using a passkey stored on a nearby phone, via QR and Bluetooth",
          support: capabilities?.hybridTransport ?? "unknown",
        },
        {
          label: "Related origins",
          hint: "One credential usable across several origins",
          support: capabilities?.relatedOrigins ?? "unknown",
        },
      ];

      if (!cancelled) {
        setProbes(result);
        setSecure({ ok: window.isSecureContext, origin: window.location.origin });
      }
    }

    void probe();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">This browser</CardTitle>
        <CardDescription>
          {secure ? (
            <>
              <span className="font-mono text-xs">{secure.origin}</span>
              {secure.ok ? (
                " — a secure context, so WebAuthn is available."
              ) : (
                " — not a secure context. WebAuthn needs localhost or HTTPS."
              )}
            </>
          ) : (
            "Checking…"
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {probes === null
          ? [0, 1, 2, 3, 4].map((index) => <Skeleton key={index} className="h-9 w-full" />)
          : probes.map((probe) => (
              <div key={probe.label} className="flex items-start gap-3 text-sm">
                <Badge variant="outline" className={cn("mt-0.5 shrink-0 text-[10px]", tone(probe.support))}>
                  {probe.support}
                </Badge>
                <div className="min-w-0">
                  <div className="font-medium">{probe.label}</div>
                  <div className="text-muted-foreground text-xs">{probe.hint}</div>
                </div>
              </div>
            ))}
        <p className="text-muted-foreground border-t pt-2 text-xs">
          A roaming USB or NFC security key needs no capability of its own: it works anywhere
          WebAuthn does. These flags are what differ between a desktop browser and Android.
        </p>
      </CardContent>
    </Card>
  );
}
