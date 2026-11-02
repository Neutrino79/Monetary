# 19 -- Backup, export and import

> **ID** MP-19 · **Status** Draft · **Depends on** MP-11, MP-12 · **Unblocks** safe mode switching (MP-17), trust in local mode

**Agent brief.** Build the portable **Monetary Archive** export/import, a human-readable CSV export, and the backup reminders. This
is what makes local mode safe (phones get lost or are reset) and what lets a user move between local and cloud without
losing history. Import must be all-or-nothing and must refuse to produce an unbalanced ledger.

## Context

Local data has no server to restore from, so backup is a **core feature**, not an extra. The same archive moves data local -> cloud,
cloud -> local, and between app versions. UUID ids (Q2) make import straightforward: ids are preserved, references stay valid.

## The Archive format (`*.monetary.json`, optionally gzip as `*.monetary.json.gz`)

```json
{
  "format": "monetary-archive",
  "formatVersion": 1,
  "exportedAt": "2026-11-02T08:30:00Z",
  "app": { "version": "1.0.0", "schemaVersion": 1, "apiVersion": 1 },
  "instanceId": "0193...",
  "owner": { "name": "...", "email": "...", "timezone": "Asia/Kolkata", "homeCurrency": "INR", "ledgerMode": "DIRECT" },
  "accounts": [ { "id": "...", "name": "...", "type": "ASSET", "currency": "INR", "...": "..." } ],
  "entries":  [ { "id": "...", "type": "NORMAL", "date": "2026-10-12", "description": "...", "postings": [ { "account": "...", "debit": 0, "credit": 12000 } ], "tags": ["goa"], "...": "..." } ],
  "tags": [ "goa", "work" ],
  "checksum": { "algorithm": "sha-256", "value": "..." }
}
```

Rules: money as integer points; ids as strings; timestamps UTC ISO-8601; dates as stored; arrays ordered by `(date, createdAt, id)`; the checksum covers
the canonical JSON of everything except `checksum`. The **password hash, security answer hash and sessions are never exported**.
`formatVersion` changes only when the shape breaks; older versions stay importable forever via small upgraders.

## Requirements

1. **Export** (`GET /export` -> archive; in-process and on the server): one consistent snapshot inside a read transaction. Streaming for large ledgers (50k+ entries must not need 2x memory spikes beyond a reasonable bound; measure in the spike).
2. **Import** (`POST /import`): allowed only when the target ledger is **empty** (no accounts besides seeded defaults the importer can replace; define precisely: a database with zero entries and an uninitialized-or-fresh owner). Otherwise `409 ConflictError`. Merge-import is a later feature.
3. Import is **atomic**: validate the whole archive first (schema via `contract`, checksum, referential integrity, every entry balances, currency consistency, enum values, tag rules, no future-dated entries that the API forbids -- or document the relaxation), then insert in one transaction. Any failure -> nothing written, with an error listing the first N problems and their paths.
4. Importing preserves ids, `createdAt`, `updatedAt` and `correctionOf`/`replacedBy`/`refundOf` links. The target keeps its own `instanceId` unless the target is empty and the archive owner chose "restore as same dataset" (default: new instance id, store `importedFromInstanceId` in `meta`).
5. **Version handling**: refuse an archive with `formatVersion` greater than supported (`ArchiveTooNew`); upgrade older ones in code; refuse an archive whose `schemaVersion` is newer than the app's schema (`DatabaseTooNew`-style message).
6. **Owner credentials after import**: in cloud mode the importer must set a password (the archive has none); in local mode none is needed. Spell this out in the UI.
7. **CSV export** (transactions only, for spreadsheets): UTF-8 with BOM option, one row per entry (not per posting), columns: date, type, description, memo, category, account, to-account, amount, currency, friend, tags, status, id. Dates ISO; amounts as decimal strings (no scientific notation); guard against CSV injection by prefixing cells that start with `= + - @` with a single quote.
8. **Raw database backup** (local mode on Android): `VACUUM INTO` a temp file then hand it to `Platform.files.save`. On the server: the CLI backup of MP-14. Restoring a raw DB is documented but is a power-user path; the supported route is the archive.
9. **Save/share UX**: Android uses the system file picker (Storage Access Framework) so no storage permission is needed; web uses the download API (or the File System Access API where available). Suggested file name `monetary-backup-YYYY-MM-DD.monetary.json`.
10. **Backup reminders**: in local mode show a gentle reminder when the last export is older than 30 days and there are > N new entries; track `lastExportAt` in `Platform.kv`. The reminder is dismissible and never nags more than once a week.
11. **Round-trip guarantee**: export -> import into an empty ledger -> export again yields an archive whose canonical content (ignoring `exportedAt` and `instanceId`) is byte-identical.
12. **Cross-engine guarantee**: an archive exported by the Node server imports in the Android app, and vice versa.

## Tasks

- [ ] Define the archive schema in `packages/contract` (`ArchiveV1`) with canonical JSON + checksum helpers.
- [ ] Implement `exportArchive` and `importArchive` in `core/application` (+ SQL in `core/storage`), with the atomic validate-then-write flow.
- [ ] Expose `GET /export`, `POST /import` (cloud auth required; local-trusted in-process) in `api`; add to OpenAPI.
- [ ] CSV exporter with injection guard and tests (unicode, commas, quotes, newlines).
- [ ] Round-trip, tamper (checksum), unbalanced-entry, missing-reference, wrong-version, non-empty-target tests.
- [ ] Platform file save/pick implementations (web + Capacitor).
- [ ] UI: Settings > Data & connection: *Export data*, *Import data*, *Export CSV*, last-backup line, reminder banner.
- [ ] Benchmark export/import at 50k entries; record numbers in the PR.
- [ ] Document the format in `docs/archive-format.md` (user + developer facing).

## Acceptance criteria

- Round-trip test passes (requirement 11); cross-engine test passes in CI (server archive -> in-process import).
- A hand-edited archive with a broken balance is rejected and leaves the database untouched.
- Importing into a non-empty ledger returns 409 and changes nothing.
- CSV opens correctly in a spreadsheet and a cell beginning with `=` is neutralized.
- No hash, token or session data appears in any export (test).
- A 50k-entry export/import completes within the budget set in MP-22 without exceeding the memory bound on a mid-range phone.

## Files you may touch

`packages/contract/src/archive*`, `packages/core/src/application/archive*`, `packages/core/src/storage/archive*`, `packages/api/src/routes/archive*`, `apps/web/src/features/data/**`, `apps/web/src/platform/**` (files), `docs/archive-format.md`, tests.

## Out of scope

Merge-import, partial/selective export, encrypted archives (later), import from other apps (CSV import, bank formats), cloud sync.

## Verification

```bash
npm test -w @monetary/core -- archive && npm test -w @monetary/api -- archive && npm run test:parity
```
