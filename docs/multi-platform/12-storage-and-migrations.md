# 12 -- Storage, schema and migrations

> **ID** MP-12 · **Status** Draft · **Depends on** MP-10, MP-11 (types) · **Unblocks** MP-14, 19, 20

**Agent brief.** Define the `SqlDriver` port, the version-1 schema with forward-only migrations, the
repository layer, and implement two drivers (Node, Capacitor/Android) that both pass one
shared conformance test suite. This is the only place SQL may exist in the TypeScript code.

## Context

- Today the schema is created by `backend/monetary/infrastructure/db.py` (recorded in `docs/LIVE_SCHEMA.sql`). There are **no
  migrations**: a schema change means recreating the database. That is acceptable for a pre-release server, **not** for an app
  that lives on people's phones. From this document on, every schema change is a numbered migration.
- Two runtimes need two drivers: Node (server) and Capacitor (native app). The port is async because the Capacitor bridge is.
  There is deliberately **no browser driver**: the web app is server-backed (ADR-0008). The port keeps one possible later without changing the core.
- Local mode data is irreplaceable. Safety (backups before migration, refusing newer databases) is a requirement, not polish.

## Requirements

1. **Port**:

```ts
interface SqlDriver {
  exec(sql: string): Promise<void>;                                   // no params; DDL, PRAGMA
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | undefined>;
  transaction<T>(fn: (tx: SqlDriver) => Promise<T>): Promise<T>;      // BEGIN IMMEDIATE ... COMMIT/ROLLBACK
  close(): Promise<void>;
  readonly info: { engine: string; sqliteVersion: string };
}
type SqlValue = string | number | null;   // integers as number (safe range), no BigInt on the wire
```

2. **Serialized access**: one connection per database; `transaction` takes an in-process mutex so concurrent API
   calls cannot interleave statements. Nested `transaction` calls join the outer one (savepoints optional).
3. **SQLite features required** (check at open, refuse with a clear error if missing): foreign keys, `RETURNING`
   (3.35+), window functions (3.25+), JSON1, `CHECK` constraints, `STRICT` tables optional. Record the minimum
   version; it feeds the Android minSdk decision (MP-20, Q10).
4. **PRAGMAs on open**: `foreign_keys = ON`, `journal_mode = WAL` where the platform supports it (else `DELETE`),
   `synchronous = NORMAL` in WAL, `busy_timeout` set. Documented per driver.
5. **Migrations** (forward-only):
   - Files `packages/core/src/storage/migrations/NNNN_name.sql`, applied in order, each in its own transaction.
   - Table `schema_migrations(version INTEGER PRIMARY KEY, name TEXT, checksum TEXT, applied_at TEXT)`.
     The checksum detects an edited, already-applied migration (fail loudly; never edit shipped migrations).
   - `meta(key TEXT PRIMARY KEY, value TEXT)` holds `instance_id`, `created_with_app_version`, `schema_version`.
   - **Downgrade protection**: if the database's highest applied version is greater than the app knows, refuse to open
     and surface `DatabaseTooNew { dbVersion, appVersion }` to the UI.
   - **Backup before migrating** (local mode): before applying pending migrations to a non-empty database, copy the file
     (`VACUUM INTO` or the platform's file copy) to `pre-migration-<fromVersion>.db`; keep the last 2. Failure to back up aborts the migration.
   - After migrating run `PRAGMA foreign_key_check` and `PRAGMA integrity_check`; failure rolls back and reports.
6. **Schema v1** equals today's schema (see `docs/LIVE_SCHEMA.sql`) with these *proposed* changes (Q2, ADR-0004):
   - Primary keys become `TEXT` UUIDv7 (client-generated), and every foreign key column becomes `TEXT`.
   - Keep all `CHECK` constraints (account types, subtypes, entry types, status, posting debit/credit rule, `statement_day`, etc.).
   - `session` stays but is only used by the server driver path; local mode never creates sessions.
   - Add `meta`, `schema_migrations`.
   - Add composite indexes that reports need (`posting(account_id, journal_entry_id)`, `journal_entry(entry_date, status)`); the spike
     decides the exact set with the 50k-entry benchmark (MP-26).
   - Add DB-level invariants where SQLite can express them (e.g. `CHECK`s, triggers that forbid updating a posted entry's postings in STRICT-compatible ways are **not** added in v1 because DIRECT mode edits in place).
7. **Repositories** (`core/storage/*.ts`): typed functions only; they map rows <-> domain objects (snake_case columns <-> camelCase fields in one mapper per table).
8. **Reports and aggregates run in SQL** inside the database process (sums, group-bys); never pull 50k rows across the Capacitor bridge to sum them in JS.
9. **Conformance suite** `packages/core/src/storage/conformance/` -- one set of tests that every driver must pass: CRUD, constraints
   (insert a non-balanced posting -> CHECK fails), transactions (rollback on throw), nested transactions, concurrency (parallel
   calls serialize), migration apply/idempotency/checksum mismatch, downgrade refusal, `foreign_key_check`, large batch insert, unicode, integer round-trip at 2^53-1.

## The two drivers

| Package | Runtime | Engine | Notes |
|---|---|---|---|
| `sqlite-node` | Node server | `node:sqlite` or `better-sqlite3` (**decide in spike**, ADR-0003) | Sync under the hood; wrap in promises. Prefer no native addon if `node:sqlite` is stable enough at the time **(verify)**. Backup with `VACUUM INTO` or the backup API. |
| `sqlite-capacitor` | Android now, iOS later | Native plugin | Either a maintained FOSS Capacitor SQLite plugin **or** a small in-repo plugin over Android's framework SQLite **(decide in spike)**. Constraint: no proprietary code, F-Droid-buildable, 16 KB page-size safe if it ships native libs. The framework's SQLite version varies by Android release; if it is below the required minimum, bundle SQLite via a FOSS AAR or raise minSdk. |

The Capacitor driver must expose **batch** calls (many statements in one bridge round-trip) because each bridge call has overhead.

## Tasks

- [ ] Define `SqlDriver`, `SqlValue`, error types (`SqlConstraintError`, `DatabaseTooNew`, `MigrationError`) in `core/storage/ports.ts`.
- [ ] Write the migration runner (pure, driver-agnostic) with tests using a fake driver.
- [ ] Write migration `0001_init.sql` (schema v1) and a test comparing it to `docs/LIVE_SCHEMA.sql` structurally (same tables/columns/CHECKs apart from the declared id-type change).
- [ ] Implement repositories alongside the services they serve (MP-11 rows 9-13).
- [ ] Implement the conformance suite.
- [ ] Implement `sqlite-node`; pass conformance.
- [ ] Implement `sqlite-capacitor` (after the spike picks the approach); pass conformance on an emulator (instrumented or via a Capacitor test harness page).
- [ ] Implement pre-migration backup, `DatabaseTooNew` handling and `integrity_check`.
- [ ] Write `docs/multi-platform/schema-v1.sql` as the human-readable copy and update `docs/LIVE_SCHEMA.sql` **only when** the TS schema becomes the live one (AGENTS.md rule 7: it is the only copy of the schema SQL).
- [ ] Document the performance numbers from the benchmark (50k entries) in the PR.

## Acceptance criteria

- Both drivers pass the identical conformance suite.
- Opening a database created by a newer app version fails with `DatabaseTooNew` and leaves the file untouched.
- Editing a shipped migration file makes the checksum test fail.
- Interrupting a migration (simulated throw) leaves the previous schema and data intact.
- Dashboard report on a 50k-entry database meets the budget in MP-22 on a mid-range Android device (target set by the spike).
- `grep -rn "SELECT\|INSERT\|UPDATE\|DELETE" packages --include=*.ts` outside `core/storage` and tests finds nothing (boundary rule).

## Files you may touch

`packages/core/src/storage/**`, `packages/sqlite-*/**`, `docs/multi-platform/schema-v1.sql`, tests.
`docs/LIVE_SCHEMA.sql` only per the task above.

## Out of scope

Encryption at rest (Q12), sync tables, multi-currency tables, ORM adoption (use plain SQL; an ORM adds weight on mobile).

## Verification

```bash
npm test -w @monetary/core -- storage
npm test -w @monetary/sqlite-node
./apps/mobile/scripts/run-driver-conformance.sh   # emulator, added by MP-20
```
