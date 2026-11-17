# Contributing to Monetary

This is the single source of truth for how work is done in this repository, for people **and** AI agents
(agents also read [`AGENTS.md`](AGENTS.md), which links back here). The rules below are enforced
automatically: locally by git hooks and in CI by the **PR conventions** and **CI** workflows. If a rule
and a check disagree, the check (`scripts/commit_lint.py`) is the bug -- open a PR to fix it.

## Workflow at a glance

1. Create a branch from an up-to-date `main`: `git switch -c feat/add-budget-alerts`.
2. Make small, focused commits using the [commit format](#2-commit-messages).
3. Run the checks (`./scripts/check.sh`, and in `web/`: typecheck, lint, test, build).
4. Push and open a PR with a [conforming title](#3-pull-request-title) and
   [description](#4-pull-request-description). Never push to `main`.
5. CI must pass; a review is required; the PR is **squash-merged** and the branch is deleted.

One-time setup (installs the git hooks and the commit-message template):

```bash
python -m pip install -r backend/requirements-dev.txt
(cd web && npm ci)
pre-commit install            # installs the pre-commit, commit-msg and pre-push hooks
git config commit.template .gitmessage
```

## 1. Branch names

`<type>/<kebab-case-description>` -- lowercase letters, digits and single hyphens only.

| Good | Bad |
|---|---|
| `feat/add-budget-alerts` | `feature/add-budget-alerts` (unknown type) |
| `fix/rate-limiter-reset` | `Fix/Rate-Limiter` (uppercase) |
| `docs/api-error-contract` | `fix/rate_limiter_reset` (underscore) |
| `chore/bump-node-22` | `my-branch` (no type) |

Tool branches are exempt: `main`, `dependabot/**`, `release-please--**`. Checked by the `branch-name`
pre-push hook and by CI.

## 2. Commit messages

[Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>(<scope>): <subject>

<body: why the change is needed, and anything non-obvious about how>

<footers>
```

**Types** -- `feat` (new capability), `fix` (bug fix), `docs`, `style` (formatting only), `refactor`
(behaviour unchanged), `perf`, `test`, `build` (dependencies/packaging), `ci`, `chore` (anything else),
`revert`.

**Scopes** (optional, one of): `backend`, `web`, `api`, `db`, `config`, `ci`, `deps`, `dev`, `docs`,
`tests`, `release`, `repo`. Use the area most affected; omit the scope if the change is cross-cutting.

**Header rules** -- at most 72 characters; the subject is lowercase, imperative ("add", "fix", not
"added"/"fixes"), and has no trailing period.

**Body** -- required for `feat`, `fix`, `perf` and `refactor`; optional otherwise. Separate it from the header
with a blank line, explain **why** (the diff already shows what), and wrap at about 100 characters.

**Footers** -- one per line, after a blank line: `Refs: #123`, `Fixes: #123`.

**Breaking changes** -- put `!` after the type/scope **and** add a footer saying what breaks and how to migrate:

```text
feat(api)!: return money as integer minor units

The float "amount" field lost precision for large balances. All amounts are now
{points, major, currency} objects.

BREAKING CHANGE: clients reading `amount` as a number must read `amount.points` instead.
```

**Never** add AI or tool attribution (`Co-Authored-By: <AI>`, `Generated with ...`, session links). The
commit's author is the human who owns the change. Human co-authors (`Co-authored-by: Name <email>`) are fine.

A complete example:

```text
fix(api): keep the session alive across a password reset

Resetting a password revoked the session that performed the reset, so the very next
request returned 401 and the web app logged the user out mid-flow. Only other sessions
are revoked now.

Fixes: #42
```

Checked strictly by the `commit-message` (commit-msg) hook; CI re-checks every commit in a PR as a non-blocking
warning (squash-merge discards them, so the PR title is the gate that matters). Git-generated
`Merge ...`, `Revert "..."` and `fixup!`/`squash!` messages are allowed locally; `fixup!` commits must be
squashed before the PR is opened.

## 3. Pull request title

The PR title uses the **same format as a commit header** (`type(scope): subject`, same rules) because the PR is
squash-merged and the title becomes the commit subject on `main`. Examples:
`feat(api): add budget alerts`, `fix(web): keep the date filter after a refresh`, `chore(deps): bump vite`.

## 4. Pull request description

The description becomes the squash-commit body, so write it for the future reader of `git log`. Use the PR
template (`.github/pull_request_template.md`). CI requires these sections, and the first three must contain
real content (not just the template's comments):

| Section | What goes in it |
|---|---|
| `## Summary` | What changes and, above all, **why**. 1-3 sentences. |
| `## Changes` | Bullet list of the notable changes. |
| `## Testing` | Exactly how you verified it: commands and results. `n/a: <reason>` only for docs-only work. |
| `## Risk and rollout` | The API-contract / schema / env-var / breaking-change checkboxes. State anything operators must do. |

`## Related` (`Refs: #123`) and `## Checklist` are in the template too. If the title has `!`, the description
must contain a `BREAKING CHANGE:` line.

## 5. Merging and releases

- **Squash-merge only.** Keep the subject (the PR title) and tidy the body (the PR description).
- Releases are automated by [release-please](https://github.com/googleapis/release-please): it reads the
  Conventional Commit history on `main`, keeps a `chore(release): X.Y.Z` PR open with the version bump and the
  `CHANGELOG.md` entry, and tags the release when that PR is merged. `feat` bumps the minor version, `fix` the
  patch; while the version is `0.x`, breaking changes also bump the minor. Do not edit `CHANGELOG.md` by hand.
- The version lives in `backend/monetary/config.py` (`VERSION`) and `web/package.json`; release-please keeps them in sync.

## 6. Code standards

- **Layers (backend)**: `presentation → application → infrastructure → domain`. Routers only translate HTTP;
  business rules live in `application/` and `domain/`; all SQL lives in `infrastructure/`. The web app contains
  no ledger logic (the API computes everything). See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
- **Tests**: new behaviour comes with tests in the matching layer (`backend/tests/unit`, `service`, `infrastructure`, `api`,
  `web/src/test`). Backend coverage must stay at or above 95% (CI gate).
- **API changes**: update `docs/API.md` and `web/src/lib/api/` (services, mappers, `types/api.ts`) in the same PR.
- **Schema changes**: add a numbered migration in `backend/monetary/infrastructure/migrations.py` (never edit a released one, and keep it compatible with the previous release for one release), update `docs/LIVE_SCHEMA.sql`, and say so in the PR (`Risk and rollout`).
- **Config**: every setting is a `MONETARY_*` variable defined in `backend/monetary/config.py`, and documented in
  `backend/.env.example` and the README.
- **Dependencies**: change `backend/requirements*.txt` / `web/package.json` deliberately; let `npm` regenerate
  `package-lock.json` (never edit it by hand). CI audits both ecosystems.
- **Secrets**: never commit `.env*` (except `*.example`), databases, keys or tokens. The `detect-secrets` hook and
  CI scan for them; genuine false positives go in `.secrets.baseline` (`detect-secrets scan --baseline .secrets.baseline`).
- **Lint**: `ruff` (Python) and `oxlint` (web) run in the hooks and CI.

## 7. What CI checks

| Workflow | Check |
|---|---|
| **PR conventions** | branch name, PR title and PR description sections (blocking); commit messages (warning only) |
| **CI → Hygiene** | all pre-commit hooks (YAML/JSON, merge markers, private keys, large files, ruff, detect-secrets) |
| **CI → Backend** | compile + full test suite on Python 3.11, 3.12 and 3.13, coverage ≥ 95% |
| **CI → Frontend** | typecheck, lint, unit tests, build, live integration suite |
| **CI → Dependency audit** | `pip-audit` and `npm audit` (high severity and above) |
| **CI → CI passed** | the single required status check that aggregates the jobs above |
| **Release** | maintains the release PR and changelog |

Repository settings are not in git; they are expected to be: squash-merge only, delete branch on merge,
`main` protected (PR required, **CI passed** and **Branch, title, description, commits** required, no force-push).

## 8. License and sign-off

Monetary is licensed under the [Apache License 2.0](LICENSE). By contributing you agree that your
contribution is licensed under the same terms (Apache-2.0, section 5), and you confirm the
[Developer Certificate of Origin](https://developercertificate.org/): you wrote the change or have the right
to submit it under this license. Certify this by signing off every commit:

```bash
git commit -s          # adds: Signed-off-by: Your Name <you@example.com>
```

There is no CLA. The sign-off is expected on outside contributions; it is not yet enforced by a hook.
Do not copy code from projects with an incompatible license (GPL/AGPL, "non-commercial" or unlicensed code).
New runtime dependencies need an OSI-approved permissive license and a one-line justification in the PR.

