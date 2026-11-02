# 18 -- Security and privacy

> **ID** MP-18 · **Status** Draft · **Depends on** cross-cutting · **Unblocks** a safe public release

**Agent brief.** This is both a checklist for every work package and a set of work items of its own. When you build
something that handles credentials, stores data, makes a network request or writes a log, check it against this document.
Finance data is sensitive: when in doubt, choose the more private option and tell the owner.

## Promise to users (also goes in the README and the store listing)

- No account with us, no telemetry, no analytics, no ads, no third-party SDKs.
- Local mode never makes a network request.
- Cloud mode only talks to the server address the user typed.
- You can export everything at any time.

## Threat model (v1)

| Threat | Mode | Mitigation | Residual risk |
|---|---|---|---|
| Lost/stolen unlocked phone | local, cloud | optional app lock (biometric/device credential) with background re-lock | whoever has the unlocked phone and the OS unlock |
| Lost/stolen locked phone | local | Android file-based encryption protects app storage at rest **(verify per OS version)**; app data excluded from cloud auto-backup by default | rooted/forensic access |
| Other apps reading our data | local, cloud | private app storage (no external storage), no exported components, no permissions beyond `INTERNET` | rooted device |
| Network eavesdropping | cloud | HTTPS required except private/loopback networks (MP-17), no cert-ignore option | user chooses plain HTTP on a trusted LAN |
| Malicious/compromised server | cloud | the user hosts it; app shows server identity (name, instance fingerprint); token scoped to that server | a compromised self-hosted server exposes its data |
| Credential stuffing / brute force | cloud | per-IP rate limit on login/reset, scrypt hashing, generic error messages | distributed attacks (use a strong password / proxy rules) |
| Stolen session token | cloud | tokens SHA-256 hashed at rest, 7-day expiry, invalidated on password change/reset, stored in `Platform.secure` | device compromise |
| XSS in the WebView | all | strict CSP, no `eval`, no remote scripts, no `dangerouslySetInnerHTML` with user data, dependency audit | supply chain (see below) |
| Supply-chain compromise | all | lockfiles, reviewed dependency additions, license + audit checks, minimal Android native deps, reproducible build, signed releases + checksums | upstream malicious release |
| Data loss from bad migration | local | backup before migrate, integrity check, refuse newer DB | disk failure (user backups) |
| Leaking data via logs/crash reports | all | no analytics; logs never contain bodies, tokens, amounts, descriptions; no crash-reporting SDK | -- |

## Requirements

1. **Token storage**: Android -> Keystore-backed secure storage plugin (FOSS, F-Droid compatible; **verify**); web -> `localStorage` (documented weaker) or an in-memory + `sessionStorage` option; never log or put tokens in URLs.
2. **App lock** (`Platform.appLock`): off by default; when enabled, require authentication on cold start and after the app was in the background longer than N seconds (default 30); hide the app preview in the recent-apps switcher (`FLAG_SECURE` setting, user-controllable). The lock is a UI gate over the same local data, not encryption; the docs must say so.
3. **Backups**: Android auto-backup/device-transfer rules exclude the database by default (`dataExtractionRules`/`fullBackupContent`) so financial data does not leave the device unexpectedly; the supported route is the user's explicit export (MP-19). Offer an opt-in setting only after the owner decides (Q12 family).
4. **Network**: in the Android manifest, `usesCleartextTraffic` is off; a `network_security_config` permits cleartext only for the private ranges chosen in MP-17 **(verify the config can express them; otherwise permit cleartext app-wide and enforce in JS)**. No certificate pinning in v1; no user-trusted-CA overrides beyond the OS default.
5. **Server hardening** (MP-14): security headers, CSP, rate limiting, request size limits, scrypt with stored params, constant-time compares, no stack traces in responses, docs endpoints disabled in production, non-root container.
6. **Input handling**: validation at the API boundary with the `contract` schemas; parameterized SQL only (no string-built SQL anywhere; boundary check + a test that greps for template-literal SQL with `${`).
7. **Logging policy**: allowed -- level, route, status, duration, request id, error type. Forbidden -- bodies, headers, tokens, descriptions, amounts, emails. Provide a `redact` helper and a test.
8. **Dependencies**: Dependabot stays on; CI runs `npm audit --omit=dev` (fail on high/critical, with a documented allowlist file for accepted advisories) and a license check (MP-24). Each Android plugin is reviewed for permissions, network use and native code.
9. **Release integrity**: GitHub Release assets include SHA-256 checksums and GitHub artifact attestations **(verify availability)**; the keystore never enters the repo or CI logs (MP-23).
10. **SECURITY.md**: private vulnerability reporting channel (GitHub Security Advisories), response targets, supported versions.
11. **Sample/test data** must contain no real personal data; run the secret scanner (`detect-secrets`) and a history scan before publishing (MP-24).
12. **Optional later**: SQLCipher database encryption (Q12), encrypted archives, certificate pinning for power users.

## Tasks

- [ ] Write `SECURITY.md`, a `docs/security-model.md` user-facing summary of the table above, and link them from the README.
- [ ] Implement the redacting logger + tests (server and in-app).
- [ ] Implement app lock UI + `Platform.appLock` (with MP-16/MP-20).
- [ ] Configure Android manifest/backup/network rules (with MP-20) and add a CI lint that fails if `INTERNET` is absent in cloud builds or any other permission appears.
- [ ] Add `npm audit` and license-check CI steps; add the advisory allowlist file with an owner-review rule.
- [ ] Add the "no template-literal SQL" test and the "no `eval`/`dangerouslySetInnerHTML` with variable input" lint.
- [ ] Threat-model review checkpoint before each release candidate (checklist in the release template, MP-23).

## Acceptance criteria

- The Android manifest requests only `INTERNET` (and, if biometric auth needs it, `USE_BIOMETRIC` **(verify)**); a CI check enforces the exact list.
- With the app lock on, backgrounding for longer than the delay shows the lock screen before any ledger data renders.
- A log-capture test proves bodies, tokens and amounts never reach logs.
- `npm audit` and license checks pass in CI.
- `SECURITY.md` exists and the repository has private vulnerability reporting enabled (owner action, checklist item in MP-24).

## Files you may touch

`SECURITY.md`, `docs/security-model.md`, logging utilities in `apps/server/`, `packages/api`, `apps/web/src/platform/**`, `apps/mobile/android/**` (config only), CI workflow files for audit/license checks.

## Out of scope

Penetration testing services, bug bounty, SQLCipher (until Q12 changes), multi-user authorization models.

## Verification

```bash
npm audit --omit=dev && npm run check:licenses && npm run test:security
```
