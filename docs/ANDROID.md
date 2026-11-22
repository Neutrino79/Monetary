# Android app design: the web app in a Capacitor shell

Status: **proposed**, being built on the `feat/android-support` integration branch. Each step below is its
own small PR into that branch; the branch merges into `main` once it has been tested on a real phone.

## 1. Goal and scope

Let people use Monetary as an installed Android app, talking to the same backend as the web app.

In scope: Android only, online use, sign-in, the full existing UI, secure token storage, a Play Store release.

Out of scope for now (designed so they can be added later, not built):

- iPhone. The same shell can target it later; it needs an Apple developer account and a Mac or cloud build.
- Offline writing (a queue of changes made without a connection). Reads show a connection banner, writes fail
  at once while offline. See `docs/ARCHITECTURE.md`, "Connection state (web)".
- Push notifications (needs a server-side sender, Firebase Cloud Messaging).
- A native (non-web) rewrite of any screen.

## 2. Decision

Wrap the existing React web app with **Capacitor** instead of rewriting the UI.

Why:

- The web app holds no ledger logic (`web/` only renders what the API computes), so there is nothing to
  re-implement for mobile except presentation, and the presentation already has a mobile layout.
- One UI codebase to maintain instead of two. The screens are mostly forms, lists and charts, which a WebView
  handles well.
- It gives iPhone later with the same code.
- It is cheap to be wrong: the API client, types, query hooks and everything built for the backend carry over
  unchanged if the UI is later rewritten in React Native (Expo).

Rejected for now: React Native/Expo and Flutter (a full UI rewrite for a better native feel), Kotlin/Compose
(Android only, no reuse), and a PWA in a Trusted Web Activity (no secure token storage or native features).

**Decision gate (step 6).** After a release build is tried on a real, low-end phone, we keep Capacitor if
these feel fine: scrolling the Transactions list with a few hundred rows, the Reports charts, typing in
forms with the keyboard open, and the Back button. If one of them does not, the fallback is an Expo app that
shares the API/types/query layer; nothing built before then is wasted.

## 3. Identity and targets

| | |
|---|---|
| App ID (package name) | `com.neutrino.monetary` (permanent once published) |
| App name | taken from the product name setting (`VITE_APP_NAME`, default "Monetary") |
| Platform | Android only |
| Android versions | the minimum is whatever the chosen Capacitor release supports; the target API level follows Google Play's current requirement. Both are confirmed when Capacitor is added (step 5) and recorded here. |

## 4. How it works

- The web build (`npm run build`, `web/dist/`) is bundled into the app and served from inside the WebView
  from the app's own origin (Capacitor's default on Android is `https://localhost`).
- The app talks to the backend over HTTPS using the build-time `VITE_API_BASE_URL`. Nothing about the API
  changes, and no ledger endpoint is touched.
- Capacitor plugins give access to what the web cannot reach: secure storage, the Back button, the status and
  navigation bars, the keyboard, app lifecycle (pause/resume) and, later, biometrics.

## 5. What has to change

### Backend

- **CORS**: add the app's origin to `MONETARY_CORS_ORIGINS` (already a comma-separated setting). No code change.
- **HTTPS is required.** Android blocks plain HTTP from apps by default. See section 6 for development and
  production options.
- **Sessions suited to phones** (own PR): sliding expiry with an absolute cap, a cap on sessions per account,
  and device names, so a phone is not signed out every week. Builds on the existing per-device sessions.
- **Safe writes** (own PR): idempotency keys and optimistic concurrency for transactions, so a request retried
  on a weak connection cannot create a duplicate or silently overwrite a newer edit. Useful for the web too.
- **Correct client addresses** behind a reverse proxy (start uvicorn with proxy headers), so session and
  lockout addresses are the device's, not the proxy's.
- **A compatibility check** so an old app can tell the person to update when the API has moved on.

### Web app (`web/`)

- **Edge-to-edge screens.** Apps that target Android 15 or later draw behind the status and navigation bars,
  and Android 16 removes the opt-out. Add `viewport-fit=cover` and pad with the safe-area values. Capacitor
  8.3.2 or later exposes them as `--safe-area-inset-*` CSS variables (Android WebView below version 140
  reports wrong `env()` values), so critical spacing uses `var(--safe-area-inset-*, env(safe-area-inset-*, 0px))`.
- **Hardware Back button**: go back in the router, close an open dialog or menu first, and exit only from the
  top screen.
- **Touch and keyboard**: touch targets of at least 44px, no hover-only controls, inputs scroll into view
  when the keyboard opens.
- **Token storage**: replace `localStorage` with the platform's secure storage (Android Keystore) inside
  `tokenStorage`, which already isolates this. Browsers keep `localStorage`.
- **Platform detection** in one place (is this the native app?), so web-only code paths stay out of it.
- **Icon, splash screen, status bar colours**, and light/dark following the app's own theme setting.

### Security

- The session token lives only in secure storage, never in `localStorage` or logs inside the app.
- Exclude the token and any local data from Android's cloud backup.
- Release builds disable WebView debugging and cleartext traffic.
- Optional later: a biometric lock when the app returns to the foreground, hiding the screen in the app
  switcher, certificate pinning.

## 6. Development and production connectivity (no domain yet)

The app needs an HTTPS address for the backend. There is no production domain yet, so:

- **Development on the same computer**: run the backend locally and connect the phone with `adb reverse`
  (the phone's `localhost:8000` reaches the computer's backend over USB). Debug builds only may allow
  cleartext HTTP; the release build never does.
- **Testing away from the computer, or by other people**: a temporary HTTPS tunnel (Cloudflare Tunnel or a
  similar service) gives a public HTTPS URL to the local backend without a domain or a server.
- **Production**: needs a server (or hosting) with a domain name and a TLS certificate (for example behind
  Caddy or nginx with Let's Encrypt). A domain costs a small yearly fee. This must exist before a public
  release, but it does not block the steps up to the device test.

## 7. Release

- **Google Play account.** A new personal developer account must run a closed test with at least 12 testers
  for 14 continuous days before it can apply for production access. Start this early; it runs in the
  background.
- **Signing**: use Play App Signing; keep the upload key out of the repository (CI secret).
- **Build**: a GitHub Actions job produces a signed Android App Bundle (`.aab`) from the web build.
- **Store listing**: a privacy policy, and the Data safety form (this app stores financial data).
- **Versioning**: the app's version code and name come from the release version, in one place.

## 8. Repository layout

Capacitor is added inside `web/`: `web/capacitor.config.ts` and the generated `web/android/` project are
committed (build outputs and local files are ignored). Nothing moves out of `web/`. The web app keeps working
in a browser exactly as before. New scripts in `web/package.json` (`npm run android:sync`, `android:open`,
`android:build`) wrap the Capacitor commands.

## 9. Steps (each a PR into `feat/android-support`)

1. This design document.
2. Backend: sessions for phones, correct client addresses, the compatibility check, CORS and HTTPS notes.
3. Safe writes: idempotency keys and optimistic concurrency for transactions (may go straight to `main`).
4. Web: safe areas, Back button, touch and keyboard fixes, secure token storage, platform detection.
5. Add Capacitor and the Android project; confirm Android and Capacitor versions; icon and splash screen.
6. Device test on a real low-end phone and the decision gate in section 2.
7. CI build, signing and the Play Console setup (start the closed test as soon as a build exists).
8. Merge `feat/android-support` into `main` after testing.

## 10. Risks

- **WebView performance on slow phones** is the main risk; the decision gate exists for it.
- **Edge-to-edge and keyboard behaviour** differs across Android versions and vendors; test on the real phone.
- **No HTTPS domain yet** blocks only the public release.
- **The 14-day closed test** delays the first public launch by two weeks at least.

## 11. Open questions

- The production domain and where the backend will be hosted.
- Whether the minimum Android version should favour more devices or fewer compatibility workarounds
  (decided when Capacitor is added).
- Who the first 12 closed testers will be.
