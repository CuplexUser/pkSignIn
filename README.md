# Passkey Sign-In Demo

A WebAuthn / FIDO2 demo built around a **hardware security key**. Register a YubiKey, sign in
with it — with or without a username — and watch every step of the ceremony in a live debug
panel. There is no password anywhere in the flow.

Two fallbacks sit alongside the passkey, for when the key is elsewhere or gone for good: a
**TOTP authenticator app** and **single-use recovery codes**.

**Live:** <https://pksignin.vercel.app>

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
| [`repolayer`](https://www.npmjs.com/package/repolayer) | 2.1 — SQLite locally, Neon Postgres deployed |
| `qrcode-generator` | 2.0 — zero-dependency QR for TOTP enrollment |

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
> TLS setup. Any other host must be real HTTPS — which is what the deployment is for, and the only
> way to test a YubiKey over NFC on a phone.

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
- **Authenticator app (TOTP)**: enroll by QR, then sign in with a six-digit code when the key is
  not to hand. RFC 6238, implemented here rather than pulled in — see below.
- **Recovery codes**: ten single-use codes, shown once, for when the key is lost rather than
  merely elsewhere.

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

## Signing in without the key

A passkey-only account is a one-way door if the key is lost, so there are two ways back in. Both
are **alternatives** to the passkey rather than extra steps on top of it: a YubiKey with a PIN
already proves possession and knowledge, so stacking a code on top would add friction without
adding much security.

### Authenticator app (TOTP)

Enroll from the dashboard, scan the QR with any authenticator app — Google Authenticator, Aegis,
1Password, or a YubiKey itself via Yubico Authenticator — then confirm with a code to prove the
two are in sync. Afterwards, **Use a code** on the sign-in screen takes a username and a code.

RFC 6238 is implemented in `src/lib/otp/` rather than taken from a package: it is about forty
lines, it is the part of this demo worth reading, and a one-digit error in the truncation step
still produces plausible six-digit codes. `npm run test:totp` checks it against the published
vectors in RFC 6238 Appendix B (SHA1, SHA256 and SHA512) and RFC 4648 section 10.

Details that matter more than the algorithm:

- **Secrets are encrypted at rest**, AES-256-GCM, keyed by `APP_ENCRYPTION_KEY`. A TOTP secret
  cannot be hashed the way a password is — the server needs the original bytes every time — so
  encryption is the only option. Without the variable set, development derives a fixed key and
  says so; production refuses to start.
- **A code cannot be replayed.** The time step each accepted code came from is recorded, and a
  code from that step or earlier is refused — otherwise a code glimpsed over a shoulder stays
  usable for the rest of its ~90-second window.
- **Attempts are limited**: five wrong codes locks the account for fifteen minutes. Six digits is
  one in a million and stays valid for a minute and a half, so without this the endpoint is
  brute-forceable. The passkey routes deliberately have no such limit — a signature cannot be
  guessed, so rate limiting there would only be a denial-of-service lever.
- **Enrollment requires a session**, so it is the passkey that authorizes adding a second way in.

### Recovery codes

Ten codes, each usable once, generated from an alphabet with no `I`, `L`, `O`, `U` so nothing is
misread when copied onto paper. They are **hashed, not encrypted** — verifying one only requires
recognizing it. A plain SHA-256 is correct here rather than scrypt or argon2: these are 50-bit
random strings, not human-chosen passwords, so there is no dictionary to run, and hashing lets a
code be found in one indexed lookup instead of running a slow KDF against every stored code.

Signing in with one marks the session as `recovery`, and the dashboard then says so and pushes you
to enroll a replacement passkey. A spent code is rejected with exactly the same message as a wrong
one, so the endpoint never confirms that a guess was once real.

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
    otp/totp.ts                  RFC 6238, verified by scripts/totp-vectors.ts
    otp/recovery-codes.ts        single-use code generation and hashing
    crypto/secret-box.ts         AES-256-GCM for TOTP secrets
    throttle.ts                  attempt limiting for the code routes
    webauthn/rp.ts               per-request RP ID and origin
    webauthn/challenge.ts        server-side, single-use challenges
    webauthn/preferences.ts      ceremony options, validated against allowlists
    aaguid/                      vendored AAGUID → model-name map
    session.ts                   database-backed session cookie
  components/
    auth/, credentials/, debug/, otp/, capability-card.tsx, relying-party-card.tsx
scripts/
  totp-vectors.ts                npm run test:totp
```

`ensureTable()` generates the schema on startup and `verifyTable()` checks the live tables against
it, reporting drift with the fix. After changing a schema in development, delete
`.data/passkeys.db` and let it be recreated — `ensureTable` never alters an existing table.

## Deployment (Vercel + Neon Postgres)

Live at **<https://pksignin.vercel.app>**, on Neon Postgres provisioned through the Vercel
Marketplace.

Switching engines was a change to `src/lib/db/index.ts` and two environment variables — no route
handler, component, or query changed, which is the whole reason the data access goes through
repolayer. Both the passkey and the OTP/recovery suites pass identically on SQLite and on Postgres.

### Reproducing it

```bash
vercel link
vercel integration add neon            # provisions the database and sets DATABASE_URL
npm install pg                         # repolayer's optional peer, imported lazily

node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
vercel env add APP_ENCRYPTION_KEY production
vercel env add PASSKEY_DB_DRIVER production   # value: postgres

vercel deploy --prod
```

`APP_ENCRYPTION_KEY` must stay fixed for the life of an environment — change it and every enrolled
TOTP secret becomes undecryptable.

`PASSKEY_DB_DRIVER` is deliberately **not** set for the `development` environment, so `vercel env
pull` leaves local development on its own SQLite file instead of writing into the deployed
database.

### Two things worth knowing

- **Use the alias, not the deployment URL.** `pksignin.vercel.app` is public; the per-deployment
  URL (`pksignin-<hash>-….vercel.app`) is behind Vercel's deployment protection and redirects to a
  login. It also has a *different hostname*, and a passkey is bound to its RP ID — one registered
  on the alias will not work on the deployment URL, and vice versa.
- **`ensureTable` runs on cold start.** Convenient for a demo that provisions its own schema; for
  anything real, set `PASSKEY_DB_ENSURE_TABLE=false` and let a migration tool own the schema.
  `verifyTable()` still runs and will report drift.

## Testing a YubiKey over NFC on Android

This is what the deployment is for: NFC needs a real HTTPS origin, and `localhost` will not do.

1. Open <https://pksignin.vercel.app> in Chrome on the phone.
2. Check the capability card. It differs from the desktop — that is the point of the card.
3. **Register** → **Create a passkey**. Keep **Prefer a security key** on, or Android will offer to
   save a platform passkey to the screen lock instead of using the YubiKey.
4. Hold the key flat against the back of the phone — the NFC antenna is usually near the top —
   until it buzzes.
5. The credential should list `nfc` among its transports. Open the debug panel to compare the raw
   authenticator response with the one the same key produced over USB: user verification and
   discoverability commonly differ between the two.
6. Sign out and sign in again with the key. Then try **Use a code** and a recovery code, which need
   no key at all.

If the prompt never appears, the phone is probably on the per-deployment URL rather than the alias,
or NFC is switched off.
