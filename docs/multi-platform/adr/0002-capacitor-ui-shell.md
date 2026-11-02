# ADR 0002: Capacitor around the one React UI; React Native deferred

- Status: **Accepted** (owner decision, 2026-11-02: "React + Capacitor")
- Date: 2026-11-02
- Deciders: repository owner

## Context

The existing UI is React 19 + TypeScript + Vite + Tailwind v4 + TanStack Query + radix-ui, with a dense desktop layout, tables, hover readouts, keyboard shortcuts, and responsive phone layouts.
We need Android now and iOS later without a second UI codebase.

## Decision

Wrap the **single** React web app in **Capacitor** for Android (and later iOS). Native code is limited to a thin shell and plugins (SQLite, secure storage, files, biometrics...). The layered package structure (ADR-0001) keeps the core, client and UI logic shell-independent so a **React Native** (or other) mobile UI could be added later if web-view feel proves inadequate.

## Consequences

- (+) One UI codebase; every feature ships to web, Android and iOS at once. Lowest ongoing cost for an open-source project.
- (+) Reuses all current screens, charts and tests; shortest path to a first Android release.
- (+) Capacitor projects are plain Gradle/Xcode projects, a reasonable fit for F-Droid (verify in spike S8).
- (-) WebView feel is not fully native (scroll physics, keyboard behavior, large-list performance); mitigated by the Platform layer, touch UX work (MP-16) and measured budgets (MP-20).
- (-) JS-to-native bridge overhead for SQLite; mitigated by batching and SQL-side aggregation (MP-12).
- (-) Dependence on plugin quality/maintenance; mitigated by preferring official plugins and being willing to write a small in-repo plugin.

## Alternatives considered

- **React Native (Expo)**: best native feel and direct-JSI SQLite, but every screen and chart must be rewritten and maintained twice (web + mobile), F-Droid builds are harder, upgrades are heavier. Deferred, not rejected: the architecture permits adding it later.
- **Flutter / Kotlin Multiplatform / native apps**: separate UI codebases; rejected for the same cost reason.
- **Tauri mobile**: promising but younger; revisit later.
- **PWA only**: no F-Droid/Play distribution and weaker storage guarantees; rejected as the Android answer (the web app remains a PWA-capable website).

## Verification / revisit when

Spike S1 (SQLite speed), S7 (HTTP), S8 (F-Droid build) and real-device UX checks. If S1 fails after mitigation, write ADR amending this decision.
