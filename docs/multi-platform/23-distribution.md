# 23 -- Distribution: F-Droid, GitHub Releases, Google Play (and the server image)

> **ID** MP-23 · **Status** Draft · **Depends on** MP-20 · **Unblocks** public release

**Agent brief.** Set up versioning, signed release automation, and the three Android channels plus the server container image, so that a tag
produces verifiable artifacts. Most account-level steps (Play developer account, signing key custody, F-Droid merge request approval) are
**owner actions**; produce checklists and automation for everything else. Do not store any secret in the repo.

> External store policies change often. Every **(verify)** item must be checked against the official documentation on the day you do the work.

## Channels at a glance

| Channel | Artifact | Who signs | Updates reach users | Notes |
|---|---|---|---|---|
| **GitHub Releases** | signed APK + SHA-256 + attestation | project key | manual / Obtainium-style updaters | fastest, our reference build |
| **F-Droid** | built from source by F-Droid | F-Droid's key, **or** project key if the build is reproducible (preferred, Q11) | via the F-Droid client | needs FOSS-only dependencies and a build recipe |
| **Google Play** | signed AAB | Play App Signing + our upload key **(verify)** | Play | needs developer account, listing, policy forms |
| **Server image** | OCI image on GHCR | cosign/attestation **(verify)** | `docker pull` | MP-14 |

**Signature caveat**: an APK signed with key A cannot update over an app signed with key B. If F-Droid signs with its own key, F-Droid installs and GitHub/Play installs
are separate "lineages". A reproducible build lets F-Droid publish the project-signed APK, unifying GitHub and F-Droid **(verify current F-Droid process and what Play does with its own app signing)**.
Play re-signs with Play's key, so Play installs will never update from GitHub/F-Droid APKs. Document this clearly for users.

## Requirements

1. **Versioning**: one semver for the app (release-please manages it; conventional commits already enforced). `versionName` = semver. `versionCode` = `major*1_000_000 + minor*1_000 + patch` (documented, monotonic, never reused). The API version and schema version are independent (MP-01).
2. **Release workflow** (`.github/workflows/release-android.yml`), triggered by a release tag:
   build web (mobile mode) -> `cap sync` -> `assembleRelease` + `bundleRelease` -> sign with keys from encrypted environment secrets -> verify (`apksigner verify`, 16 KB alignment, permission allow-list, no Google libs) ->
   generate SHA-256 sums, SBOM (CycloneDX or SPDX **(verify tool)**), build provenance attestation **(verify)** -> attach to the GitHub Release. The workflow never prints secrets and uses a protected environment with required reviewers.
3. **Key custody**: the owner generates and backs up the keystore **offline** (two copies); CI receives only a base64 secret in a protected environment. Lost keys cannot be recovered. Record the key's SHA-256 certificate fingerprint in `docs/signing.md` so users can verify APKs.
4. **F-Droid**
   - Metadata in-repo under `mobile/fastlane/metadata/android/<locale>/` (title, short/full description, changelogs named by `versionCode`, icon, phone screenshots) **(verify the exact layout)**.
   - Open a merge request to `fdroiddata` with `metadata/<appId>.yml` containing the build recipe (`srclibs`/`prebuild` steps to build the web app, `gradle` target) **(verify format)**. The recipe must build from source: `npm ci`, web build, `cap sync`, `gradle assembleRelease` with no prebuilt binaries.
   - Audit anti-features: none expected (no ads, no tracking, no non-free network services -- cloud mode connects only to the user's own server, but state this plainly in the description) **(verify wording)**.
   - Maintain the recipe when build steps change; add a CI check that runs the same commands the recipe runs.
5. **GitHub Releases**: release notes generated from conventional commits (release-please) plus an install section (verify checksum, how to update, signature fingerprint).
6. **Google Play** (owner-led): developer account; app record with the final application id; AAB upload; store listing (title, short/full description, screenshots, feature graphic, icon); content rating questionnaire; **Data safety** form answering "no data collected/shared" (accurate: no telemetry; cloud mode talks to the user's own server -- word it carefully **(verify)**); target audience; privacy policy URL (host the policy from `docs/` via GitHub Pages or the repo); declare no ads; use closed/internal testing first; check whether the account type requires a closed-testing period before production **(verify)**; satisfy the current target-API and 16 KB page-size rules **(verify)**. Use fastlane `supply` or manual uploads (owner decides); metadata shared with F-Droid assets where formats match.
7. **Privacy policy** (`docs/privacy-policy.md`): plain language, matches the promise in MP-18; also reachable in-app (Settings > About).
8. **In-app About**: version, build, license, link to source, third-party licenses screen generated at build time (MP-24 license inventory).
9. **Server image**: GHCR publish workflow on release (multi-arch amd64/arm64), tags `latest`, `X.Y.Z`, `X.Y`; includes the matching web build; SBOM + provenance **(verify)**.
10. **Release checklist** (`.github/RELEASE_CHECKLIST.md`, linked from the PR template for release PRs): security review (MP-18), migration test from the previous release's database, parity run, emulator smoke on min and latest API, screenshots refreshed, changelog read, signature fingerprint unchanged, store metadata updated.
11. **Update compatibility test**: CI keeps the previous release's APK and installs the new one over it on an emulator, then checks the data survived a real migration.

## Tasks

- [ ] Document versioning and add a script that derives `versionCode` and fails the build if it did not increase.
- [ ] Write `docs/signing.md` (key generation, storage, CI secret setup, fingerprint verification) -- no secrets in the document.
- [ ] Release workflow with verification gates, checksums, SBOM, attestation; dry-run on a pre-release tag with a *test* key.
- [ ] F-Droid metadata folder and a drafted `fdroiddata` recipe + CI check that mimics it; prepare the merge-request text (owner submits).
- [ ] Play listing assets and text drafts under `mobile/fastlane/metadata/android/`; Data-safety answers drafted in `docs/store-listing.md`; owner submits.
- [ ] `docs/privacy-policy.md`; in-app About + licenses screen.
- [ ] GHCR image workflow.
- [ ] Release checklist and update-compatibility CI job.
- [ ] README "Install" section: Docker, GitHub APK, F-Droid, Play, web.

## Acceptance criteria

- Pushing a pre-release tag creates a GitHub pre-release with a signed APK, checksums, SBOM and attestation; `apksigner verify` and checksum verification pass locally.
- A clean machine following `docs/signing.md` can verify the APK fingerprint.
- The F-Droid recipe builds the app from source in a clean container using only the recipe's commands (owner confirms with F-Droid's tooling/CI).
- The Play pre-launch/internal-testing build installs and passes review checks (owner confirms).
- Update-compatibility job passes (old APK -> new APK keeps data).
- No secret appears in logs or the repo (`detect-secrets` + a CI grep for keystore extensions).

## Files you may touch

`.github/workflows/release-*.yml`, `.github/RELEASE_CHECKLIST.md`, `mobile/fastlane/**`, `docs/signing.md`, `docs/privacy-policy.md`, `docs/store-listing.md`, `scripts/versioncode.*`, `server/Dockerfile` publishing bits, README install section.

## Out of scope

Paid features, in-app purchases, alternative stores beyond these three (Accrescent, Amazon, Samsung can be added later), analytics, staged-rollout automation.

## Verification

```bash
./scripts/versioncode.sh --check
gh workflow run release-android.yml -f tag=v0.0.0-test   # dry run with a test key; owner runs
apksigner verify --print-certs app-release.apk && sha256sum -c SHA256SUMS
```
