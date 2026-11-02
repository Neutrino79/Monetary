# 02 -- Open questions for the owner

> **ID** MP-02 · **Status** Draft · **Depends on** -- · **Unblocks** accuracy of every other document

**Agent brief.** Every item below is a decision the owner has not confirmed. Each has a **default**
that the other documents already assume. Build to the default unless the owner changes it here. If you
are about to build something that depends on an unconfirmed item *and is hard to undo* (the schema, the
API contract, the license, the application id), stop and ask instead.

All 15 original questions were answered on 2026-11-02 (Q9 and Q16 earlier the same day). Open follow-ups: the Android application id (Q8) and every item still tagged *(verify)* in the work packages.

| # | Question | Default assumed | Why it matters | Affects | Owner decision |
|---|---|---|---|---|---|
| Q1 | Replace the Python backend with the TypeScript core (Python stays frozen at `backend/` until parity, then is deleted)? | **Yes.** | Only way to have one ledger implementation that runs on-device. | ADR-0001, MP-11..14 | **Yes (2026-11-02)** |
| Q2 | Use client-generated UUIDv7 ids (text) instead of integer autoincrement? | **Yes**, in API v1. | Needed for import/export merge, offline creation and later sync. Breaks the numeric-id wire format (web types change). | ADR-0004, MP-12, MP-13 | **Confirmed (2026-11-02)**: UUIDv7 ids |
| Q3 | Keep both ledger modes (STRICT and DIRECT) exactly as today? | **Yes, port both unchanged.** Improvements are separate later work. | Parity first. An append-only-only ledger would enable undo and sync but changes behavior. | MP-11 | **Yes (2026-11-02)**: port both modes unchanged |
| Q4 | Cloud mode: online-only at first, sync designed for later? | **Yes.** | Sync is a large project; v1 cloud = the app reads/writes the server. | MP-00, MP-15 | **Yes (2026-11-02)**: online-only first, sync later |
| Q5 | One user per server (single owner, as today) or multi-user? | **Single owner.** | Multi-user changes auth, schema and the whole API. | MP-13, MP-14 | **Yes (2026-11-02)**: single owner |
| Q6 | Multi-currency on the roadmap? | **Later, not v1.** Keep `currency` fields. | Affects money formatting and reports. | MP-11 | **Later (2026-11-02)**: not in v1 |
| Q7 | License | **Apache-2.0** (alternative: MIT). Not AGPL/GPL. | Store distribution compatibility and patent grant. The repo is currently proprietary; relicensing needs the owner's decision as copyright holder. | ADR-0005, MP-24 | **Yes (2026-11-02)**: Apache-2.0 (applying it is an owner-only legal act, MP-24) |
| Q8 | Public project name and Android application id (permanent once published on Play) | Name **Monetary**; id **TBD** (e.g. `io.github.neutrino79.monetary` or an owned domain) | The id cannot change after publishing. Check trademark/name clashes. | MP-20, MP-23, MP-24 | **Name: Monetary (2026-11-02).** The Android application id is still to be chosen before the first store upload (it is permanent) |
| Q9 | Ship web local mode (browser database)? | **No.** Web is server-backed only. "Local" on web means running the server on your own computer and opening `http://localhost:8000`. | Removes the browser-database driver, storage-eviction risk and a test matrix. | MP-00, MP-12, MP-17 | **Decided 2026-11-02 (owner):** web is used locally by running the server on your own computer (localhost), with the option to enter a server URL manually, exactly like the Android connect flow. Recorded from the owner's answer "ship it as local use, with an option to add a manual cloud connection"; if an in-browser database was meant instead, say so and ADR-0008 is revisited |
| Q10 | Android minimum version (minSdk) | **API 26 (Android 8)**, final value set by the spike. | Affects bundled SQLite version, WebView, user reach. | MP-20, MP-26 | **Yes, as required (2026-11-02)**: the spike sets the final minSdk |
| Q11 | F-Droid signing: let F-Droid sign, or reproducible build signed with the project key? | **Reproducible build, project key** (so GitHub and F-Droid APKs update each other). Verify feasibility. | If F-Droid signs, GitHub and F-Droid builds cannot update each other. | MP-23 | **Yes (2026-11-02)**: reproducible build, project key |
| Q12 | Optional database encryption at rest (SQLCipher)? | **Not in v1**; rely on OS file-based encryption + optional app lock. Revisit. | Native dependency, F-Droid and 16 KB alignment impact. | MP-18 | **Yes (2026-11-02)**: no SQLCipher in v1 |
| Q13 | Who holds the Play developer account and the release signing key? | Owner personally. | Account type affects Play's testing requirements (verify). | MP-23 | **Yes (2026-11-02)**: owner holds the Play account and signing key |
| Q14 | Keep the `v0.5` Python API running anywhere during migration? | **No**; it is only a fixture source. | Avoids dual maintenance. | MP-22 | **Yes (2026-11-02)**: v0.5 is only a fixture source |
| Q15 | Password hashing in the Node server | **scrypt** from Node's built-in crypto (no native dependency). | Avoids a native addon on the server and keeps the Docker image simple. | MP-14, MP-18 | **Yes (2026-11-02)**: scrypt |
| Q16 | May the repository be restructured freely (including `web/` and `backend/`)? | **Yes.** `web/` -> `apps/web/`, new `apps/server`, `apps/mobile`, `packages/*`; `backend/` stays until deleted at M9. | Cleaner end state; history kept through pure `git mv` PRs. | MP-10 | **Decided 2026-11-02 (owner)** |

## How decisions are recorded

1. The owner answers in the table (or tells an agent, who edits this file in a docs PR).
2. If the answer changes an *Accepted* ADR or creates a new big decision, add or update an ADR in `adr/`.
3. Update the documents listed under **Affects** in the same PR.
