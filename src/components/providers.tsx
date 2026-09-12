"use client";

import { ThemeProvider } from "next-themes";
import { DebugPanel } from "@/components/debug/debug-panel";
import { DebugProvider } from "@/components/debug/debug-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * The debug log lives above the router so a ceremony's record survives the navigation that the
 * ceremony itself causes — otherwise signing in would clear the evidence of how it went.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        <DebugProvider>
          {children}
          <DebugPanel />
          <Toaster />
        </DebugProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}
