import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import {
  createRepo,
  type CreateRepoConfig,
  type IdStrategy,
  type Repo,
  type Schema,
  type TimestampOptions,
} from "repolayer";
import {
  challengeSchema,
  credentialSchema,
  recoveryCodeSchema,
  sessionSchema,
  throttleSchema,
  totpSchema,
  userSchema,
  type Challenge,
  type Credential,
  type RecoveryCode,
  type Session,
  type Throttle,
  type TotpEnrollment,
  type User,
} from "./schema";

export interface Db {
  users: Repo<User>;
  credentials: Repo<Credential>;
  challenges: Repo<Challenge>;
  sessions: Repo<Session>;
  totp: Repo<TotpEnrollment>;
  recoveryCodes: Repo<RecoveryCode>;
  throttles: Repo<Throttle>;
}

/**
 * The swap point. Everything above this file talks to `Repo<T>` and cannot tell which engine
 * is underneath, so moving off SQLite is a change to these few lines and nothing else.
 *
 * SQLite is the default because it needs no setup and lives in a file. It cannot be the
 * answer on Vercel, whose filesystem is read-only — set PASSKEY_DB_DRIVER=postgres and
 * DATABASE_URL there, and `npm install pg` (an optional peer dependency that repolayer
 * imports lazily, so a SQLite-only install never needs it).
 */
const driver = process.env.PASSKEY_DB_DRIVER === "postgres" ? "postgres" : "sqlite";

/**
 * Kept statically scoped to a `.data` subfolder. Resolving a fully dynamic path against
 * `process.cwd()` makes Turbopack trace the entire project into the server bundle, since it
 * cannot tell a runtime data path from a module it should include. PASSKEY_DB_FILE is still an
 * escape hatch for a database outside the repo, and is used verbatim.
 */
const dbName = process.env.PASSKEY_DB_NAME ?? "passkeys.db";
const dbFileOverride = process.env.PASSKEY_DB_FILE;

function sqliteFilePath(): string {
  return dbFileOverride ?? join(process.cwd(), ".data", dbName);
}

/**
 * `ensureTable` is a CREATE TABLE IF NOT EXISTS generated from the schema, which is what
 * makes this demo runnable with no migration step. It is explicitly not a migration engine:
 * it never alters an existing table, so a schema change during development means deleting
 * the db file. `verifyTable()` below is what catches that having happened.
 */
const ensureTable = process.env.PASSKEY_DB_ENSURE_TABLE !== "false";

function connectionFor(): CreateRepoConfig<unknown> {
  if (driver === "postgres") {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "PASSKEY_DB_DRIVER=postgres requires DATABASE_URL. See README, Phase 2.",
      );
    }
    return { driver: "postgres", connection: { connectionString } } as CreateRepoConfig<unknown>;
  }

  const file = sqliteFilePath();
  mkdirSync(dirname(file), { recursive: true });
  return { driver: "sqlite", connection: { file } } as CreateRepoConfig<unknown>;
}

async function makeRepo<T>(
  table: string,
  schema: Schema,
  options: { ids?: IdStrategy; timestamps?: boolean | TimestampOptions } = {},
): Promise<Repo<T>> {
  return createRepo<T>({
    ...connectionFor(),
    table,
    schema,
    ensureTable,
    ...options,
  } as CreateRepoConfig<T>);
}

async function open(): Promise<Db> {
  // Sequential rather than Promise.all: SQLite takes one writer at a time, and four
  // concurrent CREATE TABLEs on one connection buy nothing.
  const users = await makeRepo<User>("users", userSchema, { timestamps: true });
  const credentials = await makeRepo<Credential>("credentials", credentialSchema, {
    // The authenticator owns the credential ID, so nothing here may generate one.
    ids: "provided",
    timestamps: true,
  });
  const challenges = await makeRepo<Challenge>("challenges", challengeSchema);
  const sessions = await makeRepo<Session>("sessions", sessionSchema, {
    // A 256-bit random token, not a UUID: this value is the bearer of the session.
    ids: "provided",
    timestamps: { createdAt: "createdAt", updatedAt: false },
  });

  const totp = await makeRepo<TotpEnrollment>("totp", totpSchema, {
    // Keyed by user id, so the caller supplies it.
    ids: "provided",
    timestamps: true,
  });
  const recoveryCodes = await makeRepo<RecoveryCode>("recovery_codes", recoveryCodeSchema, {
    timestamps: { createdAt: "createdAt", updatedAt: false },
  });
  const throttles = await makeRepo<Throttle>("throttles", throttleSchema, {
    ids: "provided",
    timestamps: { createdAt: false, updatedAt: "updatedAt" },
  });

  const db: Db = {
    users,
    credentials,
    challenges,
    sessions,
    totp,
    recoveryCodes,
    throttles,
  };
  await verify(db);
  return db;
}

/**
 * Reads the live tables out of SQLite's own catalog and reports where they disagree with the
 * schemas. Worth doing at startup: after a schema edit, `ensureTable` leaves the old table in
 * place and every affected query fails later with something far less obvious than this.
 */
async function verify(db: Db): Promise<void> {
  for (const repo of Object.values(db)) {
    const diff = await repo.verifyTable();
    if (diff.ok) continue;
    for (const finding of diff.findings) {
      console.error(`[db] ${finding.severity}: ${finding.message}`);
    }
    console.error(
      `[db] Table "${diff.table}" no longer matches its schema. ` +
        `In development the fix is usually to delete ${sqliteFilePath()} and let it be recreated.`,
    );
  }
}

/**
 * Cached on globalThis, not just in a module local: a dev-server hot reload re-evaluates the
 * module, and a fresh set of repos per reload would leak SQLite connections until restart.
 */
const globalForDb = globalThis as unknown as { __passkeyDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  globalForDb.__passkeyDb ??= open();
  return globalForDb.__passkeyDb;
}
