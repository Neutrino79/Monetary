# ADR 0003: SQL driver port, forward-only migrations, two drivers

- Status: **Proposed**
- Date: 2026-11-02
- Deciders: repository owner

## Context

The core must run on Node (server) and in a native shell (Android, later iOS). Each has a different SQLite binding, and the native one is asynchronous.
The current backend has no migrations; that is unacceptable for databases living on user devices.

## Decision

1. The core depends only on an async `SqlDriver` **port** (see MP-12). All SQL lives in `packages/core/src/storage/`.
2. Two drivers implement it: `sqlite-node` (server) and `sqlite-capacitor` (native plugin). One **conformance suite** must pass on both. There is no browser driver: the web app is server-backed (ADR-0008); the port keeps one possible later.
3. **Forward-only numbered migrations** with checksums, a `schema_migrations` table, a pre-migration backup (local mode), integrity checks, and refusal to open a database newer than the app.
4. Plain SQL, no ORM.
5. Aggregations run inside SQLite, not in JavaScript over transferred rows.
6. Open choices to settle in the spike: Node driver (`node:sqlite` vs `better-sqlite3`, S9) and Android plugin (community plugin vs small in-repo plugin, S1/S8).

## Consequences

- (+) The core is testable with a fast in-memory driver; drivers are swappable; a driver bug is caught by the shared suite.
- (+) Safe app updates: migrations are tested, backed up, and downgrade-protected.
- (-) Async everywhere (services are `async`), a one-time cost in porting.
- (-) We own migration discipline: never edit a shipped migration (checksum test enforces it).
- (-) Two drivers to maintain; mitigated by the conformance suite and by keeping each driver thin.

## Alternatives considered

- **ORM (Drizzle/Kysely/Prisma)**: adds weight and bridge-incompatibilities on mobile; type-safety benefits are partly offset by the contract schemas; rejected for v1 (a query builder like Kysely may be revisited).
- **Sync-only driver port**: impossible for the Capacitor bridge.
- **Different schema per platform**: breaks parity and import/export; rejected.
- **No migrations (recreate DB)**: data loss on update; rejected.

## Verification / revisit when

Spike S1-S3, S9. Revisit if a driver cannot pass the conformance suite or the bridge overhead blows the budget.
