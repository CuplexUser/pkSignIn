import type { ApiError } from "@/lib/webauthn/api-types";

/** POSTs JSON and turns a non-2xx response into an Error carrying the server's message. */
export async function postJSON<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });

  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (data as ApiError | null)?.error;
    throw new Error(message ?? `Request failed (${response.status})`);
  }
  return data as T;
}

export async function getJSON<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: { accept: "application/json" } });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = (data as ApiError | null)?.error;
    throw new Error(message ?? `Request failed (${response.status})`);
  }
  return data as T;
}

/**
 * WebAuthn failures arrive as DOMExceptions whose messages are vague by design. These are the
 * ones a YubiKey demo actually hits, translated into something actionable.
 */
export function describeWebAuthnError(error: unknown): string {
  if (!(error instanceof Error)) return "The ceremony failed.";

  switch (error.name) {
    case "NotAllowedError":
      return "Cancelled or timed out. Touch the key when it blinks — and on Android, hold it against the back of the phone until it buzzes.";
    case "InvalidStateError":
      return "This authenticator is already registered for this account. Sign in with it instead, or try a different key.";
    case "ConstraintError":
      return "The authenticator could not satisfy the request. A discoverable credential needs a PIN set on the key, and the key's resident-credential slots may be full.";
    case "NotSupportedError":
      return "This authenticator does not support the requested algorithms.";
    case "SecurityError":
      return "The page's origin is not valid for WebAuthn. It must be localhost or a real HTTPS origin.";
    case "AbortError":
      return "The ceremony was aborted.";
    default:
      return error.message || error.name;
  }
}
