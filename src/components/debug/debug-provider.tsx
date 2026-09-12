"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type DebugPhase = "options" | "authenticator" | "verified" | "error";
export type Ceremony = "registration" | "authentication";

export interface DebugEntry {
  id: string;
  at: number;
  ceremony: Ceremony;
  phase: DebugPhase;
  label: string;
  payload: unknown;
}

interface DebugContextValue {
  entries: DebugEntry[];
  log: (entry: Omit<DebugEntry, "id" | "at">) => void;
  clear: () => void;
}

const DebugContext = createContext<DebugContextValue | null>(null);

/** Capped so a long demo session cannot grow the panel without bound. */
const LIMIT = 40;

export function DebugProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<DebugEntry[]>([]);

  const log = useCallback((entry: Omit<DebugEntry, "id" | "at">) => {
    setEntries((previous) =>
      [
        {
          ...entry,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          at: Date.now(),
        },
        ...previous,
      ].slice(0, LIMIT),
    );
  }, []);

  const clear = useCallback(() => setEntries([]), []);

  const value = useMemo(() => ({ entries, log, clear }), [entries, log, clear]);

  return <DebugContext.Provider value={value}>{children}</DebugContext.Provider>;
}

export function useDebug(): DebugContextValue {
  const context = useContext(DebugContext);
  if (!context) throw new Error("useDebug must be used inside <DebugProvider>");
  return context;
}
