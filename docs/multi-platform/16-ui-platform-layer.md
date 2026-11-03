# 16 -- UI platform layer

> **ID** MP-16 · **Status** Draft · **Depends on** MP-15 · **Unblocks** MP-17, 20

**Agent brief.** Make the existing React UI run well inside a Capacitor WebView and offline, without forking it. Introduce a
`Platform` port that hides everything the web and the app do differently (storage, files, share, haptics, back button, status bar,
app lock), and fix the few web assumptions that break in an app: network fonts, `localStorage` for secrets, a hardware back button, and
build-time backend URL. Do not redesign screens.

## Context

Things in the current web app that matter here (from the repo):

- Fonts are loaded from Google Fonts at runtime. Offline local mode (and F-Droid's no-tracking stance) requires bundling them.
- The token is in `localStorage` (`emx_token`, `tokenStorage.ts`); UI preferences persist in `emx_ui` (`uiStore.ts`).
- `apps/web/src/config/app.ts` reads `VITE_API_BASE_URL` at build time; mobile needs a *runtime* choice (profiles, MP-15).
- Drawer/Modal already handle phone widths (bottom sheet, safe-area padding, drag-to-close), `pointer-coarse:` tap targets exist,
  keyboard shortcuts are ignored while typing. `vercel.json` rewrites everything to `index.html` (web hosting only).
- Theme switching uses the View Transitions API with a fallback.

## Requirements

1. **`Platform` port** in `apps/web/src/platform/types.ts`:

```ts
interface Platform {
  kind: "web" | "android" | "ios";
  info(): Promise<{ appVersion: string; build: string; os: string; osVersion: string }>;
  kv: { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<void>; remove(k: string): Promise<void> };
  secure: { get(k: string): Promise<string | null>; set(k: string, v: string): Promise<void>; remove(k: string): Promise<void> }; // tokens
  files: { save(name: string, data: Blob | Uint8Array, mime: string): Promise<{ saved: boolean }>;
           pick(accept: string[]): Promise<{ name: string; data: Uint8Array } | null> };
  share(opts: { title?: string; text?: string; fileName?: string; data?: Blob }): Promise<void>;
  haptics: { light(): void; success(): void; error(): void };
  appLock: { available(): Promise<"none" | "biometric" | "device-credential">; authenticate(reason: string): Promise<boolean> };
  onBackButton(handler: () => boolean): () => void;     // return true if handled; Android hardware/gesture back
  openExternal(url: string): Promise<void>;
  network: { isOnline(): boolean; onChange(cb: (online: boolean) => void): () => void };
  statusBar: { setStyle(theme: "light" | "dark"): void };
}
```

2. **Two implementations**: `webPlatform` (browser APIs; `secure` falls back to `kv`, documented as weaker) and `capacitorPlatform`
   (official/FOSS Capacitor plugins; every plugin must pass the FOSS/F-Droid rule in MP-20). Selected once at startup
   (`Capacitor.isNativePlatform()`), provided via React context. Feature code calls `usePlatform()`; it never touches `Capacitor` or `window.localStorage` directly.
3. **Fonts**: self-host Inter (and any other font used) as WOFF2 in the build (e.g. `@fontsource`-style packages or committed files with the OFL license text);
   remove Google Fonts `<link>`/`@import`. Use `font-display: swap`. Verify no network request is made at startup (a Playwright test that fails on any request to a host other than the configured server).
4. **Persistent storage migration**: move `tokenStorage` and the `uiStore` persistence behind `Platform.secure`/`Platform.kv`. Keep the existing key names so existing web
   users keep their preferences. Because `kv` is async, hydrate stores before first render (a small loading gate).
5. **Back button (Android)**: opens/close order: top-most Drawer/Modal/Command palette -> in-page overlay -> route history -> exit (with a "press again to exit" hint on
   the root route). Drawers/Modals register with `onBackButton` while open. Test with a fake platform.
6. **Edge-to-edge and safe areas**: the app draws behind system bars (required on newer Android targets **(verify)**). Use `env(safe-area-inset-*)` and Capacitor's
   status-bar settings so headers, the mobile tab bar and the Drawer footer are never covered. Use `100dvh`/`dvh` units, not `100vh`.
7. **Keyboard**: with the soft keyboard open, focused inputs and primary buttons stay visible (use the visual viewport / Capacitor Keyboard resize mode); test the transaction form on a small phone.
8. **Router**: keep `react-router` with `BrowserRouter` for web and the served-by-server build. For the Capacitor build confirm deep links are not needed and refresh/restore works with the app's
   internal origin **(verify; fall back to `HashRouter` for the mobile build if needed)**. The Vercel rewrite stays web-only.
9. **Touch UX**: hide keyboard-shortcut hints and the shortcut help entry on `pointer-coarse` devices; keep 44px targets; disable text selection/overscroll bounce where it fights drag gestures; respect `prefers-reduced-motion` (already present).
10. **Runtime config**: `appConfig.apiBaseUrl` stops being the source of truth. Defaults (`currencyCode`, `locale`, `defaultTimezone`) remain build-time. Locale and timezone defaults come from the device when not set (`Intl.DateTimeFormat().resolvedOptions()`).
11. **CSP** for the app and the server-served web build: `default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'` (Tailwind/inline styles; tighten if possible); `connect-src` must allow the user's server URL, so
    it is `'self' https: http:` in the app build with the reason documented; web hosted by the server uses `'self'`.
12. **Print stylesheet and View Transitions** keep working on web; on Android WebView the theme transition falls back gracefully (already implemented fallback; add a test).
13. **No network in native local mode**: in the native app's local mode no request to any host is ever made (verified by the Android smoke test with airplane mode on, MP-20). On web there is no local mode; the only host the UI may contact is the configured server.

## Tasks

- [ ] Add `Platform` types, `webPlatform`, `capacitorPlatform` (stubbed until MP-20 provides plugins), provider + `usePlatform()`.
- [ ] Self-host fonts; delete Google Fonts usage; add the no-third-party-requests test.
- [ ] Move token + UI persistence behind Platform; add a hydration gate; keep key names; test migration from existing `localStorage` keys.
- [ ] Back-button stack (`useBackHandler`) wired into Drawer, Modal, CommandPalette, router.
- [ ] Safe-area/edge-to-edge audit of `AppShell`, `MobileTabbar`, `Drawer` footer, toasts, FABs; fix at 360x640, 390x844, 412x915 viewports.
- [ ] Hide shortcut hints on coarse pointers; check `ShortcutHelp` access.
- [ ] CSP meta/headers as above; ensure no inline script requirement.
- [ ] Replace build-time API URL usage with the profile (done in MP-15); remove `VITE_API_BASE_URL` from required env (keep as optional default for web hosting; update `apps/web/.env.example` and `apps/web/README.md`).
- [ ] Add Playwright tests: no third-party requests at startup, phone viewport form usage, back-button stack with a fake platform.

## Acceptance criteria

- The Android app in airplane mode (local mode) completes setup, add expense and view dashboard (verified in MP-20); the web build makes no request to any host except its configured server.
- No external host is requested at startup (assert via Playwright request log; the configured server is the only allowed host).
- Existing web preferences (theme/accent/density) survive the migration.
- Back button behavior matches requirement 5 in tests with a fake `onBackButton`.
- Visual check at three phone viewports with the soft-keyboard simulation shows no covered controls (screenshots attached to the PR).
- Lint rule or boundary check: no direct `localStorage` use outside `webPlatform`.

## Files you may touch

`apps/web/src/platform/**`, `apps/web/src/main.tsx`, `apps/web/src/store/*`, `apps/web/src/components/ui/Dialog.tsx` (back handler only), `apps/web/src/components/layout/**` (safe area, shortcut hints), `apps/web/index.html`, `apps/web/src/styles/index.css` (fonts), `apps/web/README.md`, `apps/web/.env.example`, tests.
No behavior changes to ledger screens.

## Out of scope

New screens (MP-17), native plugin installation (MP-20), redesign, push notifications, widgets.

## Verification

```bash
cd apps/web && npm run typecheck && npm run lint && npm test && npm run build && npm run test:e2e   # Playwright suite added here
```
