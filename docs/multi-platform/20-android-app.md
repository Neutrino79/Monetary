# 20 -- Android app (Capacitor)

> **ID** MP-20 · **Status** Draft · **Depends on** MP-12 (capacitor driver), MP-16, MP-17 · **Unblocks** MP-23

**Agent brief.** Create the `mobile/` Capacitor project that wraps the built `web/` app as an Android app with local mode
(on-device SQLite) and cloud mode. Keep it FOSS-only and F-Droid-buildable from source, request the minimum permissions, and keep all
Android-specific code in `mobile/` and the `sqlite-capacitor` package. The same code must later build for iOS.

## Context and decisions

- **Shell**: Capacitor (ADR-0002, accepted). Use the current stable Capacitor major at project start and record the version in the ADR **(verify)**.
- **No proprietary services**: no Google Play Services, Firebase, Crashlytics, AdMob or any closed SDK. This is required for F-Droid and matches the privacy promise.
  One build (no `play` vs `foss` behavioral flavors) is the goal so what F-Droid builds is what Play ships. Flavors, if any, may differ only in signing/metadata.
- **Application id** is permanent after publishing (Q8). Use a placeholder in code (`org.example.monetary`) until the owner chooses; a single Gradle property sets it.
- **Platform targets move every year.** Do not hard-code today's numbers in docs or code comments: read Google Play's current target-API requirement and
  the 16 KB page-size requirement at release time **(verify both)**. Build with the latest required `targetSdk`; `minSdk` per Q10 (default API 26, final value from the spike).
- **Edge-to-edge** is enforced on newer targets, so the UI must handle insets (MP-16).

## Requirements

1. **Project layout**

```text
mobile/
  capacitor.config.ts         appId (from Gradle/ env), appName "Monetary", webDir ../web/dist, androidScheme
  package.json                scripts: sync, build:android, run:android
  android/                    generated Capacitor Android project (committed; native config reviewed)
  fastlane/metadata/android/en-US/   F-Droid/Play-compatible metadata (title, short/full description, changelogs, images)
  scripts/                    build-web-for-mobile.sh, run-driver-conformance.sh, check-permissions.sh
```

2. **Web build for mobile**: `npm run build:mobile -w web` produces a build with `base: "./"`, the fonts bundled, no analytics, `VITE_TARGET=mobile`; `capacitor sync` copies it into `android/`.
3. **SQLite plugin** (`sqlite-capacitor`): selected by the spike (MP-26) from (a) a maintained FOSS community plugin or (b) a small in-repo plugin over `android.database.sqlite`.
   Requirements either way: batch execute, transactions, WAL, returns integers without precision loss, runs off the UI thread, passes the conformance suite (MP-12),
   no network code. If it ships a native `.so`, it must be built from source and be **16 KB-aligned** **(verify with the current NDK/AGP and the `zipalign -c -P 16` check)**.
4. **Other plugins** (each must be FOSS, justified in the PR, and checked for permissions): app/device info, keyboard, status bar, haptics, share, file save/pick via the
   Storage Access Framework (no storage permission), secure storage (Keystore), biometric authentication, network status, splash screen, app lifecycle (back button).
   Prefer official Capacitor plugins; avoid any plugin that pulls Google libraries.
5. **Manifest**: only `INTERNET` (+ `USE_BIOMETRIC` if needed **(verify)**); no exported activities except the launcher; `allowBackup` and backup/data-extraction rules per MP-18; `usesCleartextTraffic=false` with a `network_security_config` for private-range HTTP per MP-17; `android:supportsRtl="true"`; `FLAG_SECURE` as a runtime setting.
6. **Back button, keyboard, insets, splash, theme**: per MP-16. The splash/status/navigation bar follow the light/dark theme. Adaptive icon + monochrome icon provided as **original artwork** (no third-party logos).
7. **Reproducible, verifiable build**: Gradle wrapper pinned and checked in; dependency verification (`gradle/verification-metadata.xml`); no dynamic versions (`+`, `latest`); no timestamps in outputs; documented JDK version; `./gradlew assembleRelease` yields the same APK bytes on two machines (target; see MP-23).
8. **Signing**: release signing config reads keystore path/passwords from environment variables or a local untracked file; the repo contains **no** keystore or password. Debug builds use the debug key.
9. **Local-mode lifecycle**: database in the app's private files dir; opened once, closed on app destroy; migrations run on launch with the pre-migration backup (MP-12); a visible "Updating your data..." state if migration takes > 300 ms; `DatabaseTooNew` screen.
10. **Cloud mode**: HTTP via the transport chosen in the spike (CapacitorHttp native or WebView fetch + CORS). Works behind HTTPS reverse proxies, private-range HTTP with warning, and handles the app being backgrounded mid-request.
11. **Performance budgets (proposed; spike confirms)**: cold start to interactive <= 2.5 s on a mid-range 2020-era phone; dashboard from a 50k-entry local database <= 700 ms; list scroll stays at 60 fps for 500 rows; APK <= ~15 MB.
12. **Accessibility**: TalkBack can complete adding a transaction; font scale 200% does not clip primary controls; touch targets >= 44 px.
13. **Orientation**: portrait on phones; tablets/landscape supported with the existing responsive layout.

## Tasks

- [ ] Scaffold `mobile/` with Capacitor; add the Android platform; commit generated native project after review.
- [ ] Add `web` mobile build mode + `build:mobile`; confirm offline start inside the WebView.
- [ ] Implement `sqlite-capacitor` per the spike outcome and make it pass the conformance suite on an emulator (`run-driver-conformance.sh`).
- [ ] Implement `capacitorPlatform` (MP-16) using the vetted plugins.
- [ ] Configure manifest, backup rules, network security config, themes, adaptive icon, splash.
- [ ] `check-permissions.sh`: parse the merged manifest and fail if permissions differ from the allow-list; run in CI.
- [ ] Gradle hardening: wrapper pin, dependency verification, no dynamic versions; document how to update.
- [ ] CI job `android`: build debug + release (unsigned) APK on every PR touching `mobile/`, `web/`, `packages/*`; nightly emulator smoke test (launch, local setup, add expense, restart, data persists, airplane-mode check).
- [ ] Emulator/instrumented smoke tests (Maestro/Espresso **(decide, must be FOSS)**) for: local setup, add/edit/delete transaction, dashboard renders, export a backup via SAF, import it, cloud connect to the Docker server over `http://10.0.2.2:8000`.
- [ ] Verify 16 KB alignment, `minSdk` behavior (API 26 emulator + a recent API), small-screen and tablet layouts.
- [ ] Write `docs/android-development.md` (setup, emulator, build, debug, update plugins, release checklist).

## Acceptance criteria

- `./gradlew assembleRelease` succeeds from a clean checkout following only `docs/android-development.md`.
- Installing on an API-26 emulator and a current-API emulator: local mode works fully in airplane mode, including backup export/import and an app update that applies a new migration without data loss (test with a v1 -> v2 dummy migration).
- Cloud mode connects to the Docker server, validates it, signs in, and lists transactions created on the web.
- Merged manifest contains exactly the allow-listed permissions; no Google/Firebase/ads libraries appear in the dependency report (`./gradlew :app:dependencies` grep in CI).
- Native libraries (if any) pass the 16 KB alignment check.
- Two clean release builds on different machines produce identical unsigned APKs (or the gap is documented with the cause).
- Budgets in requirement 11 are measured and recorded; misses are filed as issues with numbers.

## Files you may touch

`mobile/**`, `packages/sqlite-capacitor/**`, `web/src/platform/capacitorPlatform.ts`, `web/package.json` (mobile build script), `.github/workflows/android.yml`, `docs/android-development.md`.

## Out of scope

iOS project (MP-21), Play/F-Droid listing work (MP-23), widgets, notifications, Wear OS, Google sign-in, in-app updates via Play libraries.

## Verification

```bash
npm run build:mobile -w web && cd mobile && npx cap sync android
cd android && ./gradlew assembleDebug assembleRelease
../scripts/check-permissions.sh && ../scripts/run-driver-conformance.sh
```
