# 17 -- Onboarding, mode selection and server validation

> **ID** MP-17 · **Status** Draft · **Depends on** MP-15, MP-16 (and MP-14 for the cloud path) · **Unblocks** MP-20

**Agent brief.** Build the first-run flow and the Settings screens that let a user choose *Use on this device* (local mode) or
*Connect to my server* (cloud mode), enter and validate a backend URL, sign in or create the owner, and later switch modes safely.
Follow the validation algorithm and the error table exactly; the error messages are part of the product.

## User flow

**Native app (Android, later iOS)**

```text
First launch (no profile)
  |
  +-- Welcome: "Where should your data live?"
        +-- [Use on this device]  -> LocalSetup (name, currency, timezone, optional app lock) -> Dashboard
        +-- [Connect to my server] -> ConnectServer
                                        enter URL -> Validate -> (initialized? Login : CreateOwner) -> Dashboard
Later: Settings > Data & connection
        shows active profile, server name/version (cloud) or storage info (local)
        [Switch to server...] [Use on this device] [Export data] [Import data]
```

**Web** has no mode picker and no local mode (ADR-0008).

- Served by the user's own server (including one on their own computer at `http://localhost:8000`): the page is already same-origin cloud mode
  (profile `cloud` with `baseUrl = origin`); the user goes straight to *Sign in* or *Create owner*.
- Standalone web build (hosted elsewhere): the first screen is `ConnectServer`. It shows a short hint: "No server yet? Run one on this computer"
  linking to the "Run it on your own computer" section of `docs/self-hosting.md`.

## Server validation algorithm

Input: a string typed by the user. Output: a validated `ServerInfo` or a typed failure. Steps (each step has a timeout of 8 s, whole flow <= 15 s, cancelable):

1. **Normalize** with `normalizeServerUrl` (MP-15). Reject unusable input -> `invalid_url`.
2. **Transport-security check**: `https://` is always allowed. `http://` is allowed only for loopback, RFC 1918 ranges, link-local, `*.local`,
   `*.lan`, and Tailscale-style hosts (`100.64.0.0/10`, `*.ts.net`) **(owner to confirm list)**, and then shows a visible warning
   ("Traffic is not encrypted"). Any other `http://` -> `insecure_not_allowed` with advice to put the server behind HTTPS.
3. **Reach**: `GET {base}/api/v1/meta` (no auth). Network errors map to `unreachable` / `timeout` / `tls_error` / `cors_blocked`
   **(distinguish where the platform exposes it; on web, an opaque CORS failure is shown as `cors_or_unreachable`)**.
4. **Identify**: body must be JSON with `app === "monetary"`. Otherwise -> `not_monetary` ("This address does not look like a Monetary server").
5. **Compatibility**: client `apiLevel` = 1. Require `meta.apiVersion === 1` and `meta.minClientApi <= client.apiLevel`.
   - `meta.apiVersion > client` or `minClientApi > client` -> `server_too_new` ("Update the app").
   - `meta.apiVersion < client` -> `server_too_old` ("Update your server").
6. **State**: if `meta.initialized` is false -> show *Create owner* (calls `setup/init`); else show *Sign in*.
7. **Persist** the profile only after a **successful sign-in or owner creation**, so a typo never leaves a half-configured profile.
   Store token via `Platform.secure`.
8. Show the server's `name`, `version` and a short fingerprint of `instanceId` so the user can confirm it is *their* server.

### Error table (copy is a starting point; keep it short and actionable)

| Code | Shown message | Suggestion |
|---|---|---|
| `invalid_url` | That doesn't look like a web address. | Example: `https://money.example.com` |
| `insecure_not_allowed` | This address uses plain HTTP over the internet. | Use HTTPS (see the self-hosting guide). |
| `unreachable` | Couldn't reach the server. | Check the address, your connection, and that the server is running. |
| `timeout` | The server took too long to answer. | Try again; check it is reachable from this network. |
| `tls_error` | The server's HTTPS certificate isn't trusted. | Fix the certificate; self-signed needs a trusted CA (no "ignore" button in v1). |
| `cors_or_unreachable` (web only) | The browser blocked the request. | Allow this site's origin on the server (`MONETARY_CORS_ORIGINS`) or use the app. |
| `not_monetary` | This address doesn't look like a Monetary server. | Check the address and path. |
| `server_too_old` | This server is older than the app supports. | Update the server to X.Y or newer. |
| `server_too_new` | This server needs a newer app. | Update the app. |
| `unauthorized` | Wrong email or password. | -- |
| `rate_limited` | Too many attempts. Try again in a few minutes. | -- |
| `database_too_new` (local) | This data was created by a newer version of the app. | Update the app. Nothing was changed. |

There is deliberately **no "ignore certificate errors" option** in v1 (it defeats the purpose for a finance app).

## Requirements

1. Screens (`Welcome` and `LocalSetup` exist only in the native build; web starts at `ConnectServer`): `Welcome`, `LocalSetup`, `ConnectServer` (with live validation states: idle, checking, ok, failed + message), `ServerLogin`/`CreateOwner` (reuse existing auth screens), `DataSettings` (Settings card).
2. Local first run creates the schema via migrations, creates the owner with `setup/init` through the in-process API, and seeds default categories.
3. **Optional app lock** offered in LocalSetup and Settings (MP-18): requires `Platform.appLock.available() != "none"`; locks on app background after a configurable delay.
4. **Switching**:
   - local -> cloud: explain that data is **not** moved automatically; offer *Export my data first* and, after connecting to an **empty** server, *Import my data* (MP-19).
   - cloud -> local: offer export from the server, then create a local profile; the local database starts empty or from an imported archive.
   - Removing a profile asks for explicit confirmation; for a local profile it states that on-device data will be deleted and offers export first.
5. **Never silently lose data**: switching/removing keeps the other profile's data on disk until the user confirms deletion.
6. **Accessibility**: all new screens are keyboard- and screen-reader-usable (labels, `role="alert"` on errors, focus the first error, which the shared `FormField` already does); error text is never colour-only.
7. **Copy and i18n**: put every string in one module (`apps/web/src/features/onboarding/copy.ts`) so later localization is mechanical.
8. **Telemetry**: none. Do not send the entered URL anywhere except to that server.

## Tasks

- [ ] Implement `validateServer(input, deps)` as a pure, injectable function in `packages/client` returning a discriminated result; unit-test every row of the error table with fake transports.
- [ ] Build `Welcome`, `LocalSetup`, `ConnectServer` screens with the states above, using existing UI primitives (`Segmented`, `FormField`, `EmptyState`, `LoadFailed`).
- [ ] Wire profile creation/persistence/removal and the post-login "persist" rule.
- [ ] Settings > Data & connection card with active profile info, switch/export/import actions (export/import call MP-19 once available; hide until then).
- [ ] Handle `DatabaseTooNew` and migration failure screens (clear message, no destructive action offered).
- [ ] Playwright flows (web): cloud connect success including `http://localhost`; each failure from the table using a mock server. Native local setup and mode switching with the export prompt are covered by the Android smoke tests (MP-20).
- [ ] Document the flow in `docs/self-hosting.md` troubleshooting (link from error messages).

## Acceptance criteria

- Every error-table row is reproducible in a test and shows the specified message.
- A typo'd URL never creates a profile; a failed login never leaves a token stored.
- Local first run on Android works in airplane mode.
- Switching profiles never shows stale data (MP-15 cache rule) and never deletes data without confirmation.
- Screens pass an automated a11y check (axe in Playwright) with no serious violations.

## Files you may touch

`apps/web/src/features/onboarding/**`, `apps/web/src/pages/SettingsPage.tsx` (new card only), `apps/web/src/routes/**`, `packages/client/src/profile/**`, tests, `docs/self-hosting.md`.

## Out of scope

Multiple simultaneous profiles, QR-code server setup, auto-discovery (mDNS), self-signed-certificate pinning UI, account recovery changes.

## Verification

```bash
npm test -w @monetary/client && cd apps/web && npm test && npm run test:e2e
```
