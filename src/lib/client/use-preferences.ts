"use client";

import { useCallback, useSyncExternalStore } from "react";
import { defaultPreferences, type CeremonyPreferences } from "@/lib/webauthn/preferences";

const KEY = "pk_preferences";

const listeners = new Set<() => void>();

/**
 * The snapshot has to be referentially stable or useSyncExternalStore re-renders forever, so the
 * parsed value is cached against the raw string it came from and only rebuilt when that changes.
 */
let cache: { raw: string | null; value: CeremonyPreferences } = {
  raw: null,
  value: defaultPreferences,
};

function read(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    // Storage is blocked outright in some private modes.
    return null;
  }
}

function getSnapshot(): CeremonyPreferences {
  const raw = read();
  if (raw !== cache.raw) {
    let value = defaultPreferences;
    if (raw) {
      try {
        value = { ...defaultPreferences, ...(JSON.parse(raw) as Partial<CeremonyPreferences>) };
      } catch {
        value = defaultPreferences;
      }
    }
    cache = { raw, value };
  }
  return cache.value;
}

/** During SSR and hydration there is no storage; React re-renders with the real value after. */
function getServerSnapshot(): CeremonyPreferences {
  return defaultPreferences;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // Picks up changes made in another tab as well as our own writes.
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * Keeps the ceremony settings across reloads so a test matrix does not have to be re-entered on
 * every attempt. The server re-validates every field, so whatever is in storage is only ever a
 * suggestion.
 */
export function usePreferences() {
  const preferences = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const update = useCallback((patch: Partial<CeremonyPreferences>) => {
    const next = { ...getSnapshot(), ...patch };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // Not persisting is not worth interrupting the demo for; keep the value in the cache so
      // the UI still reflects the change.
      cache = { raw: cache.raw, value: next };
    }
    for (const listener of listeners) listener();
  }, []);

  return [preferences, update] as const;
}
