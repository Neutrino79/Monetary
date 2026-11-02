# 21 -- iOS readiness

> **ID** MP-21 · **Status** Draft · **Depends on** cross-cutting · **Unblocks** a cheap iOS app later

**Agent brief.** iOS is **not built in v1**. Your job with this document is to (a) apply the *keep-ready rules* during every other
work package and in code review, and (b) when the owner decides to build iOS, follow the *iOS task list* at the bottom. Never add an
Android-only assumption to shared code.

## Why iOS is cheap *if* we keep the rules

Capacitor generates an iOS project from the same web build. The core, API app, client and UI are platform-independent. Only three things are
platform-specific: the SQLite driver's native part, a handful of Capacitor plugins, and store/signing logistics. The rules keep it that way.

## Keep-ready rules (apply in every PR)

1. **No Android assumptions in shared code**: no checks like `userAgent.includes("Android")`; use `Platform.kind` only inside `apps/web/src/platform/`.
2. **Everything native goes through the `Platform` port** (MP-16). A new native capability = add it to the port with web + Android implementations and a documented iOS plan.
3. **The SQLite plugin API is platform-neutral** (batch, transactions, integers); the Android implementation must not leak Android-only semantics.
4. **No Google services anywhere** (also required for F-Droid), so nothing has to be replaced on iOS.
5. **Safe areas use CSS `env(safe-area-inset-*)`**, not Android constants; test with a notch-style inset in the browser.
6. **WKWebView differences are respected**: `Intl` behavior, `100dvh`, date inputs, no `localStorage` assumptions for important data (the ledger is in SQLite, not web storage), no reliance on `window.open`.
7. **File export/import uses the Platform file API** (iOS uses the document picker/share sheet).
8. **License allows the App Store**: permissive license (Q7), no GPL/AGPL dependency in the app bundle.
9. **Fonts, icons, strings are bundled** (no runtime network), same as offline local mode.
10. **CI can grow a macOS job**: keep build scripts shell-based and free of Linux-only assumptions where easy.

Reviewers should tick these in the PR checklist for any change under `apps/web/src/platform/`, `packages/sqlite-capacitor/`, `apps/mobile/`.

## When iOS is approved: task list

- [ ] Owner prerequisites: Apple Developer Program membership, bundle id, App Store Connect record, signing certificates/profiles, privacy details (no data collected), support URL **(verify current requirements)**.
- [ ] `npx cap add ios`; commit the generated project after review; set the deployment target (decide with the spike results **(verify)**).
- [ ] Implement/enable the iOS side of `sqlite-capacitor` (system SQLite via the chosen plugin); run the conformance suite on a simulator and a device.
- [ ] Implement `capacitorPlatform` iOS behavior: secure storage (Keychain), biometrics (Face ID usage description string), file picker/share, haptics, status bar, back-swipe gesture integration (the iOS edge-swipe must not fight the Drawer drag).
- [ ] Info.plist: no unnecessary permissions; App Transport Security -- allow only HTTPS plus the same private-range exceptions as MP-17 **(verify ATS exception mechanics)**.
- [ ] Test on small and large iPhones and iPad; dynamic type; dark mode; reduced motion.
- [ ] CI: macOS runner builds the archive; fastlane for TestFlight upload (the owner provides the API key as a secret, never in the repo).
- [ ] App Review preparation: demo data/test instructions for local mode; explain that cloud mode connects to a user-hosted server; ensure no feature requires external accounts.
- [ ] Add iOS to the support matrix in the README and MP-00.

## Acceptance criteria (for the readiness work now)

- A grep/lint rule fails the build if shared code outside `apps/web/src/platform/` reads `Capacitor.getPlatform()` or user-agent strings for Android.
- The PR template contains the keep-ready checklist for the paths above.
- The Platform port documentation (MP-16) has an "iOS plan" note for every capability.

## Files you may touch

PR template, lint config, `apps/web/src/platform/types.ts` comments, this document.

## Out of scope

Creating the iOS project, Apple accounts, TestFlight, App Store submission.
