# Passkey Sign-In Demo

A WebAuthn / FIDO2 demo built around a **hardware security key**. Register a YubiKey, sign in
with it — with or without a username — and watch every step of the ceremony in a live debug
panel. There is no password anywhere in the flow.

The authentication is implemented directly against the WebAuthn API rather than delegated to an
auth provider, because the ceremony *is* the thing being demonstrated.

## Stack

| Piece | Version |
| --- | --- |
| Node.js | 26.7 (22.5+ required) |
| Next.js | 16.3 (App Router, Turbopack) |
| React | 19.2 |
| TypeScript | 5 (strict) |
| Tailwind CSS | 4 |
| shadcn/ui | Radix base, Nova preset |
| `@simplewebauthn/server` + `/browser` | 14 |
| [`repolayer`](https://www.npmjs.com/package/repolayer) | 2.1 — SQLite now, Postgres later |

Storage goes through repolayer, so the engine is one config value rather than a rewrite. It uses
Node's built-in `node:sqlite` underneath, so there is no native module to compile.

## Quick start

```bash
npm install
npm run dev
```

Open <http://localhost:3000>. No `.env.local` is needed — see `.env.local.example` for the
optional settings. The database is created at `.data/passkeys.db` on first use.

> `localhost` is exempt from the HTTPS requirement, so a USB key works in development with no
> TLS setup. Any other host must be real HTTPS, which is what Phase 2 below is about.

## What it does

- **Register** a passkey on a security key, with the ceremony options exposed as UI controls.
- **Sign in** with a username, or **usernameless** — an empty `allowCredentials` list, so the key
  supplies the identity from its own resident credential.
- **Conditional UI**: passkeys offered directly in the username field's autofill, where supported.
- **Manage credentials**: every passkey with its resolved model name, transports, discoverability,
  user-verification and backup state, signature counter and last use. Rename and delete.
- **Debug panel**: the options sent to the browser and the authenticator's raw response for every
  ceremony, plus the parsed result flags.
- **Capability card**: what this browser's WebAuthn client can actually do — the quickest
  explanation of why a key behaves differently on a PC than on Android.

## Testing with a YubiKey (PC, USB)

1. `npm run dev`, open <http://localhost:3000>, and check the capability card reports WebAuthn
   as supported.
2. **Register** → pick a username → **Create a passkey**. Insert the key and touch it when it
   blinks. You land on the dashboard with the credential listed.
3. **Sign out**, then sign in with the username and the key.
4. For usernameless sign-in, register a passkey with **Discoverable credential: required**, sign
   out, and use **Sign in with a passkey** with nothing typed.
5. Try registering the same key twice on one account — `excludeCredentials` makes the browser
   refuse it.
6. Restart the dev server; accounts and credentials survive in `.data/passkeys.db`.

### No hardware handy?

Chrome and Edge ship a virtual authenticator. Open DevTools → ⋮ → **More tools** → **WebAuthn** →
**Enable virtual authenticator environment**, then add one with protocol `ctap2`, transport `usb`,
and both **resident keys** and **user verification** on. Every flow above then works with no key.

### Ceremony options

These are the settings that actually change behavior between devices, which is why they are
adjustable rather than hardcoded:

| Option | Why it matters |
| --- | --- |
| **Discoverable credential** | `required` is what makes usernameless sign-in possible. A YubiKey 5 stores roughly 25 and errors once full. |
| **User verification** | `required` demands a PIN or biometric. A key with no PIN configured will refuse it. |
| **Attestation** | `direct` asks the key to identify its model, which is what populates the AAGUID and the name shown in the credential list. `none` leaves it anonymous. |
| **Prefer a security key** | Sends `hints: ["security-key"]` and a cross-platform attachment. **With this off, Windows Hello usually takes the prompt instead of the YubiKey.** |

### Troubleshooting

| Symptom | Cause |
| --- | --- |
| Windows Hello appears instead of the key | Turn **Prefer a security key** on. |
| `ConstraintError` on registration | A discoverable credential was requested but the key has no PIN, or its resident slots are full. |
| "This authenticator is already registered" | `excludeCredentials` working as intended — that key is already enrolled on this account. |
| Usernameless sign-in finds nothing | The passkey was not stored as discoverable. Re-register with `residentKey: required`. |
| Nothing works, no prompt at all | Not a secure context. WebAuthn needs `localhost` or HTTPS. |

## How it works

A WebAuthn ceremony is two round trips, and both halves are visible in the debug panel:

```
  browser                         server                        authenticator
     │  POST …/options              │                                 │
     │─────────────────────────────>│  generate options + challenge   │
     │<─────────────────────────────│  (challenge stored server-side) │
     │  navigator.credentials.create/get()                            │
     │───────────────────────────────────────────────────────────────>│
     │<───────────────────────────────────────────────────────────────│
     │  POST …/verify               │                                 │
     │─────────────────────────────>│  verify signature, store/update │
     │<─────────────────────────────│  credential, open a session     │
```

Points worth knowing about this implementation:

- **Challenges never travel through the client.** Each `…/options` call writes a challenge row
  and sets a short-lived httpOnly cookie holding only that row's id. `…/verify` reads it, deletes
  it (single use), and rejects it if expired or issued for the other ceremony. A client that
  could supply its own challenge could satisfy it with a signature it already had.
- **The RP ID and origin are derived per request** from `x-forwarded-host` / `host`, so the same
  build serves `localhost` and a Vercel preview URL unchanged. Credentials are bound to the RP ID,
  so this is what stops every passkey breaking on the next deploy. `WEBAUTHN_RP_ID` and
  `WEBAUTHN_ORIGIN` override it.
- **Accounts are created at verification, not when options are issued.** Otherwise an abandoned
  registration would permanently squat the username — refused as taken, with no passkey on it to
  sign in with.
- **Registering while signed out claims a new username; registering while signed in adds a key to
  your own account.** Conflating the two would let anyone attach their key to an existing account.
- **A username-led ceremony only accepts that account's credentials**, and a usernameless one
  cross-checks the authenticator's `userHandle` against the stored owner.
- **Clone detection** comes from SimpleWebAuthn, which rejects a signature counter that failed to
  advance. Many passkeys legitimately always report `0`; that case is handled rather than rejected.
- **Sessions are rows, not signed cookies.** The cookie holds a 256-bit random token, so signing
  out genuinely ends the session and a leaked cookie can be revoked.
- **The public key is stored base64url**, not as a blob: repolayer's field types are
  `string | number | integer | boolean | date | json`, and text moves to Postgres without a
  `bytea` special case.

### Layout

```
src/
  app/
    page.tsx                     landing: register / sign-in tabs
    dashboard/page.tsx           credential manager (auth-gated)
    api/webauthn/…               the four ceremony endpoints
    api/credentials/…            list, rename, delete
    api/me, api/signout
  lib/
    db/schema.ts                 repolayer schemas — the only description of the storage shape
    db/index.ts                  the engine swap point
    webauthn/rp.ts               per-request RP ID and origin
    webauthn/challenge.ts        server-side, single-use challenges
    webauthn/preferences.ts      ceremony options, validated against allowlists
    aaguid/                      vendored AAGUID → model-name map
    session.ts                   database-backed session cookie
  components/
    auth/, credentials/, debug/, capability-card.tsx, relying-party-card.tsx
```

`ensureTable()` generates the schema on startup and `verifyTable()` checks the live tables against
it, reporting drift with the fix. After changing a schema in development, delete
`.data/passkeys.db` and let it be recreated — `ensureTable` never alters an existing table.

## Phase 2: Vercel and YubiKey NFC on Android

Testing NFC needs a real HTTPS origin, which means deploying. Two things change:

**1. Storage.** Vercel's filesystem is read-only, so SQLite cannot persist there. Provision
Postgres (Neon through the Vercel Marketplace) and set:

```bash
npm install pg          # an optional peer dependency, imported lazily
```

```
PASSKEY_DB_DRIVER=postgres
DATABASE_URL=postgres://…
```

No route handler or component changes — that is what the repository layer is for.

**2. Nothing else.** The RP ID and origin already come from the request, so the preview URL works
as-is.

Then, on an Android phone:

1. Open the deployment in Chrome and confirm the capability card.
2. Register a passkey. Hold the YubiKey flat against the back of the phone (the NFC antenna is
   usually near the top) until it buzzes.
3. Expect `transports` to include `nfc`, and expect user-verification and discoverability to
   behave differently from the PC — the debug panel shows exactly how.

Note that Android will also offer to save a *platform* passkey via the screen lock. Keep
**Prefer a security key** on to steer the prompt to the YubiKey instead.
