# 00 -- Vision and scope

> **ID** MP-00 · **Status** Draft · **Depends on** -- · **Unblocks** everything

**Agent brief.** This document defines what we are building and what we are not. Use it to settle
scope arguments: if a task is not needed for a goal below, or is listed under non-goals, do not build
it. Use the glossary for the vocabulary every other document assumes.

## Vision

Monetary is a private, open-source personal expense tracker with a real double-entry ledger. A person
can install it on their phone and use it fully offline, or point it at a server they host and use the
same data from web and phone. Nobody has to trust a third party with their finances: there is no
Monetary-run cloud, no account with us, no telemetry.

## Goals (v1)

1. **Web and Android apps from one React UI**, with the web app unchanged in look and behavior.
2. **Local mode**: on-device storage, offline, no server required, on both web and Android.
3. **Cloud mode**: connect to a user-hosted server by entering and validating its URL; sign in.
4. **One implementation of the ledger rules** that runs identically in local and cloud mode, so a
   report never differs between the phone and the server.
5. **Open source, distributable through F-Droid, GitHub Releases and Google Play** from a single
   reproducible build.
6. **iOS-ready architecture**: no decision in v1 may make an iOS app expensive later.
7. **Safe data handling**: versioned database migrations, user-controlled backup/export, no data loss
   when updating the app.

## Non-goals for v1

- Syncing one dataset between several devices **without a server** (peer-to-peer).
- Merging offline edits from several devices (true multi-device sync). The data model is
  *sync-ready* (see [`01-architecture.md`](01-architecture.md#sync-readiness)); the protocol is not built.
- Multiple users per server, sharing a ledger, roles and permissions.
- Multiple currencies inside one ledger (the owner has one home currency; foreign-currency accounts
  are a later feature). Do not remove `currency` fields; just do not build exchange logic.
- A hosted/managed Monetary cloud, accounts with us, telemetry, ads, analytics.
- Bank-feed imports, receipt scanning, push notifications.
- A native (Kotlin/Swift) or React Native UI. See [`adr/0002-capacitor-ui-shell.md`](adr/0002-capacitor-ui-shell.md).
- Redesigning the UI. UI work in this plan is only what multi-platform support requires.

## Support matrix

| | Web | Android | iOS (later) |
|---|---|---|---|
| **Local mode** | Yes. SQLite in the browser's private file system (OPFS). Caveat: browsers can evict site data, so export reminders are mandatory. | Yes. SQLite on the device. | Yes, same design as Android. |
| **Cloud mode** | Yes. Web app served by (or pointed at) the user's server. | Yes. | Yes. |
| Install | Static site / served by the self-hosted server | F-Droid, GitHub APK, Google Play | App Store (needs a permissive license, see MP-24) |

Local mode on the web is a deliberate decision to *ship* it, because it is the same code as Android
local mode and doubles as a try-before-you-host demo. If the owner prefers web = cloud only, disable it
with one flag; see [`02-open-questions.md`](02-open-questions.md).

## Principles

1. **One source of truth for ledger rules.** They live in `packages/core`. The UI holds no ledger
   logic (existing repo rule, kept).
2. **Local and cloud are the same code path.** The only difference is which `Transport` the client uses
   and where the SQLite file lives. Never write `if (mode === "local")` in feature code.
3. **Behavior parity first, improvements later.** The TypeScript port must reproduce the Python
   backend's results before anyone changes behavior. Improvements are separate, reviewed changes.
4. **Contract first.** The API schema is the shared language between server, client and tests.
5. **The user owns their data.** Every mode can export everything; no feature may lock data in.
6. **Boring, FOSS-only dependencies.** Anything in the Android build must be open-source and buildable
   from source (F-Droid rule). No Google Play Services, no proprietary SDKs, no analytics.
7. **Small, reviewable PRs.** One logical change each, following `AGENTS.md`.
8. **Fail loudly on version mismatch.** An old app must refuse a newer database; an incompatible
   server must be rejected at connect time with a clear message.

## Success criteria for v1

- A new user installs the Android app, picks *Use on this device*, records transactions in airplane
  mode and sees correct dashboard and reports.
- A user runs the Docker image, opens the Android app, picks *Connect to my server*, enters the URL, sees
  the server validated and signs in; the same ledger shows on the web.
- The recorded parity scenarios give the same results from the TypeScript core as from the current
  Python backend (within the declared exceptions in MP-22).
- A signed APK is attached to a GitHub Release, the same source builds on F-Droid's infrastructure, and the
  Play listing passes review.
- The repository can be made public with a clean audit (MP-24).

## Glossary

| Term | Meaning |
|---|---|
| **Core** | `packages/core`: domain rules, application services, SQL store. Pure TypeScript, no DOM, no Node-only APIs. |
| **API app** | `packages/api`: a [Hono](https://hono.dev)-style `fetch(Request) -> Response` handler that exposes core over the `/api/v1` HTTP contract. Needs no socket. |
| **Transport** | Client-side interface that sends an API request and returns a response. Two implementations: HTTP and in-process. |
| **Local mode** | Client uses `InProcessTransport`; the API app runs inside the app over an on-device SQLite file. |
| **Cloud mode** | Client uses `HttpTransport` to a user-hosted server running the API app on Node. |
| **Profile** | A saved connection: either `local`, or `cloud` with a base URL. Holds the session token for cloud. |
| **Driver** | An implementation of the SQL driver port for one runtime (Node, browser WASM, Android). |
| **Parity** | The TypeScript core returns the same results as the legacy Python backend for the recorded scenarios. |
| **Shell** | The native wrapper (Capacitor) that hosts the web UI on a mobile OS. |
| **Points** | Money stored as integer minor units (2 decimals today), as in the current backend. |
| **STRICT / DIRECT** | The owner's ledger mode: STRICT posts a correcting entry on edit; DIRECT edits in place. Both are ported as-is. |
| **Archive** | The portable export file described in MP-19. |
