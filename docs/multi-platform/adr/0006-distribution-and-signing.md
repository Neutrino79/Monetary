# ADR 0006: Distribution channels and signing

- Status: **Accepted** (owner confirmed Q11 and Q13, 2026-11-02); every store-policy detail marked (verify) is still checked at release time
- Date: 2026-11-02
- Deciders: repository owner

## Context

Target channels: F-Droid, GitHub Releases, Google Play (Android), plus a Docker image for the server and the web app. Signing keys decide whether installs from different channels can update each other.
Platform rules (Play target API, 16 KB page size, F-Droid build policy) change over time and must be re-checked at each release.

## Decision

1. **One build, one source**: a single Android build (no behavior flavors) from the same tag feeds all channels. No proprietary SDKs, so the build is acceptable to F-Droid.
2. **GitHub Releases** hosts the project-signed APK, SHA-256 checksums, SBOM and provenance attestation; this is the reference build.
3. Aim for a **reproducible build** so F-Droid can publish the project-signed APK (one signature lineage across GitHub and F-Droid). If that is not achievable, accept F-Droid's own signing and document that the two lineages are separate.
4. **Google Play**: upload an AAB signed with the upload key; Play App Signing re-signs for users **(verify)**, so Play installs are a separate lineage; documented plainly for users.
5. Keys are generated and backed up **offline by the owner**; CI gets only a protected-environment secret; the key fingerprint is published in `docs/signing.md`.
6. Versioning: semver via release-please; `versionCode = major*1_000_000 + minor*1_000 + patch`.
7. The server ships as a multi-arch OCI image on GHCR with the matching web build, SBOM and provenance.

## Consequences

- (+) One artifact to test; users can verify checksums and signatures; no tracking SDK debates with F-Droid.
- (+) Same source for every store simplifies support.
- (-) Reproducible builds need Gradle/NPM discipline (pinning, no timestamps) and ongoing care.
- (-) Different signature lineages between Play and the others are unavoidable; users cannot switch channels without reinstalling (export/import mitigates data loss).
- (-) Owner holds a critical secret (keystore); loss means a new app identity on Play/F-Droid.

## Alternatives considered

- **Play-only** or **GitHub-only**: simpler, but the requirement is all three.
- **Separate flavors per store** (e.g. with Play Services features): contradicts the privacy promise and F-Droid policy.
- **Let F-Droid sign everything**: easiest for F-Droid, splits lineages from GitHub; acceptable fallback.
- **Self-hosted F-Droid repo**: possible addition later for faster updates; not needed for v1.

## Verification / revisit when

Spike S8; first release candidate; each store policy change.
