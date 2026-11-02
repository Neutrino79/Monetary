# ADR 0001: One TypeScript core; the API runs in-process (local) or on Node (cloud)

- Status: **Proposed** (owner to confirm, Q1)
- Date: 2026-11-02
- Deciders: repository owner

## Context

Local mode (no backend) requires the ledger rules to run on the device. Today they live in a Python/FastAPI backend. The web app holds no ledger logic and must keep it that way.
Cloud mode needs a server the user can host. The goals are web + Android now, iOS later, with identical results in every mode.

## Decision

1. Rewrite the ledger rules once in **TypeScript** (`packages/core`), preserving behavior (parity first, verified with recorded fixtures).
2. Expose them through a framework-light `fetch(Request) -> Response` application (`packages/api`, Hono-style, contract from ADR-0007).
3. **Cloud mode** runs that API in a Node server (`server/`). **Local mode** calls the same API in-process through `InProcessTransport` over an on-device SQLite database.
4. The Python backend becomes frozen `legacy`, used only as the source of parity fixtures, and is deleted once parity is reached (milestone M9).

## Consequences

- (+) Exactly one implementation of every rule and report; no drift between local and cloud.
- (+) The same code runs on web, Android and iOS (all are JavaScript runtimes), with the same UI.
- (+) Self-hosting is one Node process or one Docker image with no Python toolchain.
- (-) A full rewrite of about 6.6k lines of Python plus its tests; risk of subtle behavior differences (mitigated by fixtures, property tests, per-module PRs).
- (-) Floating-point and timezone behavior must be verified on several JS runtimes (spike S4, S5).
- (-) Two languages in the repo during the transition.

## Alternatives considered

- **Keep Python, embed it on Android (Chaquopy)**: Android-only, large APK, no path to iOS or browser local mode; rejected.
- **Rust core compiled to WASM/native with bindings**: strong correctness story and one binary everywhere, but a heavy toolchain (Android NDK, iOS static libs, WASM) for contributors, F-Droid build complexity, 16 KB alignment concerns; rejected for v1, could be revisited for hot paths.
- **Kotlin Multiplatform core**: good for Android/iOS, weak for browser/Node server reuse and the existing web UI; rejected.
- **Local mode with a reduced re-implementation in the UI**: guarantees divergence; violates the "UI holds no ledger logic" rule; rejected.
- **Two separate cores (Python server + TS client)**: double maintenance; rejected.

## Verification / revisit when

Spike S4-S6 results. Revisit if report parity cannot be reached within tolerance, or the in-process API bundle/cold-start budgets fail.
