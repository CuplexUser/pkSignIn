"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useDebug, type DebugEntry, type DebugPhase } from "./debug-provider";

const phaseLabel: Record<DebugPhase, string> = {
  options: "→ options",
  authenticator: "← authenticator",
  verified: "✓ verified",
  error: "✕ error",
};

const phaseStyle: Record<DebugPhase, string> = {
  options: "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30",
  authenticator: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/30",
  verified: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  error: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/30",
};

function Entry({ entry }: { entry: DebugEntry }) {
  const [open, setOpen] = useState(false);
  const time = new Date(entry.at).toLocaleTimeString();

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="hover:bg-muted/50 flex w-full items-center gap-2 px-3 py-2 text-left text-xs"
      >
        <span className="text-muted-foreground shrink-0 tabular-nums">{time}</span>
        <Badge variant="outline" className={cn("shrink-0 font-mono text-[10px]", phaseStyle[entry.phase])}>
          {phaseLabel[entry.phase]}
        </Badge>
        <span className="truncate font-medium">{entry.label}</span>
        <span className="text-muted-foreground ml-auto shrink-0">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <pre className="bg-muted/40 max-h-72 overflow-auto border-t px-3 py-2 font-mono text-[11px] leading-relaxed">
          {JSON.stringify(entry.payload, null, 2)}
        </pre>
      )}
    </div>
  );
}

/**
 * A live view of both halves of every ceremony: the options we hand the browser and what the
 * authenticator hands back. This is the fastest way to see why one key or platform behaves
 * differently from another — whether user verification actually happened, whether the
 * credential came back discoverable, which transports the authenticator claims.
 */
export function DebugPanel() {
  const { entries, clear } = useDebug();
  const [open, setOpen] = useState(false);

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center px-3 pb-3">
      <div className="pointer-events-auto w-full max-w-3xl">
        {open && (
          <div className="bg-background mb-2 overflow-hidden rounded-lg border shadow-lg">
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <span className="text-sm font-semibold">WebAuthn exchanges</span>
              <span className="text-muted-foreground text-xs">{entries.length}</span>
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 text-xs"
                onClick={clear}
                disabled={entries.length === 0}
              >
                Clear
              </Button>
            </div>
            {entries.length === 0 ? (
              <p className="text-muted-foreground px-3 py-6 text-center text-xs">
                Nothing yet. Register or sign in and every step will be recorded here.
              </p>
            ) : (
              <ScrollArea className="h-[min(60vh,26rem)]">
                {entries.map((entry) => (
                  <Entry key={entry.id} entry={entry} />
                ))}
              </ScrollArea>
            )}
          </div>
        )}

        <div className="flex justify-end">
          <Button
            variant={open ? "default" : "secondary"}
            size="sm"
            className="shadow-lg"
            onClick={() => setOpen((value) => !value)}
          >
            Debug
            {entries.length > 0 && (
              <Badge variant="outline" className="ml-1 h-5 px-1.5 font-mono text-[10px]">
                {entries.length}
              </Badge>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
