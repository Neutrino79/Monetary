# Multi-platform Monetary: web + Android (+ iOS later), local and cloud

This folder is the complete plan for turning Monetary into an open-source app that runs on **web and
Android today, iOS later**, where every platform supports two data modes:

- **Local mode** -- everything lives on the device. No server, no account, works offline.
- **Cloud mode** -- the app talks to a Monetary server the user hosts themselves. The user types the
  server URL, the app validates it, then signs in.

It is written so that a human or an AI agent can pick **one document**, build **that part**, and
know exactly what it depends on, what "done" means and what is out of scope.

> **Status of this plan: owner-reviewed draft.** Nothing here is implemented. On 2026-11-02 the owner answered all
> open questions ([`02-open-questions.md`](02-open-questions.md)): TypeScript core (Python replaced), UUIDv7 ids, both ledger
> modes ported unchanged, single owner, online-only cloud first, Apache-2.0, name "Monetary", reproducible signed builds.
> ADRs 0001, 0002, 0004, 0005, 0006 and 0008 are **Accepted**; 0003 and 0007 stay *Proposed* until the spike confirms them.
> Still open: the Android application id (Q8) and every **(verify)** item. React + Capacitor is **decided**, and so are two owner decisions of 2026-11-02: the web app has **no in-browser database** (it always talks to a server, which can run on the user's own computer), and **any folder may be restructured** where it makes the result cleaner ([`adr/0008`](adr/0008-web-server-backed-and-repo-restructure.md)).

## The idea in one paragraph

Today the ledger logic lives in a Python/FastAPI backend and the React web app only displays what the
API returns. To let the same app run with *no backend* on a phone, that logic must be able to run
*inside the app*. So we rewrite the ledger core once in TypeScript and wrap it in a small HTTP-shaped
API (`fetch` handler). **Cloud mode** runs that API in a Node server the user hosts. **Local mode**
runs the very same API in-process on the device, over an on-device SQLite database. The React UI
cannot tell the difference: it just sends requests through a `Transport` that is either HTTP or an
in-process call. Capacitor wraps the one React UI as the Android (and later iOS) app.

**The web app is server-backed only.** There is no browser database. A web user who wants "local" use runs the
Monetary server on their own computer (Docker or Node) and opens the UI at `http://localhost:8000`; that is simply
cloud mode pointed at a local server. True on-device storage is a native-app feature (Android now, iOS later).

```text
                       one React UI  (apps/web/)
                              |
                  packages/client  (Transport)
                 /                            \
        HttpTransport                    InProcessTransport
    (web, Android, iOS)                (Android / iOS only)
              |                                   |
     user-hosted Node server              runs inside the app
     (apps/server/ + packages/api)             (packages/api, same code)
              \                                   /
                       packages/core  (ledger rules, services)
                              |
                      SQL driver port
        node:sqlite / better-sqlite3 (server)   |   native SQLite plugin (mobile app)
```

## How to use this folder (agents: read this)

1. Read [`00-vision-and-scope.md`](00-vision-and-scope.md) and [`01-architecture.md`](01-architecture.md)
   once. They are short and set the vocabulary.
2. Read [`27-agent-playbook.md`](27-agent-playbook.md): repo rules (from `AGENTS.md`), PR slicing, what
   "done" means.
3. Pick **one** work-package document from the table below whose dependencies are met. Read only
   that document plus the ones it lists under *Depends on*.
4. Build exactly what its **Tasks** list says, satisfy its **Acceptance criteria**, stay inside its
   **Files you may touch**. If something is ambiguous, check [`02-open-questions.md`](02-open-questions.md)
   and the [`adr/`](adr/); if still unsure, stop and ask the owner. Do not guess on anything
   irreversible, anything touching persisted data or the public API.
5. When you finish, update the document's **Status** line and tick its checklist in the same PR.

## Work packages

| ID | Document | What it covers | Depends on |
|---|---|---|---|
| 00 | [Vision and scope](00-vision-and-scope.md) | goals, non-goals, support matrix, principles, glossary | -- |
| 01 | [Architecture](01-architecture.md) | packages, layering rules, request flow, data ownership | 00 |
| 02 | [Open questions](02-open-questions.md) | decisions the owner must confirm, with defaults | -- |
| 10 | [Monorepo and tooling](10-monorepo-and-tooling.md) | workspaces, TS config, boundaries, CI, scripts | 01 |
| 11 | [Core: domain and services](11-core.md) | port Python ledger logic to TypeScript | 10, 22 |
| 12 | [Storage and migrations](12-storage-and-migrations.md) | SQL driver port, schema v1, migrations, 2 drivers (Node, Capacitor) | 10, 11 |
| 13 | [API contract](13-api-contract.md) | `/api/v1`, schemas, OpenAPI, handshake, errors | 11 |
| 14 | [Server and cloud mode](14-server-cloud-mode.md) | self-hosted Node server, Docker, config, ops | 12, 13 |
| 15 | [Client and transports](15-client-and-transports.md) | `Transport`, profiles, query-cache rules | 13 |
| 16 | [UI platform layer](16-ui-platform-layer.md) | `Platform` port, fonts, storage, back button, safe areas | 15 |
| 17 | [Onboarding and modes](17-onboarding-and-modes.md) | mode picker, URL validation, switching modes | 15, 16 |
| 18 | [Security and privacy](18-security-and-privacy.md) | threat model, tokens, TLS, app lock, hardening | cross-cutting |
| 19 | [Backup, export, import](19-backup-export-import.md) | archive format, CSV, local->cloud move | 11, 12 |
| 20 | [Android app](20-android-app.md) | Capacitor project, SQLite plugin, build, release config | 12, 16, 17 |
| 21 | [iOS readiness](21-ios-readiness.md) | rules that keep iOS cheap later; the later iOS task list | cross-cutting |
| 22 | [Testing and parity](22-testing-and-parity.md) | fixture recorder, parity harness, driver conformance, e2e | -- (starts first) |
| 23 | [Distribution](23-distribution.md) | F-Droid, GitHub Releases, Google Play, signing, versions | 20 |
| 24 | [Open-source readiness](24-open-source-readiness.md) | license, governance, audits, repo hygiene | -- (start now) |
| 25 | [Roadmap](25-roadmap.md) | milestones, exit criteria, parallel lanes | all |
| 26 | [Spike plan](26-spike-plan.md) | the 1-2 week de-risking experiments and pass/fail bars | 00-01 |
| 27 | [Agent playbook](27-agent-playbook.md) | working agreement for agents and contributors | -- |
| ADR | [Decision records](adr/README.md) | why each big choice was made | -- |

## Dependency picture

```text
22 fixtures --> 11 core --> 12 storage --> 14 server ----+
                   |            |                        |
                   +--> 13 contract --> 15 client --> 16 platform --> 17 onboarding --> 20 android --> 23 distribution
                   +--> 19 backup/export                 ^
10 tooling (first) ... 18 security (always) ... 24 OSS readiness (any time) ... 26 spike (before 11 starts)
```

Parallel lanes an owner can hand to different agents once the spike passes are in
[`25-roadmap.md`](25-roadmap.md#parallel-lanes).

## Paths: target layout

Documents use the **target** repository layout. The restructure is the first step of [`10-monorepo-and-tooling.md`](10-monorepo-and-tooling.md); until that PR merges, read the paths like this:

| In these docs | Today |
|---|---|
| `apps/web/` | `web/` |
| `apps/server/`, `apps/mobile/`, `packages/*` | do not exist yet |
| `backend/` | `backend/` (unchanged; frozen legacy, deleted at milestone M9) |

## Conventions used in every document

Every work-package document starts with a status block and ends with the same sections, so agents can
scan them quickly:

- **Status block**: `ID`, `Status` (Draft / Ready / In progress / Done), `Depends on`, `Unblocks`.
- **Agent brief**: three sentences telling an agent what to build.
- **Context and decisions**, **Requirements**, **Design**, **Tasks** (checklist), **Acceptance
  criteria** (testable), **Files you may touch**, **Out of scope**, **Verification** (exact commands).
- Anything that depends on an external fact I could not verify while writing is tagged **(verify)**.
  An agent must verify those against official documentation before relying on them.

## What this plan deliberately does not decide

Cloud sync between devices, multi-user servers, multi-currency accounting and iOS delivery are
designed *for* (the structure keeps the door open) but not built in v1. See
[`00-vision-and-scope.md`](00-vision-and-scope.md#non-goals-for-v1) and
[`02-open-questions.md`](02-open-questions.md).
