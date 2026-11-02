# ADR 0005: License

- Status: **Proposed** (owner decision required, Q7)
- Date: 2026-11-02
- Deciders: repository owner (copyright holder)

## Context

The repository is currently proprietary ("All rights reserved"). The goal is an open-source app distributed on F-Droid, GitHub Releases, Google Play, and later the Apple App Store.
F-Droid requires an OSI-approved license. Copyleft licenses such as GPL/AGPL are widely reported to conflict with Apple's App Store terms, which would block the planned iOS app unless the owner (as sole
copyright holder) grants additional permission **(verify against current guidance; get legal advice if choosing copyleft)**.

## Decision (recommended)

License the whole repository under **Apache-2.0**. Use the **DCO** (`Signed-off-by`) for contributions rather than a CLA. Third-party dependencies must be under an allow-listed permissive license (MP-24).
MIT is an acceptable simpler alternative if the owner does not want the explicit patent grant.

## Consequences

- (+) Compatible with F-Droid, Play and the App Store; contributors and companies can use it freely; patent grant protects users and contributors.
- (+) Simple compliance for dependencies (mostly MIT/BSD/Apache).
- (-) Others may build closed-source forks or hosted services from the code; no copyleft protection.
- (-) Relicensing later (e.g. to AGPL) would need every contributor's consent unless a CLA is used now.

## Alternatives considered

- **AGPL-3.0**: strongest protection against closed hosted forks; conflicts with App Store distribution and many corporate policies; makes iOS harder.
- **GPL-3.0**: same App Store concern; weaker network-use protection.
- **MPL-2.0**: file-level copyleft, App-Store-friendlier; more complexity; viable middle ground.
- **Source-available/proprietary**: not "open source"; excluded by F-Droid; rejected by the goal.
- **Dual license / CLA**: possible if the owner wants commercial options later; adds contributor friction.

## Verification / revisit when

Before the first public commit. Needs the owner's decision and, for relicensing existing code or choosing copyleft, legal review.
